import { provideRouter } from '@angular/router';
import {
  ProjectSchema,
  TaskSchema,
  type ProjectId,
  type ProjectPageId,
  type ProjectTodoItem,
  type ProjectTodosResult,
  type SectionId,
} from '@cwm/contracts';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { applicationConfig } from '@storybook/angular-vite';
import { GatewayError } from '../../../core/gateway/gateway-error';
import { WORK_MANAGER_GATEWAY, type WorkManagerGateway } from '../../../core/gateway/work-manager-gateway';
import { expect, userEvent, within } from 'storybook/test';
import { TodosPage } from './todos-page';

const AT = '2026-09-05T10:00:00.000Z';
const ROOT = 'project-renovation' as ProjectId;

const taskRow = (id: string, title: string, overrides: Record<string, unknown> = {}): ProjectTodoItem => ({
  kind: 'task',
  task: TaskSchema.parse({
    id,
    projectId: ROOT,
    sectionId: 'section-week',
    title,
    status: 'todo',
    priority: 'medium',
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  }),
  origin: {
    projectId: ROOT,
    pageId: 'page-renovation-home' as ProjectPageId,
    pageKind: 'home',
    breadcrumb: [{ projectId: ROOT, name: 'Home renovation' }],
    sectionId: 'section-week' as SectionId,
    sectionName: 'This week',
  },
});

const unit = (status = 'active') =>
  ProjectSchema.parse({
    id: 'project-kitchen',
    workspaceId: 'workspace-story',
    kind: 'subproject',
    parentProjectId: ROOT,
    name: 'Kitchen',
    status,
    targetDate: '2026-09-08',
    projectLayoutMode: 'flow',
    createdAt: AT,
    updatedAt: AT,
  }) as Extract<ProjectTodoItem, { kind: 'subproject' }>['project'];

const unitRow = (): ProjectTodoItem => ({
  kind: 'subproject',
  project: unit(),
  origin: {
    projectId: 'project-kitchen' as ProjectId,
    pageId: 'page-kitchen-work' as ProjectPageId,
    pageKind: 'work',
    breadcrumb: [
      { projectId: ROOT, name: 'Home renovation' },
      { projectId: 'project-kitchen' as ProjectId, name: 'Kitchen' },
    ],
  },
});

const taskRowTask = (id: string) => {
  const row = MIXED.find((item) => item.kind === 'task' && item.task.id === id);
  return (row as Extract<ProjectTodoItem, { kind: 'task' }>).task;
};

const MIXED: ProjectTodoItem[] = [
  taskRow('task-quote', 'Chase the plumber’s quote', { dueAt: '2026-09-06T09:00:00.000Z' }),
  taskRow('task-tiles', 'Choose the splashback tiles', { dueAt: '2026-09-08T17:00:00.000Z', status: 'in_progress' }),
  unitRow(),
  taskRow('task-skip', 'Book the skip', { dueAt: '2026-09-09T09:00:00.000Z', status: 'done', completedAt: AT }),
  taskRow('task-shelves', 'Reclaimed shelving', { status: 'cancelled' }),
  taskRow('task-someday', 'Repaint the hallway'),
];

/** A gateway that answers one shape and nothing else — the stories never write. */
const gatewayFor = (
  answer: ProjectTodosResult | GatewayError | 'pending',
  completion: 'success' | 'pending' | 'failed' = 'success',
): WorkManagerGateway =>
  ({
    todos: {
      get: () =>
        answer === 'pending'
          ? new Promise(() => undefined)
          : answer instanceof GatewayError
            ? Promise.reject(answer)
            : Promise.resolve(answer),
    },
    // The stories are visual, but the control is real: clicking Complete answers the way the
    // host does, so the row settles instead of hanging in its pending state.
    tasks: {
      complete: (id: string) =>
        completion === 'pending'
          ? new Promise(() => undefined)
          : completion === 'failed'
            ? Promise.reject(new GatewayError('unreachable', 0, 'Completion was refused.'))
            : Promise.resolve(TaskSchema.parse({ ...taskRowTask(id), status: 'done', completedAt: AT })),
    },
    projects: { update: () => Promise.resolve(unit('completed')) },
  }) as unknown as WorkManagerGateway;

const result = (items: ProjectTodoItem[]): ProjectTodosResult => ({ projectId: ROOT, items });

/**
 * §34's Todos page. Every state below is a different **gateway answer**, because the page has
 * no state of its own: the chronology, the order and the exclusions are all the query's.
 */
const meta: Meta<TodosPage> = {
  title: 'Projects/TodosPage',
  component: TodosPage,
  decorators: [applicationConfig({ providers: [provideRouter([])] })],
  args: {
    projectId: ROOT,
    pageId: 'page-renovation-todos' as ProjectPageId,
    projectLayoutMode: 'flow',
    shortcutsAllowed: false,
    restoreBlocked: false,
    onProjectDataChange: () => undefined,
    onProjectHierarchyChange: () => undefined,
  },
};

export default meta;
type Story = StoryObj<TodosPage>;

/** Tasks and a unit of work, dated and undated, with finished rows still on the list. */
export const MixedChronology: Story = {
  decorators: [applicationConfig({ providers: [{ provide: WORK_MANAGER_GATEWAY, useValue: gatewayFor(result(MIXED)) }] })],
};

export const NoWork: Story = {
  decorators: [applicationConfig({ providers: [{ provide: WORK_MANAGER_GATEWAY, useValue: gatewayFor(result([])) }] })],
};

export const Loading: Story = {
  decorators: [applicationConfig({ providers: [{ provide: WORK_MANAGER_GATEWAY, useValue: gatewayFor('pending') }] })],
};

export const Unreadable: Story = {
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: WORK_MANAGER_GATEWAY,
          useValue: gatewayFor(new GatewayError('unreachable', 0, 'The prototype host is not answering.')),
        },
      ],
    }),
  ],
};

export const CompletionPending: Story = {
  decorators: [
    applicationConfig({ providers: [{ provide: WORK_MANAGER_GATEWAY, useValue: gatewayFor(result(MIXED), 'pending') }] }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Complete Chase the plumber’s quote' }));
    await expect(canvas.getByText('Completing…')).toBeVisible();
  },
};

export const CompletionRefused: Story = {
  decorators: [
    applicationConfig({ providers: [{ provide: WORK_MANAGER_GATEWAY, useValue: gatewayFor(result(MIXED), 'failed') }] }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Complete Chase the plumber’s quote' }));
    await expect(canvas.getByRole('alert').textContent).toContain('Completion was refused.');
    await expect(canvas.getByRole('button', { name: 'Complete Chase the plumber’s quote' })).toBeVisible();
  },
};
