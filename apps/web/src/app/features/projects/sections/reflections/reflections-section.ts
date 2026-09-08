import { ChangeDetectionStrategy, Component, ViewChild, effect, inject, input, signal } from '@angular/core';
import type { ProjectSection, ReflectionId, SectionConfig } from '@cwm/contracts';
import { ReflectionComposer, type ReflectionDraft } from './reflection-composer';
import { ReflectionsStore } from './reflections-store';
@Component({ selector: 'app-reflections-section', changeDetection: ChangeDetectionStrategy.OnPush, imports: [ReflectionComposer], providers: [ReflectionsStore], templateUrl: './reflections-section.html', styleUrl: './reflections-section.scss' })
export class ReflectionsSection {
  readonly section = input.required<ProjectSection>(); readonly onConfigChange = input.required<(config: SectionConfig) => void>(); readonly onProjectDataChange = input.required<() => void>(); readonly onProjectHierarchyChange = input.required<() => void>(); readonly projectDataRevision = input.required<number>(); readonly projectHierarchyRevision = input.required<number>(); readonly readOnly = input(false); readonly store = inject(ReflectionsStore); readonly editing = signal<ReflectionId | null>(null);
  readonly prompts = ['What changed?', 'What went well?', "What's blocked?", 'What should happen next?'];
  @ViewChild(ReflectionComposer) private composer?: ReflectionComposer;
  constructor() { effect(() => { this.projectDataRevision(); void this.store.sync(this.section()); }); }
  async create(draft: ReflectionDraft) { if (this.readOnly()) return; if (await this.store.create(draft.body, draft.title, draft.prompt)) { this.composer?.clear(); this.onProjectDataChange()(); } }
}
