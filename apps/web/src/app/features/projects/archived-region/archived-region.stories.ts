import type { Meta, StoryObj } from '@storybook/angular-vite';
import {
  ProjectArchiveItemSchema,
  ProjectSectionSchema,
  SubprojectSchema,
  type ProjectArchiveItem,
} from '@cwm/contracts';
import { ArchivedRegion } from './archived-region';

const AT = '2026-09-02T06:13:32.422Z';
const PROJECT = 'project-story';
const origin = {
  projectId: PROJECT,
  pageId: 'page-project-story',
  pageKind: 'home' as const,
  pageEnabled: true,
  breadcrumb: [{ projectId: PROJECT, name: 'Product launch' }],
};
const section = ProjectSectionSchema.parse({
  id: 'section-backlog',
  projectId: PROJECT,
  pageId: origin.pageId,
  type: 'task-list',
  title: 'Backlog',
  position: 0,
  columnSpan: 12,
  collapsed: false,
  config: {},
  archivedAt: AT,
  createdAt: AT,
  updatedAt: AT,
});
const subproject = SubprojectSchema.parse({
  id: 'project-kitchen',
  workspaceId: 'workspace-demo',
  kind: 'subproject',
  parentProjectId: PROJECT,
  name: 'Kitchen',
  status: 'planning',
  projectLayoutMode: 'flow',
  createdAt: AT,
  updatedAt: AT,
});

const archivedItems: ProjectArchiveItem[] = [
  ProjectArchiveItemSchema.parse({
    kind: 'section',
    section,
    origin,
    cause: { kind: 'own' },
    cascadeCount: 1,
    recovery: { kind: 'owned-content', ownedData: 'tasks', contentCount: 1, separateRestoreCount: 0 },
    restoration: { kind: 'ready', operation: 'restore_section', permission: 'projects.write' },
  }),
  ProjectArchiveItemSchema.parse({
    kind: 'subproject',
    project: subproject,
    origin: { ...origin, projectId: subproject.id, breadcrumb: [...origin.breadcrumb, { projectId: subproject.id, name: subproject.name }] },
    cause: { kind: 'own' },
    restoration: { kind: 'ready', operation: 'restore_project', permission: 'projects.write' },
  }),
];

const recoveryItems: ProjectArchiveItem[] = [
  ProjectArchiveItemSchema.parse({
    kind: 'section',
    section: { ...section, id: 'section-notes', type: 'rich-text', title: 'Site notes', config: { text: 'Keep the old hosting login steps.' } },
    origin,
    cause: { kind: 'own' },
    recovery: { kind: 'config' },
    restoration: { kind: 'ready', operation: 'restore_section', permission: 'projects.write' },
  }),
  ProjectArchiveItemSchema.parse({
    kind: 'section',
    section: { ...section, id: 'section-calendar', type: 'calendar', title: undefined, config: { view: 'month' } },
    origin,
    cause: { kind: 'own' },
    recovery: { kind: 'unknown' },
    restoration: { kind: 'ready', operation: 'restore_section', permission: 'projects.write' },
  }),
  ProjectArchiveItemSchema.parse({
    kind: 'section',
    section: { ...section, id: 'section-old-list', title: 'Old list' },
    origin,
    cause: { kind: 'own' },
    cascadeCount: 0,
    recovery: { kind: 'owned-content', ownedData: 'tasks', contentCount: 2, separateRestoreCount: 1 },
    restoration: { kind: 'ready', operation: 'restore_section', permission: 'projects.write' },
  }),
];

const meta: Meta<ArchivedRegion> = {
  title: 'Projects/ArchivedRegion',
  component: ArchivedRegion,
  args: { items: archivedItems, restoreBlocked: false, restoring: new Set<string>() },
};

export default meta;
type Story = StoryObj<ArchivedRegion>;

export const Empty: Story = { args: { items: [] } };
export const ArchivedOwners: Story = {};
export const ArchivedProjectWithStatusChoice: Story = { args: { items: archivedItems.slice(1, 2) } };
export const RootArchived: Story = { args: { restoreBlocked: true } };
export const ContentAndUnknownSections: Story = { args: { items: recoveryItems.slice(0, 2) } };
export const PreArchivedOnlyContainer: Story = { args: { items: recoveryItems.slice(2) } };
