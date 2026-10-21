import type { Meta, StoryObj } from '@storybook/angular-vite';
import { applicationConfig, componentWrapperDecorator, moduleMetadata } from '@storybook/angular-vite';
import { provideRouter } from '@angular/router';
import {
  ProjectSectionSchema,
  ResolvedSectionShortcutSchema,
  TaskSchema,
  type ResolvedSectionShortcut,
} from '@cwm/contracts';
import { expect, fn, userEvent, within } from 'storybook/test';
import { FakeWorkManagerGateway } from '../../../core/gateway/testing/fake-gateway';
import { WORK_MANAGER_GATEWAY } from '../../../core/gateway/work-manager-gateway';
import { SectionCanvasFrame } from '../../../prototype/design-lab/section-canvas-frame';
import { ShortcutFrame } from './shortcut-frame';

const AT = '2026-09-05T10:00:00.000Z';

const shortcut = (overrides: Record<string, unknown> = {}): ResolvedSectionShortcut =>
  ResolvedSectionShortcutSchema.parse({
    id: 'shortcut-story',
    pageId: 'page-story',
    sourceSectionId: 'section-source',
    position: 0,
    columnSpan: 12,
    collapsed: false,
    createdAt: AT,
    updatedAt: AT,
    source: ProjectSectionSchema.parse({
      id: 'section-source',
      projectId: 'project-story',
      pageId: 'page-work',
      type: 'markdown',
      position: 0,
      columnSpan: 12,
      collapsed: false,
      config: { markdown: 'The source stays canonical.' },
      createdAt: AT,
      updatedAt: AT,
    }),
    sourceProjectId: 'project-story',
    sourceProjectName: 'Website launch',
    sourcePageKind: 'work',
    breadcrumb: ['Website launch', 'Kitchen'],
    availability: 'available',
    ...overrides,
  });

const taskShortcut = (): ResolvedSectionShortcut => {
  const source = ProjectSectionSchema.parse({
    id: 'section-task-source',
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
  return shortcut({ sourceSectionId: source.id, source });
};

const meta: Meta<ShortcutFrame> = {
  title: 'Projects/ShortcutFrame',
  component: ShortcutFrame,
  decorators: [
    moduleMetadata({ imports: [SectionCanvasFrame] }),
    componentWrapperDecorator((story) => `<app-section-canvas-frame [columnSpan]="shortcut.columnSpan">${story}</app-section-canvas-frame>`),
    applicationConfig({ providers: [provideRouter([])] }),
    moduleMetadata({
      providers: [
        {
          provide: WORK_MANAGER_GATEWAY,
          useValue: new FakeWorkManagerGateway({
            shortcuts: [shortcut()],
            tasks: [TaskSchema.parse({
              id: 'task-story',
              projectId: 'project-story',
              sectionId: 'section-task-source',
              title: 'Review the appliance layout',
              status: 'todo',
              priority: 'medium',
              createdAt: AT,
              updatedAt: AT,
            })],
          }),
        },
      ],
    }),
  ],
  args: {
    shortcut: shortcut(),
    projectDataRevision: 0,
    projectHierarchyRevision: 0,
  },
};

export default meta;
type Story = StoryObj<ShortcutFrame>;

export const ReadOnly: Story = {};
export const DirectChrome: Story = {};
export const Collapsed: Story = { args: { shortcut: shortcut({ collapsed: true }) } };
export const SourceArchived: Story = {
  args: { shortcut: shortcut({ availability: 'source_archived' }) },
};
export const SourceHidden: Story = {
  args: { shortcut: shortcut({ availability: 'source_hidden' }) },
};
export const ReadOnlyTaskList: Story = {
  args: { shortcut: taskShortcut() },
};

export const NestedSource: Story = {
  args: { shortcut: shortcut({ breadcrumb: ['Home renovation', 'Kitchen', 'Cabinets'] }) },
};

export const ReflectionsPageSource: Story = {
  args: {
    shortcut: shortcut({
      sourcePageKind: 'reflections',
      breadcrumb: ['Home renovation', 'Reflections'],
    }),
  },
};

/** An unavailable source keeps its placement and explains why content is absent. */
export const PermissionDenied: Story = {
  args: { shortcut: shortcut({ availability: 'source_hidden' }) },
};

export const RemovePlacement: Story = {
  args: { removeRequested: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Remove shortcut to Markdown (Website launch)' }));
    await expect(args.removeRequested).toHaveBeenCalledWith('shortcut-story');
  },
};

export const CollapsePending: Story = { args: { collapsePending: true, shortcut: shortcut({ collapsed: true }) } };
export const CollapseRefused: Story = { args: { collapseError: 'Couldn’t collapse this shortcut. Try again. The server did not answer.' } };
