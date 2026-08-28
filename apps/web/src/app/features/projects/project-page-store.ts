import { Injectable, PendingTasks, computed, inject, signal } from '@angular/core';
import {
  SectionConfigSchema,
  type ProjectId,
  type Project,
  type ProgressResult,
  type ProjectSection,
  type SectionColumnSpan,
  type SectionConfig,
  type SectionId,
} from '@cwm/contracts';
import { WORK_MANAGER_GATEWAY } from '../../core/gateway/work-manager-gateway';
import { TaskListStore } from '../tasks/task-list-store';
import type { SectionDefinition } from './sections/registry';

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const byPosition = (a: ProjectSection, b: ProjectSection): number => a.position - b.position;

/**
 * §19's `ProjectPageStore`, feature-scoped and provided by `ProjectPage` alone (§20).
 *
 * It composes `TaskListStore` for the page's shared task data, while header progress comes
 * from the canonical §39 domain read. Task writes explicitly refresh that independent read.
 *
 * §32's `editMode` is transient page state: it changes chrome, never persistence. A route
 * change resets it so layout affordances do not leak from one project into another.
 */
@Injectable()
export class ProjectPageStore {
  private readonly gateway = inject(WORK_MANAGER_GATEWAY);
  private readonly tasks = inject(TaskListStore);
  private readonly pendingTasks = inject(PendingTasks);

  private readonly projectState = signal<Project | null>(null);
  private readonly sectionsState = signal<ProjectSection[]>([]);
  // Starts true: before the first load resolves the page has no project, no error and no
  // loading flag, which matches none of the template's branches and paints blank.
  private readonly loadingState = signal(true);
  private loadGeneration = 0;
  private readonly errorState = signal<string | null>(null);
  private readonly sectionErrorState = signal<string | null>(null);
  private readonly editModeState = signal(false);
  private readonly canvasRevisionState = signal(0);
  private readonly progressState = signal<ProgressResult | null>(null);
  private progressRefresh: Promise<void> | null = null;
  private progressRefreshQueued = false;

  readonly project = this.projectState.asReadonly();
  readonly sections = this.sectionsState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly sectionError = this.sectionErrorState.asReadonly();
  readonly editMode = this.editModeState.asReadonly();
  readonly canvasRevision = this.canvasRevisionState.asReadonly();
  readonly progressResult = this.progressState.asReadonly();

  /** The selected §39 domain result; `null` means unavailable and remains distinct from 0%. */
  readonly progress = computed<number | null>(() => this.progressState()?.percentage ?? null);

  load(projectId: ProjectId): Promise<void> {
    // Clicking project A then project B inside one round trip must not leave A's sections
    // under B's header: without this, whichever response lands last wins, per signal.
    const generation = ++this.loadGeneration;
    const current = () => generation === this.loadGeneration;
    this.editModeState.set(false);

    return this.track(async () => {
      this.loadingState.set(true);
      this.errorState.set(null);
      this.sectionErrorState.set(null);
      this.progressState.set(null);
      try {
        // Sequential on purpose: a project the caller cannot see must fail as "not found"
        // rather than racing a section list that would report the same thing less clearly.
        const project = await this.gateway.projects.get(projectId);
        const sections = await this.gateway.sections.list(projectId);
        if (!current()) return;
        this.projectState.set(project);
        this.sectionsState.set([...sections].sort(byPosition));
      } catch (error) {
        if (!current()) return;
        this.projectState.set(null);
        this.sectionsState.set([]);
        this.errorState.set(messageOf(error));
      } finally {
        // The task load is inside the loading window: leaving it outside made the header
        // paint "Not available" for a frame before the real percentage arrived.
        if (current()) {
          // Task and canonical progress reads fail independently: either feature can still
          // render its own answer when the other request fails.
          await Promise.all([this.tasks.load(projectId), this.refreshProgressFor(projectId, generation)]);
          if (current()) this.loadingState.set(false);
        }
      }
    });
  }

  refreshProgress(): Promise<void> {
    if (this.progressRefresh !== null) {
      this.progressRefreshQueued = true;
      return this.progressRefresh;
    }
    const projectId = this.projectState()?.id;
    if (projectId === undefined) return Promise.resolve();
    const generation = this.loadGeneration;
    this.progressRefresh = this.track(async () => {
      do {
        this.progressRefreshQueued = false;
        await this.refreshProgressFor(projectId, generation);
      } while (this.progressRefreshQueued && generation === this.loadGeneration);
    }).finally(() => {
      this.progressRefresh = null;
    });
    return this.progressRefresh;
  }

  private async refreshProgressFor(projectId: ProjectId, generation: number): Promise<void> {
    try {
      const result = await this.gateway.progress.get(projectId);
      if (generation === this.loadGeneration && this.projectState()?.id === projectId) this.progressState.set(result);
    } catch {
      if (generation === this.loadGeneration && this.projectState()?.id === projectId) this.progressState.set(null);
    }
  }

  /** §26's Quick Add. The registry's default config is what reaches persistence. */
  addSection(definition: SectionDefinition): Promise<boolean> {
    const projectId = this.projectState()?.id;
    if (projectId === undefined) return Promise.resolve(false);
    return this.mutate(async ({ current }) => {
      // Parsed, not cast: §29 types `createDefaultConfig` as `unknown`, and a definition
      // that returns a non-object should fail here rather than at the host.
      const config = SectionConfigSchema.parse(definition.createDefaultConfig());
      const created = await this.gateway.sections.create(projectId, {
        type: definition.type,
        config,
      });
      if (!current()) return;
      this.sectionsState.update((sections) => [...sections, created].sort(byPosition));
    });
  }

  setCollapsed(id: SectionId, collapsed: boolean): Promise<boolean> {
    return this.updateSection(id, { collapsed });
  }

  setEditMode(editing: boolean): void {
    this.editModeState.set(editing);
  }

  /**
   * CDK owns pointer sorting; the domain owns persisted sibling positions. In mixed grid
   * orientation CDK moves DOM nodes directly, so failure emits a fresh canonical array to
   * make Angular restore the stored order even though the entity values did not change.
   */
  moveSection(id: SectionId, position: number): Promise<boolean> {
    const project = this.projectState();
    if (project === null) return Promise.resolve(false);

    const before = this.sectionsState();
    const from = before.findIndex((section) => section.id === id);
    if (from < 0) return Promise.resolve(false);
    if (from === position) return Promise.resolve(true);

    const generation = this.loadGeneration;
    const current = () =>
      generation === this.loadGeneration && this.projectState()?.id === project.id;

    // CDK's mixed strategy has already moved the actual DOM. Mirror that order in the
    // signal immediately so Angular's logical view order matches what CDK rendered. If the
    // host rejects the move, changing from this preview back to `before` gives Angular a
    // real ordering delta and it can restore the DOM rather than leaving CDK's move behind.
    const preview = [...before];
    const [moved] = preview.splice(from, 1);
    if (moved !== undefined)
      preview.splice(Math.max(0, Math.min(position, preview.length)), 0, moved);
    // Reordering the render array is enough to align Angular with CDK. Keep every persisted
    // `position` untouched: sibling renumbering belongs to SectionService alone.
    this.sectionsState.set(preview);

    return this.track(async () => {
      if (current()) this.sectionErrorState.set(null);
      try {
        await this.gateway.sections.move(id, { position });
        if (!current()) return true;

        // The preview remains visibly successful if the follow-up read fails. It is a
        // rendering order, not a second implementation of domain validation.
        await this.reconcileSections(project.id, generation);
        return true;
      } catch (error) {
        if (current()) {
          this.sectionsState.set([...before]);
          // Mixed-orientation CDK sorting moves DOM nodes itself. Changing the track key
          // makes Angular recreate the wrappers in canonical order after a rejected write.
          this.canvasRevisionState.update((revision) => revision + 1);
          this.sectionErrorState.set(messageOf(error));
        }
        return false;
      }
    });
  }

  setColumnSpan(id: SectionId, columnSpan: SectionColumnSpan): Promise<boolean> {
    return this.updateSection(id, { columnSpan });
  }

  updateConfig(id: SectionId, config: SectionConfig): Promise<boolean> {
    return this.updateSection(id, { config });
  }

  duplicateSection(id: SectionId): Promise<boolean> {
    return this.mutate(async ({ current, projectId, generation }) => {
      const copy = await this.gateway.sections.duplicate(id);
      if (!current()) return;
      // Insert only into the render order, then reconcile. The domain has already
      // renumbered siblings, but only the returned copy is authoritative here; changing
      // every sibling's persisted `position` would duplicate SectionService's rule.
      this.sectionsState.update((sections) => {
        const preview = [...sections];
        preview.splice(Math.max(0, Math.min(copy.position, preview.length)), 0, copy);
        return preview;
      });
      await this.reconcileSections(projectId, generation);
    });
  }

  removeSection(id: SectionId): Promise<boolean> {
    return this.mutate(async ({ current, projectId, generation }) => {
      await this.gateway.sections.remove(id);
      if (!current()) return;
      // Removing the render item is safe; filling the persisted position gap belongs to
      // SectionService and arrives through the authoritative re-read below.
      this.sectionsState.update((sections) => sections.filter((section) => section.id !== id));
      await this.reconcileSections(projectId, generation);
    });
  }

  private updateSection(
    id: SectionId,
    input: Parameters<typeof this.gateway.sections.update>[1],
  ): Promise<boolean> {
    return this.mutate(async ({ current }) => {
      const updated = await this.gateway.sections.update(id, input);
      if (!current()) return;
      this.sectionsState.update((sections) =>
        sections.map((section) => (section.id === id ? updated : section)).sort(byPosition),
      );
    });
  }

  /**
   * The canvas is left exactly as it was when a write fails, with the reason visible. A
   * silent failure on a remove or a config save is the one that costs the user work.
   */
  private mutate(
    operation: (context: {
      current: () => boolean;
      projectId: ProjectId;
      generation: number;
    }) => Promise<void>,
  ): Promise<boolean> {
    const projectId = this.projectState()?.id;
    if (projectId === undefined) return Promise.resolve(false);
    const generation = this.loadGeneration;
    const current = () =>
      generation === this.loadGeneration && this.projectState()?.id === projectId;

    return this.track(async () => {
      if (current()) this.sectionErrorState.set(null);
      try {
        await operation({ current, projectId, generation });
        return true;
      } catch (error) {
        if (current()) this.sectionErrorState.set(messageOf(error));
        return false;
      }
    });
  }

  /**
   * Re-reads the canvas after a successful write, and **swallows its own failure**. The
   * write already landed; reporting a failed re-read as a failed write would tell the user
   * their remove did not happen and invite them to click it again, which answers 404. The
   * render-only update above is close enough to live with until the next load. Persisted
   * sibling positions remain untouched unless they came from the host.
   */
  private async reconcileSections(
    projectId = this.projectState()?.id,
    generation = this.loadGeneration,
  ): Promise<void> {
    if (projectId === undefined) return;
    try {
      const sections = await this.gateway.sections.list(projectId);
      if (generation === this.loadGeneration && this.projectState()?.id === projectId) {
        this.sectionsState.set([...sections].sort(byPosition));
      }
    } catch {
      // Deliberately ignored — see above.
    }
  }

  private track<T>(operation: () => Promise<T>): Promise<T> {
    const settled = this.pendingTasks.add();
    return operation().finally(settled);
  }
}
