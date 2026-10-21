import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { nameOf, type ProgressFormula, type ProjectSection, type SectionConfig } from '@cwm/contracts';
import { SECTION_FRAME_NAME } from '../section-frame-name';
import { ProgressStore } from './progress-store';

/** Distinguishes two Progress views over the same source on one page. */
let nextInstance = 0;

@Component({ selector: 'app-progress-section', changeDetection: ChangeDetectionStrategy.OnPush, providers: [ProgressStore], templateUrl: './progress-section.html', styleUrl: './progress-section.scss' })
export class ProgressSection {
  readonly section = input.required<ProjectSection>();
  readonly onConfigChange = input.required<(config: SectionConfig) => void>();
  readonly onProjectDataChange = input.required<() => void>();
  readonly projectDataRevision = input.required<number>();
  readonly projectHierarchyRevision = input.required<number>();
  readonly readOnly = input(false);
  readonly store = inject(ProgressStore);
  private readonly frameName = inject(SECTION_FRAME_NAME, { optional: true });
  /**
   * The bar's accessible name (slice 72, L5-004): what the frame displays, or the section's own
   * name outside a frame, with "progress" appended unless the name already says it. Never the
   * separate Rename tool.
   */
  protected readonly barName = computed(() => {
    const name = this.frameName?.() ?? nameOf(this.section());
    return /\bprogress\b/i.test(name) ? name : `${name} progress`;
  });
  /** The summary's id, per instance, so a section and its shortcut never share it. */
  protected readonly summaryId = `progress-${++nextInstance}-summary`;
  constructor() { effect(() => { void this.store.sync(this.section().projectId, this.projectDataRevision()); }); }
  async choose(formula: ProgressFormula, manual?: string): Promise<void> {
    if (this.readOnly()) return;
    const value = formula === 'manual' ? Math.max(0, Math.min(100, Number(manual ?? 0))) : undefined;
    if (await this.store.setFormula(formula, value)) this.onProjectDataChange()();
  }
}
