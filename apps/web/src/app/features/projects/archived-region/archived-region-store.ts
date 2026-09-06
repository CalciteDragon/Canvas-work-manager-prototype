import { Injectable, PendingTasks, computed, inject, signal } from '@angular/core';
import {
  nameOf,
  ownedKindOf,
  type OwnedDataKind,
  type ProjectId,
  type ProjectPageId,
  type ProjectSection,
  type Reflection,
  type ReflectionId,
  type SectionId,
  type Task,
  type TaskId,
} from '@cwm/contracts';
import { WORK_MANAGER_GATEWAY } from '../../../core/gateway/work-manager-gateway';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** An archived section, with the number of rows that came down with it. */
export interface ArchivedSectionEntry {
  readonly id: SectionId;
  readonly label: string;
  /** `undefined` for a view: it owns no rows, so `0 tasks` would be a lie rather than a count. */
  readonly rowCount: number | undefined;
  readonly ownedKind: OwnedDataKind | undefined;
  readonly archivedAt: string;
}

/** A row archived on its own, which restores on its own. */
export interface ArchivedRowEntry {
  readonly id: TaskId | ReflectionId;
  readonly kind: OwnedDataKind;
  readonly label: string;
  readonly archivedAt: string;
}

/** Newest first, with the id as the deterministic tie-break. */
const byArchivedAtDescending = <T extends { archivedAt: string; id: string }>(a: T, b: T): number =>
  a.archivedAt === b.archivedAt ? a.id.localeCompare(b.id) : b.archivedAt.localeCompare(a.archivedAt);

/**
 * State for the project canvas's Archived region: what removal took, and how to get it back.
 *
 * Project-scoped, and it reads the three collections itself with `includeArchived: true`
 * rather than reaching into the section-scoped stores — those hold *live* rows for one
 * container each, which is the opposite of what this shows. It never includes sub-project
 * data, matching every other section read.
 */
@Injectable()
export class ArchivedRegionStore {
  private readonly gateway = inject(WORK_MANAGER_GATEWAY);
  // Registered like every other feature store's reads, so SSR and tests can wait on them.
  private readonly pendingTasks = inject(PendingTasks);

  private readonly projectIdState = signal<ProjectId | null>(null);
  private readonly pageIdState = signal<ProjectPageId | null>(null);
  private readonly sectionsState = signal<ProjectSection[]>([]);
  private readonly tasksState = signal<Task[]>([]);
  private readonly reflectionsState = signal<Reflection[]>([]);
  private readonly errorState = signal<string | null>(null);
  private readonly restoringState = signal<ReadonlySet<string>>(new Set());

  private generation = 0;

  readonly error = this.errorState.asReadonly();
  readonly restoring = this.restoringState.asReadonly();

  /**
   * Archived sections, newest first, each labelled through `nameOf` — so `Backlog` stays
   * `Backlog` and an untitled Task List reads `Task List`, never a raw type or an id.
   *
   * Equal resolved names gain a local `archive 1`, `archive 2` suffix in this sorted order.
   * `SectionRemovalDialog.targetOptions` is not reusable for that: its suffix identifies a
   * *live canvas target* by position, while an archived section keeps a deliberately stale
   * position and is being identified inside this already-sorted region. Both surfaces share
   * `nameOf`; each owns only its local collision suffix.
   */
  readonly sections = computed<ArchivedSectionEntry[]>(() => {
    const archived = this.sectionsState()
      .filter((section) => section.archivedAt !== undefined)
      .sort(byArchivedAtDescending as (a: ProjectSection, b: ProjectSection) => number);
    const names = archived.map((section) => nameOf(section));
    const seen = new Map<string, number>();
    return archived.map((section, index) => {
      const name = names[index]!;
      const duplicated = names.filter((candidate) => candidate === name).length > 1;
      const ordinal = (seen.get(name) ?? 0) + 1;
      seen.set(name, ordinal);
      const ownedKind = ownedKindOf(section.type);
      return {
        id: section.id,
        label: duplicated ? `${name} (archive ${ordinal})` : name,
        ownedKind,
        rowCount: ownedKind === undefined ? undefined : this.rowsArchivedWith(section.id, ownedKind).length,
        archivedAt: section.archivedAt!,
      };
    });
  });

  /**
   * Rows archived on their own — the ones that restore on their own.
   *
   * A row qualifies when it is archived, carries no section marker, sits in a **live**
   * section, and has no archived ancestor. The ancestor walk is what keeps every offered
   * Restore executable: a child archived before its parent would be refused by the domain
   * until the parent returns, so it is hidden until then rather than offered and refused.
   */
  readonly rows = computed<ArchivedRowEntry[]>(() => {
    const liveSections = new Set(
      this.sectionsState().filter((section) => section.archivedAt === undefined).map(({ id }) => id),
    );
    const tasks = new Map(this.tasksState().map((task) => [task.id, task] as const));

    const entries: ArchivedRowEntry[] = [];
    for (const task of this.tasksState()) {
      if (task.archivedAt === undefined) continue;
      if (task.archivedWithSectionId !== undefined || task.archivedWithTaskId !== undefined) continue;
      if (!liveSections.has(task.sectionId)) continue;
      if (this.hasArchivedAncestor(task, tasks)) continue;
      entries.push({ id: task.id, kind: 'tasks', label: task.title, archivedAt: task.archivedAt });
    }
    for (const reflection of this.reflectionsState()) {
      if (reflection.archivedAt === undefined) continue;
      if (reflection.archivedWithSectionId !== undefined) continue;
      if (!liveSections.has(reflection.sectionId)) continue;
      entries.push({
        id: reflection.id,
        kind: 'reflections',
        label: reflection.title?.trim() === undefined || reflection.title.trim() === '' ? 'Reflection' : reflection.title.trim(),
        archivedAt: reflection.archivedAt,
      });
    }
    return entries.sort(byArchivedAtDescending);
  });

  /** Hidden entirely when there is nothing to undo — an empty region says nothing useful. */
  readonly empty = computed(() => this.sections().length === 0 && this.rows().length === 0);

  /**
   * The region belongs to **one canvas**, so it reads one page (§27). Home must not offer to
   * restore a section archived from another of the root's pages — the restore would land
   * somewhere the user is not looking — and a sub-project's region must not list its root's.
   *
   * The knock-on is deliberate: page-scoping the sections also narrows the containers a row
   * can be attributed to, so a row archived inside a container on another page drops out of
   * this region too. It is still undoable from the canvas that owns it, and 25.6's whole-tree
   * Archive page is what makes it findable from anywhere.
   */
  load(projectId: ProjectId, pageId: ProjectPageId): Promise<void> {
    return this.track(() => this.read(projectId, pageId));
  }

  private async read(projectId: ProjectId, pageId: ProjectPageId): Promise<void> {
    this.projectIdState.set(projectId);
    this.pageIdState.set(pageId);
    const generation = ++this.generation;
    try {
      const [sections, tasks, reflections] = await Promise.all([
        this.gateway.sections.list(projectId, { pageId, includeArchived: true }),
        this.gateway.tasks.list({ projectId, includeArchived: true }),
        this.gateway.reflections.list(projectId, { includeArchived: true }),
      ]);
      if (generation !== this.generation || this.projectIdState() !== projectId) return;
      this.sectionsState.set(sections);
      this.tasksState.set(tasks);
      this.reflectionsState.set(reflections);
      this.errorState.set(null);
    } catch (error) {
      if (generation !== this.generation || this.projectIdState() !== projectId) return;
      this.sectionsState.set([]);
      this.tasksState.set([]);
      this.reflectionsState.set([]);
      this.errorState.set(messageOf(error));
    }
  }

  /**
   * Restores a section and everything it took down. Not optimistic: the canvas has to gain a
   * whole section, which only the page can paint, so this re-reads and lets the caller
   * reconcile. A failure leaves the region exactly as it was, with the reason visible.
   */
  async restoreSection(id: SectionId): Promise<boolean> {
    return this.restoreWith(id, () => this.gateway.sections.restore(id));
  }

  async restoreRow(entry: ArchivedRowEntry): Promise<boolean> {
    return this.restoreWith(entry.id, () =>
      entry.kind === 'tasks'
        ? this.gateway.tasks.restore(entry.id as TaskId)
        : this.gateway.reflections.restore(entry.id as ReflectionId),
    );
  }

  private restoreWith(id: string, write: () => Promise<unknown>): Promise<boolean> {
    return this.track(() => this.writeAndReload(id, write));
  }

  private async writeAndReload(id: string, write: () => Promise<unknown>): Promise<boolean> {
    const projectId = this.projectIdState();
    const pageId = this.pageIdState();
    if (projectId === null || pageId === null) return false;

    this.errorState.set(null);
    this.restoringState.update((ids) => new Set([...ids, id]));
    try {
      await write();
      await this.read(projectId, pageId);
      return true;
    } catch (error) {
      this.errorState.set(messageOf(error));
      return false;
    } finally {
      this.restoringState.update((ids) => {
        const next = new Set(ids);
        next.delete(id);
        return next;
      });
    }
  }

  private track<T>(operation: () => Promise<T>): Promise<T> {
    const settled = this.pendingTasks.add();
    return operation().finally(settled);
  }

  private rowsArchivedWith(sectionId: SectionId, owned: OwnedDataKind): { id: string }[] {
    return owned === 'tasks'
      ? this.tasksState().filter((task) => task.archivedWithSectionId === sectionId)
      : this.reflectionsState().filter((reflection) => reflection.archivedWithSectionId === sectionId);
  }

  /**
   * Walks `parentTaskId` against the tasks already in hand — the region fetched every
   * current-project task, and document integrity guarantees the walk is finite and stays in
   * the same project and section.
   */
  private hasArchivedAncestor(task: Task, tasks: ReadonlyMap<TaskId, Task>): boolean {
    let parentId = task.parentTaskId;
    const seen = new Set<TaskId>([task.id]);
    while (parentId !== undefined && !seen.has(parentId)) {
      const parent = tasks.get(parentId);
      if (parent === undefined) return false;
      if (parent.archivedAt !== undefined) return true;
      seen.add(parentId);
      parentId = parent.parentTaskId;
    }
    return false;
  }
}
