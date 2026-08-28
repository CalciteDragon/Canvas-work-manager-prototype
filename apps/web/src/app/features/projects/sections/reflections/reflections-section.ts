import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import type { ProjectSection, ReflectionId, SectionConfig } from '@cwm/contracts';
import { ReflectionsStore } from './reflections-store';
@Component({ selector: 'app-reflections-section', changeDetection: ChangeDetectionStrategy.OnPush, providers: [ReflectionsStore], templateUrl: './reflections-section.html', styleUrl: './reflections-section.scss' })
export class ReflectionsSection {
  readonly section = input.required<ProjectSection>(); readonly onConfigChange = input.required<(config: SectionConfig) => void>(); readonly onProjectDataChange = input.required<() => void>(); readonly store = inject(ReflectionsStore); readonly editing = signal<ReflectionId | null>(null);
  readonly prompts = ['What changed?', 'What went well?', "What's blocked?", 'What should happen next?'];
  constructor() { effect(() => void this.store.load(this.section().projectId)); }
  async create(event: SubmitEvent, body: HTMLTextAreaElement, title: HTMLInputElement, prompt: HTMLSelectElement) { event.preventDefault(); if (await this.store.create(body.value, title.value, prompt.value)) { body.value = ''; title.value = ''; prompt.value = ''; } }
}
