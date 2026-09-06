import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type {
  ProjectId,
  ProjectLayoutMode,
  ProjectPageId,
  SectionColumnSpan,
  SectionConfig,
  SectionId,
} from '@cwm/contracts';
import { PrototypeSettings } from '../../core/config/prototype-settings';
import { ArchivedRegion } from './archived-region/archived-region';
import { ProjectPageStore } from './project-page-store';
import { SectionRemovalDialog } from './section-removal-dialog';
import { ProjectSectionFrame } from './sections/section-frame/project-section-frame';
import { ProgressStore } from './sections/progress/progress-store';
import { SECTION_REGISTRY, definitionFor } from './sections/registry';

/**
 * §27's section canvas, for **one page**: the controls row, the drag-drop canvas, the
 * Archived region and the removal dialog. It is the renderer for a root's Home and for a
 * sub-project's sole work canvas, which after §26 are the same component — the two kinds
 * differ in their *header*, and the header belongs to `ProjectWorkspaceShell`.
 *
 * It is mounted through `NgComponentOutlet`, which binds **inputs only**. The two ways the
 * canvas has to tell the shell something — progress may have moved, the work hierarchy may
 * have moved — therefore arrive as callback inputs with stable identity, exactly as
 * `ProjectSectionFrame` hands callbacks to its content components.
 *
 * Section stores follow ownership. `ProgressStore` stays canvas-scoped — progress is a *view*
 * over the whole project, and two Progress sections must show one answer. Task List and
 * Reflections are **containers**: each provides its own store, because two of them hold
 * different rows by design (docs/decisions/2026-09-sections-own-their-data.md).
 */
@Component({
  selector: 'app-project-canvas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ArchivedRegion, CdkDrag, CdkDragHandle, CdkDropList, ProjectSectionFrame, SectionRemovalDialog],
  providers: [ProgressStore, ProjectPageStore],
  templateUrl: './project-canvas.html',
  styleUrl: './project-canvas.scss',
  // Quick Add's menu closes on Escape from anywhere on the canvas, which is what a menu
  // opened with the pointer needs — the keystroke rarely lands inside the menu itself. The
  // More menu declares its own, in the header that owns it.
  host: { '(document:keydown.escape)': 'closeAdd()' },
})
export class ProjectCanvas {
  readonly projectId = input.required<ProjectId>();
  /** §27: a canvas is a page. Every read and write this store makes names it. */
  readonly pageId = input.required<ProjectPageId>();
  readonly projectLayoutMode = input.required<ProjectLayoutMode>();
  /** Whether the Archived region may offer a Restore at all — the shell knows, not the canvas. */
  readonly restoreBlocked = input<boolean>(false);
  /** Progress may have moved. Called, not emitted: `NgComponentOutlet` has no output API. */
  readonly onProjectDataChange = input<() => void>(() => {});
  /** The work hierarchy may have moved — a Sub-Projects section created a child. */
  readonly onProjectHierarchyChange = input<() => void>(() => {});

  readonly store = inject(ProjectPageStore);
  readonly registry = SECTION_REGISTRY;
  readonly addOpen = signal(false);
  readonly canvasMounted = signal(true);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly settings = inject(PrototypeSettings);

  /**
   * §28's mode, gated by §47's `gridProjectLayout`. The project keeps whatever it has
   * stored — the flag decides what is *rendered*, so turning grid off is a rendering
   * experiment rather than a data migration, and turning it back on restores the project's
   * own choice.
   */
  readonly layoutMode = computed<ProjectLayoutMode>(() =>
    this.settings.flags().gridProjectLayout ? this.projectLayoutMode() : 'flow',
  );

  constructor() {
    // Re-loads when the page changes, which the column does without re-creating this
    // component, and which the shell also does when the route moves to another project.
    effect(() => {
      const projectId = this.projectId();
      const pageId = this.pageId();
      this.addOpen.set(false);
      void this.store.load(projectId, pageId);
    });
  }

  definitionFor(type: string) {
    return definitionFor(type);
  }

  toggleAdd(): void {
    this.addOpen.update((open) => !open);
  }

  closeAdd(): void {
    this.addOpen.set(false);
  }

  toggleEditMode(): void {
    const editing = !this.store.editMode();
    this.store.setEditMode(editing);
    if (!editing) this.addOpen.set(false);
  }

  async drop(event: CdkDragDrop<unknown>): Promise<void> {
    const droppedPageId = this.pageId();
    const persisted = await this.store.moveSection(
      event.item.data as SectionId,
      event.currentIndex,
    );
    if (!persisted && this.pageId() === droppedPageId) {
      // Mixed-orientation CDK moves DOM nodes directly. A rejected write must destroy that
      // physical order before recreating the canvas from the canonical store array.
      this.canvasMounted.set(false);
      this.changeDetector.detectChanges();
      this.canvasMounted.set(true);
      this.changeDetector.detectChanges();
    }
  }

  async add(type: string): Promise<void> {
    const definition = definitionFor(type);
    if (definition === undefined) return;
    await this.store.addSection(definition);
    this.addOpen.set(false);
  }

  /**
   * Both halves of §31's remove, once the dialog has asked which one the user meant.
   * `cascade` archives the section **and** its rows — undoable from Archived, in one click —
   * and `reassign` hands the rows to another container of the same type, then archives the
   * emptied section.
   */
  cascadeAndRemove(id: SectionId): void {
    void this.store.removeSection(id, { policy: 'cascade' });
  }

  reassignAndRemove(id: SectionId, reassignToSectionId: SectionId): void {
    void this.store.removeSection(id, { policy: 'reassign', reassignToSectionId });
  }

  renameSection(event: { id: SectionId; title: string | null }): void {
    void this.store.renameSection(event.id, event.title);
  }

  collapse(event: { id: SectionId; collapsed: boolean }): void {
    void this.store.setCollapsed(event.id, event.collapsed);
  }

  resize(event: { id: SectionId; columnSpan: SectionColumnSpan }): void {
    void this.store.setColumnSpan(event.id, event.columnSpan);
  }

  saveConfig(event: { id: SectionId; config: SectionConfig }): void {
    void this.store.updateConfig(event.id, event.config);
  }

  projectDataChanged(): void {
    this.store.notifyProjectDataChanged();
    this.onProjectDataChange()();
  }

  projectHierarchyChanged(): void {
    this.store.notifyProjectHierarchyChanged();
    this.onProjectHierarchyChange()();
  }
}
