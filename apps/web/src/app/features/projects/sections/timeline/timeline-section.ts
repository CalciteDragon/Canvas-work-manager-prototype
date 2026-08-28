import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import type { ProjectSection, SectionConfig } from '@cwm/contracts';
import { TimelineStore } from './timeline-store';
@Component({ selector: 'app-timeline-section', changeDetection: ChangeDetectionStrategy.OnPush, providers: [TimelineStore], templateUrl: './timeline-section.html', styleUrl: './timeline-section.scss' })
export class TimelineSection { readonly section = input.required<ProjectSection>(); readonly onConfigChange = input.required<(config: SectionConfig) => void>(); readonly onProjectDataChange = input.required<() => void>(); readonly projectDataRevision = input.required<number>(); readonly store = inject(TimelineStore); constructor() { effect(() => void this.store.load(this.section().projectId)); } label(kind: string) { return kind === 'sub-project' ? 'Sub-project' : kind[0]!.toUpperCase() + kind.slice(1); } }
