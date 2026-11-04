import type { Meta, StoryObj } from '@storybook/angular-vite';
import { applicationConfig, moduleMetadata } from '@storybook/angular-vite';
import { provideRouter } from '@angular/router';
import { ProjectSectionSchema, TaskSchema } from '@cwm/contracts';
import { expect, fn, within } from 'storybook/test';
import { FakeWorkManagerGateway } from '../../../../core/gateway/testing/fake-gateway';
import { WORK_MANAGER_GATEWAY } from '../../../../core/gateway/work-manager-gateway';
import { TaskListSection } from './task-list-section';

const AT = '2026-09-05T10:00:00.000Z';

const section = ProjectSectionSchema.parse({
  id: 'section-story-tasks',
  projectId: 'project-story',
  pageId: 'page-work',
  type: 'task-list',
  position: 0,
  columnSpan: 12,
  collapsed: false,
  config: {},
  createdAt: AT,
  updatedAt: AT,
});

const task = (id: string, title: string, status: 'todo' | 'done' = 'todo') =>
  TaskSchema.parse({
    id,
    projectId: 'project-story',
    sectionId: section.id,
    title,
    status,
    priority: 'medium',
    createdAt: AT,
    updatedAt: AT,
    ...(status === 'done' ? { completedAt: AT } : {}),
  });

const withTasks = (tasks: ReturnType<typeof task>[]) =>
  moduleMetadata({ providers: [{ provide: WORK_MANAGER_GATEWAY, useValue: new FakeWorkManagerGateway({ tasks }) }] });

const tasks = [task('task-a', 'Measure the cabinets'), task('task-b', 'Order the hinges'), task('task-c', 'Pick a finish', 'done')];

/**
 * §30's Task List, outside a frame. The header count is the frame's to show, so these stories
 * show what the list reports and how its rows look live and on an archived page (Slice 79).
 */
const meta: Meta<TaskListSection> = {
  title: 'Projects/Sections/TaskListSection',
  component: TaskListSection,
  decorators: [applicationConfig({ providers: [provideRouter([])] })],
  args: {
    section,
    onConfigChange: fn(),
    onProjectDataChange: fn(),
    projectDataRevision: 0,
    projectHierarchyRevision: 0,
    readOnly: false,
    reportSummary: fn(),
  },
};

export default meta;
type Story = StoryObj<TaskListSection>;

/** Quick-add above the rows; the list reports "3 tasks" for its frame's header. */
export const Live: Story = {
  decorators: [withTasks(tasks)],
  play: async ({ args, canvasElement }) => {
    await within(canvasElement).findByText('Order the hinges');
    await expect(args.reportSummary).toHaveBeenLastCalledWith('3 tasks');
  },
};

/** On an archived page: static rows, no quick-add, Complete, Delete or drag (Q5 (a)). */
export const ArchivedReadOnly: Story = {
  decorators: [withTasks(tasks)],
  args: { readOnly: true },
};

/** No count at zero: the empty sentence speaks. */
export const Empty: Story = {
  decorators: [withTasks([])],
  play: async ({ args, canvasElement }) => {
    await within(canvasElement).findByText('No tasks yet. Add the first one above.');
    await expect(args.reportSummary).not.toHaveBeenCalledWith(expect.stringContaining('task'));
  },
};
