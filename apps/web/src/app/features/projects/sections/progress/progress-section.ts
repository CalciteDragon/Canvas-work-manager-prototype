import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import type { ProgressFormula, ProjectSection, SectionConfig } from '@cwm/contracts';
import { ProgressStore } from './progress-store';

@Component({ selector: 'app-progress-section', changeDetection: ChangeDetectionStrategy.OnPush, providers: [ProgressStore], templateUrl: './progress-section.html', styleUrl: './progress-section.scss' })
export class ProgressSection {
  readonly section = input.required<ProjectSection>();
  readonly onConfigChange = input.required<(config: SectionConfig) => void>();
  readonly onProjectDataChange = input.required<() => void>();
  readonly onProjectHierarchyChange = input.required<() => void>();
  readonly projectDataRevision = input.required<number>();
  readonly projectHierarchyRevision = input.required<number>();
  readonly readOnly = input(false);
  readonly store = inject(ProgressStore);
  constructor() { effect(() => { void this.store.sync(this.section().projectId, this.projectDataRevision()); }); }
  async choose(formula: ProgressFormula, manual?: string): Promise<void> {
    if (this.readOnly()) return;
    const value = formula === 'manual' ? Math.max(0, Math.min(100, Number(manual ?? 0))) : undefined;
    if (await this.store.setFormula(formula, value)) this.onProjectDataChange()();
  }
}
