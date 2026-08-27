import type { Type } from '@angular/core';
import { RichTextSection } from './rich-text/rich-text-section';
import { richTextDefaultConfig } from './rich-text/rich-text-config';
import { TaskListSection } from './tasks/task-list-section';

/**
 * §29, verbatim. `createDefaultConfig` returns `unknown` because only the definition knows
 * its section's shape — the caller that persists it parses the result through
 * `SectionConfigSchema`, which is the one place a non-object default would fail loudly.
 */
export interface SectionDefinition {
  type: string;
  displayName: string;
  icon: string;

  createDefaultConfig(): unknown;

  component: Type<unknown>;

  inspectorComponent?: Type<unknown>;
}

/**
 * §30's list, two entries in. **Adding a section type is this file's only line of change**
 * plus the type's own folder — that claim is what §30 asks the prototype to prove, so
 * nothing type-specific belongs anywhere else.
 *
 * `type` values match what the seeds and `data.json` already write, so a registry rename is
 * a data migration and not a free choice.
 */
export const SECTION_REGISTRY: readonly SectionDefinition[] = [
  {
    type: 'rich-text',
    displayName: 'Rich Text',
    icon: '📝',
    createDefaultConfig: richTextDefaultConfig,
    component: RichTextSection,
  },
  {
    type: 'task-list',
    displayName: 'Task List',
    icon: '✅',
    createDefaultConfig: () => ({}),
    component: TaskListSection,
  },
];

/**
 * `undefined` for a type nothing registers. That is a real state, not a defensive one:
 * `data.json` is hand-editable and outlives any one registry, so the canvas has to render
 * *something* for a section it cannot build — see `ProjectPage`'s fallback.
 */
export const definitionFor = (type: string): SectionDefinition | undefined =>
  SECTION_REGISTRY.find((definition) => definition.type === type);
