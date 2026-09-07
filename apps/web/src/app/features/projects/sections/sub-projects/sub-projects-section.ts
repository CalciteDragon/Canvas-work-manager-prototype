import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ProjectSection, SectionConfig } from '@cwm/contracts';
import { SubProjectsStore } from './sub-projects-store';
@Component({ selector: 'app-sub-projects-section', changeDetection: ChangeDetectionStrategy.OnPush, imports: [RouterLink], providers: [SubProjectsStore], templateUrl: './sub-projects-section.html', styleUrl: './sub-projects-section.scss' })
export class SubProjectsSection {
  readonly section = input.required<ProjectSection>(); readonly onConfigChange = input.required<(config: SectionConfig) => void>(); readonly onProjectDataChange = input.required<() => void>(); readonly onProjectHierarchyChange = input.required<() => void>(); readonly projectDataRevision = input.required<number>(); readonly projectHierarchyRevision = input.required<number>(); readonly readOnly = input(false); readonly store = inject(SubProjectsStore);
  constructor() { effect(() => { this.projectHierarchyRevision(); void this.store.sync(this.section().projectId); }); }
  async create(event: SubmitEvent, input: HTMLInputElement) { event.preventDefault(); if (this.readOnly()) return; if (await this.store.create(input.value)) { input.value = ''; this.onProjectHierarchyChange()(); } }
}
