import type { Meta, StoryObj } from '@storybook/angular-vite';
import { applicationConfig, moduleMetadata } from '@storybook/angular-vite';
import { provideRouter } from '@angular/router';
import {
  ProjectSectionSchema,
  TaskSchema,
  type ProjectId,
  type ProjectPageId,
  type ProjectSection,
  type Task,
} from '@cwm/contracts';
import { FakeWorkManagerGateway } from '../../core/gateway/testing/fake-gateway';
import { WORK_MANAGER_GATEWAY } from '../../core/gateway/work-manager-gateway';
import { ProjectCanvas } from './project-canvas';

const PROJECT = 'project-story' as ProjectId;
const PAGE = 'page-story' as ProjectPageId;
const AT = '2026-09-05T10:00:00.000Z';

const section = (id: string, type: string, position: number, columnSpan = 12): ProjectSection =>
  ProjectSectionSchema.parse({
    id,
    projectId: PROJECT,
    pageId: PAGE,
    type,
    position,
    columnSpan,
    collapsed: false,
    config: type === 'rich-text' ? { text: 'Kitchen first, garden in the spring.' } : {},
    createdAt: AT,
    updatedAt: AT,
  });

const task = (id: string, status: 'todo' | 'done'): Task =>
  TaskSchema.parse({
    id,
    projectId: PROJECT,
    sectionId: 'section-tasks',
    title: status === 'done' ? 'Confirm the budget' : 'Book the fitter',
    status,
    priority: 'medium',
    completedAt: status === 'done' ? AT : undefined,
    createdAt: AT,
    updatedAt: AT,
  });

const canvas = (sections: ProjectSection[]) => [
  // Split in two because `provideRouter` returns `EnvironmentProviders`, which only
  // `applicationConfig` accepts — a Sub-Projects section's links need the router.
  applicationConfig({ providers: [provideRouter([])] }),
  moduleMetadata({
    providers: [
      {
        provide: WORK_MANAGER_GATEWAY,
        useValue: new FakeWorkManagerGateway({
          sections,
          tasks: [task('task-1', 'todo'), task('task-2', 'done')],
        }),
      },
    ],
  }),
];

const FLOW = [section('section-text', 'rich-text', 0), section('section-tasks', 'task-list', 1)];
const GRID = [
  section('section-tasks', 'task-list', 0, 8),
  section('section-progress', 'progress', 1, 4),
  section('section-text', 'rich-text', 2, 12),
];

/**
 * §27's section canvas, for one page — the renderer behind a root's Home and a sub-project's
 * work canvas alike.
 *
 * The stories drive it through a `FakeWorkManagerGateway`, because a canvas is the one
 * component here that genuinely reads: its store loads the page's sections, and each container
 * section provides its own store and loads its own rows.
 */
const meta: Meta<ProjectCanvas> = {
  title: 'Projects/ProjectCanvas',
  component: ProjectCanvas,
  args: {
    projectId: PROJECT,
    pageId: PAGE,
    projectLayoutMode: 'flow',
    restoreBlocked: false,
    shortcutsAllowed: false,
  },
};

export default meta;
type Story = StoryObj<ProjectCanvas>;

/** §27's Flow layout: one vertical stack, sections at their own widths. */
export const Flow: Story = {
  decorators: canvas(FLOW),
};

/** §27's Grid layout: the same sections on a 12-column grid, by `columnSpan`. */
export const Grid: Story = {
  args: { projectLayoutMode: 'grid' },
  decorators: canvas(GRID),
};

/** Layout controls and insertion affordances are part of the canvas at all times. */
export const DirectCanvasEditing: Story = {
  decorators: canvas(FLOW),
};

/** The state a new page starts in, and the one that has to invite rather than look broken. */
export const Empty: Story = {
  decorators: canvas([]),
};
