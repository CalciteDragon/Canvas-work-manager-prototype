import { ProjectSectionSchema } from '@cwm/contracts';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { applicationConfig, moduleMetadata } from '@storybook/angular-vite';
import { provideRouter } from '@angular/router';
import type { ProjectId, ProjectPageId, SectionId } from '@cwm/contracts';
import { expect, fn, userEvent, within } from 'storybook/test';
import { FakeWorkManagerGateway } from '../../../core/gateway/testing/fake-gateway';
import { GatewayError } from '../../../core/gateway/gateway-error';
import { WORK_MANAGER_GATEWAY } from '../../../core/gateway/work-manager-gateway';
import { ProjectPageStore } from '../project-page-store';
import { ShortcutPicker } from './shortcut-picker';
import { ShortcutStore } from './shortcut-store';

const PROJECT = 'project-story' as ProjectId;
const PAGE = 'page-story' as ProjectPageId;

const meta: Meta<ShortcutPicker> = {
  title: 'Projects/ShortcutPicker',
  component: ShortcutPicker,
  decorators: [
    applicationConfig({ providers: [provideRouter([])] }),
    moduleMetadata({
      providers: [
        ProjectPageStore,
        ShortcutStore,
        {
          provide: WORK_MANAGER_GATEWAY,
          useValue: new FakeWorkManagerGateway({
            shortcutSources: [
              {
                section: ProjectSectionSchema.parse({ id: 'section-kitchen', projectId: PROJECT, pageId: 'page-work', type: 'task-list', position: 0, columnSpan: 12, collapsed: false, config: {}, createdAt: '2026-08-24T16:00:00.000Z', updatedAt: '2026-08-24T16:00:00.000Z' }),
                sourceSectionId: 'section-kitchen' as SectionId,
                type: 'task-list',
                name: 'Kitchen tasks',
                projectId: 'project-story' as ProjectId,
                projectName: 'Website launch',
                pageId: 'page-work' as ProjectPageId,
                pageKind: 'work',
                breadcrumb: ['Website launch', 'Kitchen'],
                alreadyPlaced: false,
              },
              {
                section: ProjectSectionSchema.parse({ id: 'section-notes', projectId: PROJECT, pageId: 'page-work', type: 'markdown', position: 0, columnSpan: 12, collapsed: false, config: {}, createdAt: '2026-08-24T16:00:00.000Z', updatedAt: '2026-08-24T16:00:00.000Z' }),
                sourceSectionId: 'section-notes' as SectionId,
                type: 'markdown',
                name: 'Launch notes',
                projectId: 'project-story' as ProjectId,
                projectName: 'Website launch',
                pageId: 'page-reflections' as ProjectPageId,
                pageKind: 'reflections',
                breadcrumb: ['Website launch'],
                alreadyPlaced: true,
              },
            ],
          }),
        },
      ],
    }),
  ],
  args: { projectId: PROJECT, pageId: PAGE, create: fn(async () => null) },
};

export default meta;
type Story = StoryObj<ShortcutPicker>;

export const AvailableSources: Story = {};

/** Content is loaded only when the source's Preview disclosure opens. */
export const PreviewOpen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getAllByText('Preview')[0]!);
    await expect(canvas.getByText('The source has no tasks yet.')).toBeVisible();
  },
};

export const Empty: Story = {
  decorators: [
    moduleMetadata({
      providers: [
        {
          provide: WORK_MANAGER_GATEWAY,
          useValue: new FakeWorkManagerGateway({ shortcutSources: [] }),
        },
      ],
    }),
  ],
};

export const AlreadyPlaced: Story = {
  decorators: [
    moduleMetadata({
      providers: [
        {
          provide: WORK_MANAGER_GATEWAY,
          useValue: new FakeWorkManagerGateway({
            shortcutSources: [
              {
                section: ProjectSectionSchema.parse({ id: 'section-notes', projectId: PROJECT, pageId: 'page-work', type: 'markdown', position: 0, columnSpan: 12, collapsed: false, config: {}, createdAt: '2026-08-24T16:00:00.000Z', updatedAt: '2026-08-24T16:00:00.000Z' }),
                sourceSectionId: 'section-notes' as SectionId,
                type: 'markdown',
                name: 'Launch notes',
                projectId: PROJECT,
                projectName: 'Website launch',
                pageId: 'page-reflections' as ProjectPageId,
                pageKind: 'reflections',
                breadcrumb: ['Website launch'],
                alreadyPlaced: true,
              },
            ],
          }),
        },
      ],
    }),
  ],
};

export const Loading: Story = {
  decorators: [
    moduleMetadata({
      providers: [
        {
          provide: WORK_MANAGER_GATEWAY,
          useValue: (() => {
            const gateway = new FakeWorkManagerGateway();
            gateway.shortcuts.sources = () => new Promise(() => undefined);
            return gateway;
          })(),
        },
      ],
    }),
  ],
};

export const Unreadable: Story = {
  decorators: [
    moduleMetadata({
      providers: [
        {
          provide: WORK_MANAGER_GATEWAY,
          useValue: new FakeWorkManagerGateway({
            failOn: { 'shortcuts.sources': new GatewayError('unreachable', 0, 'The prototype host is not answering.') },
          }),
        },
      ],
    }),
  ],
};

export const AddSource: Story = {
  args: { added: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /^Add / }));
    await expect(args.added).toHaveBeenCalled();
  },
};
