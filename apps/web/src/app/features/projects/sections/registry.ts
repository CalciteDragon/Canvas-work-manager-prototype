import type { Type } from '@angular/core';
import { sectionKindOf, type SectionKind } from '@cwm/contracts';
import type { SectionContentComponent } from './section-contract';
import { RichTextSection } from './rich-text/rich-text-section';
import { richTextDefaultConfig } from './rich-text/rich-text-config';
import { TaskListSection } from './tasks/task-list-section';
import { ProgressSection } from './progress/progress-section';
import { ReflectionsSection } from './reflections/reflections-section';
import { SubProjectsSection } from './sub-projects/sub-projects-section';
import { TimelineSection } from './timeline/timeline-section';
import { RecentActivitySection } from './activity/recent-activity-section';

/**
 * §29, verbatim. `createDefaultConfig` returns `unknown` because only the definition knows
 * its section's shape — the caller that persists it parses the result through
 * `SectionConfigSchema`, which is the one place a non-object default would fail loudly.
 */
export interface SectionDefinition {
  type: string;
  displayName: string;
  icon: string;

  /**
   * Whether this type **owns** the rows it renders. Read from `SECTION_OWNERSHIP` in
   * contracts rather than written here: `SectionService` needs the same answer and cannot
   * import from `apps/web`, and two hand-written copies would be one drift away from a
   * container that removes rows the canvas thinks it only views.
   */
  kind: SectionKind;

  createDefaultConfig(): unknown;

  /**
   * §29 writes `Type<unknown>`. Narrowed to the content contract, because an unknown here
   * would let a section be registered without the inputs the frame sets — a failure that
   * would otherwise surface only when someone opened the page.
   */
  component: Type<SectionContentComponent>;

  inspectorComponent?: Type<SectionContentComponent>;
}

/**
 * §30's list. **Adding a section type is one line here plus the type's own folder** — that
 * claim is what §30 asks the prototype to prove, so nothing type-specific belongs anywhere
 * else. Two conditional costs in `packages/contracts/src/section.ts` have since been
 * measured and are recorded rather than argued away: a *container* needs an entry in
 * `SECTION_OWNERSHIP`, and a type whose display name the derivation cannot produce needs one
 * in `SECTION_DISPLAY_NAMES` (`sub-projects` is the only one today). `registry.spec.ts`
 * fails when this file and that derivation disagree, so the second cost is paid at the
 * moment it is incurred rather than discovered later in a dialog.
 *
 * `type` values match what the seeds and `data.json` already write, so a registry rename is
 * a data migration and not a free choice.
 */
export const SECTION_REGISTRY: readonly SectionDefinition[] = [
  {
    type: 'rich-text',
    displayName: 'Rich Text',
    icon: '📝',
    kind: sectionKindOf('rich-text'),
    createDefaultConfig: richTextDefaultConfig,
    component: RichTextSection,
  },
  {
    type: 'task-list',
    displayName: 'Task List',
    icon: '✅',
    kind: sectionKindOf('task-list'),
    createDefaultConfig: () => ({}),
    component: TaskListSection,
  },
  { type: 'sub-projects', kind: sectionKindOf('sub-projects'), displayName: 'Sub-Projects', icon: '🗂️', createDefaultConfig: () => ({}), component: SubProjectsSection },
  { type: 'progress', kind: sectionKindOf('progress'), displayName: 'Progress', icon: '📈', createDefaultConfig: () => ({}), component: ProgressSection },
  { type: 'reflections', kind: sectionKindOf('reflections'), displayName: 'Reflections', icon: '💭', createDefaultConfig: () => ({}), component: ReflectionsSection },
  { type: 'timeline', kind: sectionKindOf('timeline'), displayName: 'Timeline', icon: '🗓️', createDefaultConfig: () => ({}), component: TimelineSection },
  { type: 'recent-activity', kind: sectionKindOf('recent-activity'), displayName: 'Recent Activity', icon: '📜', createDefaultConfig: () => ({}), component: RecentActivitySection },
];

/**
 * `undefined` for a type nothing registers. That is a real state, not a defensive one:
 * `data.json` is hand-editable and outlives any one registry, so the canvas has to render
 * *something* for a section it cannot build — see `ProjectPage`'s fallback.
 */
export const definitionFor = (type: string): SectionDefinition | undefined =>
  SECTION_REGISTRY.find((definition) => definition.type === type);
