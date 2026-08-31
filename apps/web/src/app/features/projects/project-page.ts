import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import type {
  ProjectId,
  ProjectLayoutMode,
  SectionColumnSpan,
  SectionConfig,
  SectionId,
} from '@cwm/contracts';
import { PrototypeSettings } from '../../core/config/prototype-settings';
import { TaskListStore } from '../tasks/task-list-store';
import { ProjectMoreMenu, type SettableProjectStatus } from './project-more-menu';
import { ProjectPageStore } from './project-page-store';
import { ProjectSectionFrame } from './sections/section-frame/project-section-frame';
import { ProgressStore } from './sections/progress/progress-store';
import { SECTION_REGISTRY, definitionFor } from './sections/registry';

/**
 * §26's project page: header, then the section canvas. One plain vertical stack — §27's
 * flow/grid comparison and §32's Edit Layout Mode both arrive in Slice 9, and §26's middle
 * "Project Navigation / Controls" row waits for them, because the mode toggle and the
 * layout switch are what it exists to hold.
 *
 * Shared-data section stores are page-scoped: duplicate Task List or Progress sections must
 * show one project answer rather than drifting as independent component instances.
 */
@Component({
  selector: 'app-project-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkDrag, CdkDragHandle, CdkDropList, ProjectMoreMenu, ProjectSectionFrame],
  providers: [TaskListStore, ProgressStore, ProjectPageStore],
  templateUrl: './project-page.html',
  styleUrl: './project-page.scss',
  // Both popovers close on Escape from anywhere on the page, which is what a menu opened
  // with the pointer needs — the keystroke rarely lands inside the menu itself.
  host: { '(document:keydown.escape)': 'closeMenus()' },
})
export class ProjectPage {
  /** Bound from the route by `withComponentInputBinding()` (§68). */
  readonly projectId = input.required<ProjectId>();

  readonly store = inject(ProjectPageStore);
  readonly registry = SECTION_REGISTRY;
  readonly addOpen = signal(false);
  readonly moreOpen = signal(false);
  readonly canvasMounted = signal(true);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly settings = inject(PrototypeSettings);
  private readonly router = inject(Router);

  /**
   * §28's mode, gated by §47's `gridProjectLayout`. The project keeps whatever it has
   * stored — the flag decides what is *rendered*, so turning grid off is a rendering
   * experiment rather than a data migration, and turning it back on restores the project's
   * own choice.
   */
  layoutMode(mode: ProjectLayoutMode): ProjectLayoutMode {
    return this.settings.flags().gridProjectLayout ? mode : 'flow';
  }

  constructor() {
    // Re-loads when the route changes, which sidebar navigation between projects does
    // without re-creating the component.
    effect(() => {
      const id = this.projectId();
      this.addOpen.set(false);
      this.closeMore();
      void this.store.load(id);
    });
  }

  definitionFor(type: string) {
    return definitionFor(type);
  }

  // Quick add and More render popovers into the same header row, so opening either closes
  // the other rather than letting the two overlap.
  toggleAdd(): void {
    const open = !this.addOpen();
    this.addOpen.set(open);
    if (open) this.closeMore();
  }

  toggleMore(): void {
    const open = !this.moreOpen();
    this.moreOpen.set(open);
    if (open) this.addOpen.set(false);
  }

  closeMenus(): void {
    this.addOpen.set(false);
    this.closeMore();
  }

  private closeMore(): void {
    this.moreOpen.set(false);
  }

  rename(name: string): void {
    this.closeMore();
    void this.store.rename(name);
  }

  setStatus(status: SettableProjectStatus): void {
    this.closeMore();
    void this.store.setStatus(status);
  }

  setTargetDate(targetDate: string | null): void {
    this.closeMore();
    void this.store.setTargetDate(targetDate);
  }

  /**
   * §19: the store decided, the page navigates. A refusal leaves the user where they are,
   * with the domain's own reason in the header.
   */
  async confirmArchive(): Promise<void> {
    const archived = await this.store.archive();
    if (!archived) return;
    this.closeMore();
    await this.router.navigate(['/app']);
  }

  toggleEditMode(): void {
    const editing = !this.store.editMode();
    this.store.setEditMode(editing);
    if (!editing) this.addOpen.set(false);
  }

  async drop(event: CdkDragDrop<unknown>): Promise<void> {
    const droppedProjectId = this.store.project()?.id;
    const persisted = await this.store.moveSection(
      event.item.data as SectionId,
      event.currentIndex,
    );
    if (!persisted && this.store.project()?.id === droppedProjectId) {
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
    void this.store.refreshProgress();
  }

  projectHierarchyChanged(): void {
    this.store.notifyProjectHierarchyChanged();
  }
}
