import type { Meta, StoryObj } from '@storybook/angular-vite';
import { moduleMetadata } from '@storybook/angular-vite';
import type { ProjectId, ProjectPageId, ShortcutSource } from '@cwm/contracts';
import { fn } from 'storybook/test';
import { FakeWorkManagerGateway } from '../../core/gateway/testing/fake-gateway';
import { WORK_MANAGER_GATEWAY } from '../../core/gateway/work-manager-gateway';
import { SECTION_REGISTRY } from './sections/registry';
import { SectionCreateDialog } from './section-create-dialog';
import { ShortcutStore } from './shortcuts/shortcut-store';

const PROJECT = 'project-story' as ProjectId;
const PAGE = 'page-story' as ProjectPageId;

const source: ShortcutSource = {
  sourceSectionId: 'section-kitchen' as ShortcutSource['sourceSectionId'],
  type: 'task-list',
  name: 'Kitchen tasks',
  projectId: PROJECT,
  projectName: 'Home renovation',
  pageId: 'page-work' as ProjectPageId,
  pageKind: 'work',
  breadcrumb: ['Home renovation', 'Kitchen'],
  alreadyPlaced: false,
};

const meta: Meta<SectionCreateDialog> = {
  title: 'Projects/SectionCreateDialog',
  component: SectionCreateDialog,
  decorators: [
    moduleMetadata({
      providers: [
        ShortcutStore,
        {
          provide: WORK_MANAGER_GATEWAY,
          useValue: new FakeWorkManagerGateway({ shortcutSources: [source] }),
        },
      ],
    }),
  ],
  args: {
    types: SECTION_REGISTRY,
    projectId: PROJECT,
    pageId: PAGE,
    shortcutsAllowed: false,
    create: fn(async () => null),
    createShortcut: fn(async (_source: ShortcutSource) => null),
  },
};

export default meta;
type Story = StoryObj<SectionCreateDialog>;

export const Default: Story = {};

export const HomeWithShortcuts: Story = {
  args: { shortcutsAllowed: true },
};

export const Pending: Story = {
  args: { create: () => new Promise<string | null>(() => undefined) },
};

export const Failed: Story = {
  args: { create: async () => 'The prototype host is not answering.' },
};

export const AnchorGone: Story = {
  args: { create: async () => 'That insertion point is no longer available. Close this dialog and choose another point.' },
};
