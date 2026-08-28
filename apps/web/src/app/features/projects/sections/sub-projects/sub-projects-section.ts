import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ProjectSection, SectionConfig } from '@cwm/contracts';
import { SubProjectsStore } from './sub-projects-store';
@Component({ selector: 'app-sub-projects-section', changeDetection: ChangeDetectionStrategy.OnPush, imports: [RouterLink], providers: [SubProjectsStore], templateUrl: './sub-projects-section.html', styleUrl: './sub-projects-section.scss' })
export class SubProjectsSection {
  readonly section = input.required<ProjectSection>(); readonly onConfigChange = input.required<(config: SectionConfig) => void>(); readonly onProjectDataChange = input.required<() => void>(); readonly projectDataRevision = input.required<number>(); readonly store = inject(SubProjectsStore);
  constructor() { effect(() => void this.store.load(this.section().projectId)); }
  async create(event: SubmitEvent, input: HTMLInputElement) { event.preventDefault(); if (await this.store.create(input.value)) input.value = ''; }
}
