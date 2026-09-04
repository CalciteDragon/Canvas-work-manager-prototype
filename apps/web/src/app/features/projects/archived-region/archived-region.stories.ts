import type { Meta, StoryObj } from '@storybook/angular-vite';
import { moduleMetadata } from '@storybook/angular-vite';
import {
  ProjectSectionSchema,
  ReflectionSchema,
  TaskSchema,
  type ProjectId,
  type ProjectSection,
  type Reflection,
  type Task,
} from '@cwm/contracts';
import { GatewayError } from '../../../core/gateway/gateway-error';
import { FakeWorkManagerGateway } from '../../../core/gateway/testing/fake-gateway';
import { WORK_MANAGER_GATEWAY } from '../../../core/gateway/work-manager-gateway';
import { ArchivedRegion } from './archived-region';

/**
 * §4's Archived region: what removal took, and one click to get it back.
 *
 * Each story is a whole world rather than a set of inputs — the region reads sections, tasks
 * and reflections for itself, so the variants are told through `FakeWorkManagerGateway`
 * options. Note there is no "empty" visual: with nothing archived the region renders
 * *nothing at all*, which is the state the first story exists to show.
 */
const PROJECT = 'project-story' as ProjectId;
const AT = '2026-09-02T06:13:32.422Z';
const EARLIER = '2026-09-01T06:13:32.422Z';

const section = (id: string, overrides: Record<string, unknown> = {}): ProjectSection =>
  ProjectSectionSchema.parse({
    id,
    projectId: PROJECT,
    type: 'task-list',
    position: 0,
    columnSpan: 12,
    collapsed: false,
    config: {},
    createdAt: EARLIER,
    updatedAt: AT,
    ...overrides,
  });

const task = (id: string, title: string, overrides: Record<string, unknown> = {}): Task =>
  TaskSchema.parse({
    id,
    projectId: PROJECT,
    sectionId: 'section-live',
    title,
    status: 'todo',
    priority: 'medium',
    createdAt: EARLIER,
    updatedAt: AT,
    ...overrides,
  });

const reflection = (id: string, title: string, overrides: Record<string, unknown> = {}): Reflection =>
  ReflectionSchema.parse({
    id,
    projectId: PROJECT,
    sectionId: 'section-live',
    title,
    body: 'The retry budget was the wrong shape.',
    createdAt: EARLIER,
    updatedAt: AT,
    ...overrides,
  });

const worldOf = (options: ConstructorParameters<typeof FakeWorkManagerGateway>[0]) =>
  moduleMetadata({
    providers: [{ provide: WORK_MANAGER_GATEWAY, useValue: new FakeWorkManagerGateway(options) }],
  });

const meta: Meta<ArchivedRegion> = {
  title: 'Projects/ArchivedRegion',
  component: ArchivedRegion,
  args: { projectId: PROJECT, projectDataRevision: 0, restoreBlocked: false },
};

export default meta;
type Story = StoryObj<ArchivedRegion>;

/** Nothing removed yet, so the region is absent rather than an empty heading. */
export const Empty: Story = {
  decorators: [worldOf({ sections: [section('section-live')], tasks: [], reflections: [] })],
};

/**
 * A container with its cascaded rows, an emptied container that shows zero, and a view that
 * shows no count at all — removal archives every section, so all three belong here.
 */
export const ArchivedSections: Story = {
  decorators: [
    worldOf({
      sections: [
        section('section-backlog', { title: 'Backlog', archivedAt: AT }),
        section('section-emptied', { title: 'Last quarter', archivedAt: EARLIER }),
        section('section-notes', { type: 'rich-text', title: 'Notes', archivedAt: '2026-08-30T06:13:32.422Z' }),
      ],
      tasks: [
        task('task-1', 'Measure the hallway shelf', {
          sectionId: 'section-backlog',
          archivedAt: AT,
          archivedWithSectionId: 'section-backlog',
        }),
        task('task-2', 'Order the brackets', {
          sectionId: 'section-backlog',
          archivedAt: AT,
          archivedWithSectionId: 'section-backlog',
        }),
      ],
    }),
  ],
};

/** Rows archived one at a time from their own list, which restore one at a time. */
export const StandaloneRows: Story = {
  decorators: [
    worldOf({
      sections: [section('section-live')],
      tasks: [task('task-1', 'Retire the old checklist', { archivedAt: AT })],
      reflections: [reflection('reflection-1', 'Week 34', { archivedAt: EARLIER })],
    }),
  ],
};

/**
 * The project itself is archived. The work stays visible — erasing it would be worse — but
 * every Restore is disabled, because the domain would refuse it.
 */
export const ProjectArchived: Story = {
  args: { restoreBlocked: true },
  decorators: [
    worldOf({
      sections: [section('section-backlog', { title: 'Backlog', archivedAt: AT })],
      tasks: [task('task-1', 'Retire the old checklist', { archivedAt: EARLIER })],
    }),
  ],
};

/** A restore the host refused: the entry stays put, with the reason above it. */
export const RestoreFailed: Story = {
  decorators: [
    worldOf({
      sections: [section('section-backlog', { title: 'Backlog', archivedAt: AT })],
      failOn: {
        'sections.restore': new GatewayError('rule_violation', 409, 'project "project-story" is archived'),
      },
    }),
  ],
  play: async ({ canvasElement }) => {
    canvasElement.querySelector<HTMLButtonElement>('[data-archived-section-restore]')?.click();
  },
};
