import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
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
  imports: [ProjectSectionFrame],
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
