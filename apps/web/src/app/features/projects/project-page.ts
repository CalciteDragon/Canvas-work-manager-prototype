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
import type { ProjectId, SectionColumnSpan, SectionConfig, SectionId } from '@cwm/contracts';
import { TaskListStore } from '../tasks/task-list-store';
import { ProjectPageStore } from './project-page-store';
import { ProjectSectionFrame } from './sections/section-frame/project-section-frame';
import { SECTION_REGISTRY, definitionFor } from './sections/registry';

/**
 * §26's project page: header, then the section canvas. One plain vertical stack — §27's
 * flow/grid comparison and §32's Edit Layout Mode both arrive in Slice 9, and §26's middle
 * "Project Navigation / Controls" row waits for them, because the mode toggle and the
 * layout switch are what it exists to hold.
 *
 * **Both stores are provided here and nowhere else.** A second `TaskListStore` would give
 * the header's progress and the Task List section two different sets of tasks.
 */
@Component({
  selector: 'app-project-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkDrag, CdkDragHandle, CdkDropList, ProjectSectionFrame],
  providers: [TaskListStore, ProjectPageStore],
  templateUrl: './project-page.html',
  styleUrl: './project-page.scss',
})
export class ProjectPage {
  /** Bound from the route by `withComponentInputBinding()` (§68). */
  readonly projectId = input.required<ProjectId>();

  readonly store = inject(ProjectPageStore);
  readonly registry = SECTION_REGISTRY;
  readonly addOpen = signal(false);
  readonly canvasMounted = signal(true);
  private readonly changeDetector = inject(ChangeDetectorRef);

  constructor() {
    // Re-loads when the route changes, which sidebar navigation between projects does
    // without re-creating the component.
    effect(() => {
      const id = this.projectId();
      this.addOpen.set(false);
      void this.store.load(id);
    });
  }

  definitionFor(type: string) {
    return definitionFor(type);
  }

  toggleAdd(): void {
    this.addOpen.update((open) => !open);
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
}
