import { TaskSchema, type Task } from '@cwm/contracts';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { TaskRow } from './task-row';

/**
 * §4's TaskRow variants — **six, not seven**.
 *
 * *Agent Modified* has no data behind it: `TaskRow`'s inputs are `task`, `selected`,
 * `compact`, `pending` and `now`, and `packages/contracts/src/task.ts` carries no actor
 * attribution — who changed a task lives on `ActivityFeedEntry`, not on `Task`. Adding an
 * `agentModified` input would mean inventing attribution on the task record, which is a
 * product question, not a story. Recorded in
 * `docs/decisions/2026-08-agent-modified-has-no-data-behind-it.md`.
 */
const AT = '2026-08-27T16:00:00.000Z';
const NOW = Date.parse(AT);

const task = (overrides: Record<string, unknown> = {}): Task =>
  TaskSchema.parse({
    id: 'task-story',
    projectId: 'project-story',
    sectionId: 'section-story-tasks',
    title: 'Draft the launch announcement',
    status: 'todo',
    priority: 'medium',
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  });

const meta: Meta<TaskRow> = {
  title: 'Tasks/TaskRow',
  component: TaskRow,
  args: {
    task: task(),
    selected: false,
    compact: false,
    pending: false,
    archiving: false,
    now: NOW,
  },
};

export default meta;
type Story = StoryObj<TaskRow>;

export const Normal: Story = {};

export const Overdue: Story = {
  args: { task: task({ title: 'Send the pre-launch email', dueAt: '2026-08-01T23:59:59.999Z' }) },
};

export const Completed: Story = {
  args: { task: task({ title: 'Book the venue', status: 'done', completedAt: AT }) },
};

export const HighPriority: Story = {
  args: { task: task({ title: 'Fix the sign-up form', priority: 'high' }) },
};

export const Selected: Story = { args: { selected: true } };

/** §34's per-row archive, in the state a live row shows it: available, not in flight. */
export const Archivable: Story = { args: { task: task({ title: 'Retire the old checklist' }) } };

/** The same control while the request is out — the row it belongs to has not gone yet. */
export const Archiving: Story = {
  args: { task: task({ title: 'Retire the old checklist' }), archiving: true },
};

export const Compact: Story = { args: { compact: true } };

/**
 * Proves the **story wiring**, not `TaskRow` itself — `task-row.spec.ts` already covers
 * completion. Destructures only `canvasElement` and `args`: `tsconfig.base.json` sets
 * `noUnusedParameters`, so an unused context member fails the new type-check pass.
 */
export const Completing: Story = {
  args: { completionRequested: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('checkbox'));
    await expect(args.completionRequested).toHaveBeenCalledWith('task-story');
  },
};
