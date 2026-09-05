import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import {
  ActivityFeedEntrySchema,
  DashboardWidgetSchema,
  ProjectSchema,
  ProjectSectionSchema,
  TaskSchema,
  type ActivityFeedEntry,
  type DashboardResult,
  type DashboardWidget,
  type Project,
  type ProjectSection,
  type SectionConfig,
  type Task,
} from '@cwm/contracts';
import type { ProjectTreeNode } from '../../core/shell/shell-store';
import type { SectionDefinition } from '../../features/projects/sections/registry';

/**
 * Everything the catalogue renders, as plain contract objects. **Parsed, not cast**: a
 * fixture the real host could never produce would let the lab show a component in a state
 * the application cannot reach.
 *
 * The lab injects no gateway and reaches no host, which is what makes it a *design* page.
 */
const AT = '2026-08-27T16:00:00.000Z';

export const labTask = (overrides: Record<string, unknown> = {}): Task =>
  TaskSchema.parse({
    id: 'task-lab',
    projectId: 'project-lab',
    sectionId: 'section-lab-tasks',
    title: 'Draft the launch announcement',
    status: 'todo',
    priority: 'medium',
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  });

export const labProject = (overrides: Record<string, unknown> = {}): Project =>
  ProjectSchema.parse({
    id: 'project-lab',
    workspaceId: 'workspace-lab',
    kind: 'root',
    name: 'Website launch',
    icon: '🚀',
    status: 'active',
    targetDate: '2026-09-30',
    projectLayoutMode: 'flow',
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  });

export const labSection = (overrides: Record<string, unknown> = {}): ProjectSection =>
  ProjectSectionSchema.parse({
    id: 'section-lab',
    projectId: 'project-lab',
    pageId: 'page-project-lab',
    type: 'design-lab-stub',
    position: 0,
    columnSpan: 12,
    collapsed: false,
    config: { state: 'content' },
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  });

export const labWidget = (overrides: Record<string, unknown> = {}): DashboardWidget =>
  DashboardWidgetSchema.parse({
    id: 'widget-lab',
    type: 'fun_fact',
    position: 0,
    size: 'small',
    config: {},
    hidden: false,
    ...overrides,
  });

export const labActivity = (): ActivityFeedEntry[] => [
  ActivityFeedEntrySchema.parse({
    id: 'activity-1',
    workspaceId: 'workspace-lab',
    actor: 'agent',
    actorAgentConnectionId: 'agent-connection-claude',
    actorName: 'Claude',
    action: 'task.created',
    entityType: 'task',
    entityId: 'task-lab',
    entityTitle: 'Draft the launch announcement',
    projectId: 'project-lab',
    projectName: 'Website launch',
    summary: 'Claude created “Draft the launch announcement”',
    createdAt: AT,
  }),
  ActivityFeedEntrySchema.parse({
    id: 'activity-2',
    workspaceId: 'workspace-lab',
    actor: 'user',
    actorUserId: 'user-lab',
    actorName: 'Demo User',
    action: 'task.completed',
    entityType: 'task',
    entityId: 'task-done',
    entityTitle: 'Book the venue',
    projectId: 'project-lab',
    projectName: 'Website launch',
    summary: 'Demo User completed “Book the venue”',
    createdAt: AT,
  }),
];

export const labProjectTree = (): ProjectTreeNode[] => [
  {
    project: labProject(),
    children: [{ project: labProject({ id: 'project-lab-child', name: 'Copy review', icon: '📝' }), children: [] }],
  },
];

export const labDashboard = (): DashboardResult => ({
  generatedAt: AT,
  today: { date: '2026-08-27', overdue: [], dueToday: [], inProgress: [] },
  upcoming: { days: 7, throughDate: '2026-09-03', tasks: [] },
  activeProjects: [],
  recentProgress: { days: 7, sinceDate: '2026-08-21', tasks: [] },
  dailyDigest: { lines: ['One task is due today.'], source: 'prototype', generatedAt: AT },
  funFact: 'Writing a task down makes you roughly twice as likely to finish it.',
  recentAgentActivity: [],
});

/** The three states every live panel is asked to show (§67). */
export type StubSectionState = 'content' | 'empty' | 'loading' | 'error';

/**
 * The section content the lab and the story set both render.
 *
 * A *real* registry definition's content component injects a store which injects the
 * gateway, so rendering one here would make "the Design Lab injects no gateway" false. This
 * stub declares the six members `SectionContentComponent` requires and injects nothing.
 */
@Component({
  selector: 'app-design-lab-stub-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .stub {
      display: grid;
      gap: var(--space-2);
      color: var(--color-text-muted);
    }
    .stub__body {
      color: var(--color-text);
    }
  `,
  template: `
    <div class="stub" [attr.data-stub-state]="state()">
      @switch (state()) {
        @case ('empty') {
          <p>Nothing here yet.</p>
        }
        @case ('loading') {
          <p>Loading…</p>
        }
        @case ('error') {
          <p role="alert">The prototype host is not running.</p>
        }
        @default {
          <p class="stub__body">Real content sits here in a real section.</p>
        }
      }
    </div>
  `,
})
export class StubSectionContent {
  readonly section = input.required<ProjectSection>();
  readonly onConfigChange = input<(config: SectionConfig) => void>();
  readonly onProjectDataChange = input<() => void>();
  readonly onProjectHierarchyChange = input<() => void>();
  readonly projectDataRevision = input(0);
  readonly projectHierarchyRevision = input(0);

  protected state(): StubSectionState {
    const config = this.section().config as { state?: StubSectionState };
    return config.state ?? 'content';
  }
}

/** The definition the frame is handed. Shared by the Design Lab panel and the story set. */
export const stubSectionDefinition = (): SectionDefinition => ({
  type: 'design-lab-stub',
  // Unregistered in `SECTION_OWNERSHIP`, so a view — a stub owns nothing.
  kind: 'view',
  displayName: 'Section',
  icon: '🧱',
  createDefaultConfig: () => ({ state: 'content' }),
  component: StubSectionContent,
});
