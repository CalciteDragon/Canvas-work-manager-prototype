import type { Meta, StoryObj } from '@storybook/angular-vite';
import {
  ProjectArchiveItemSchema,
  ProjectSectionSchema,
  SubprojectSchema,
  TaskSchema,
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
const task = TaskSchema.parse({
  id: 'task-archive',
  projectId: PROJECT,
  sectionId: section.id,
  title: 'Retire the old checklist',
  status: 'todo',
  priority: 'medium',
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
    restoration: { kind: 'ready', operation: 'restore_section', permission: 'projects.write' },
  }),
  ProjectArchiveItemSchema.parse({
    kind: 'task',
    task,
    origin: { ...origin, sectionId: section.id, sectionName: 'Backlog' },
    cause: { kind: 'section-cascade', sectionId: section.id },
    restoration: { kind: 'blocked', blocker: { kind: 'section', sectionId: section.id, name: 'Backlog' } },
  }),
  ProjectArchiveItemSchema.parse({
    kind: 'subproject',
    project: subproject,
    origin: { ...origin, projectId: subproject.id, breadcrumb: [...origin.breadcrumb, { projectId: subproject.id, name: subproject.name }] },
    cause: { kind: 'own' },
    restoration: { kind: 'ready', operation: 'restore_project', permission: 'projects.write' },
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
export const ArchivedSectionsAndRows: Story = {};
export const ArchivedProjectWithStatusChoice: Story = { args: { items: archivedItems.slice(2, 3) } };
export const RootArchived: Story = { args: { restoreBlocked: true } };
