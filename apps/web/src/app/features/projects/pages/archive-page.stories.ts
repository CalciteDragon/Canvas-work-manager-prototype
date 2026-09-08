import { provideRouter } from '@angular/router';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { applicationConfig } from '@storybook/angular-vite';
import {
  ProjectArchiveItemSchema,
  ProjectArchiveResultSchema,
  ProjectSchema,
  ProjectSectionSchema,
  SubprojectSchema,
  type ProjectArchiveResult,
  type ProjectId,
  type ProjectPageId,
} from '@cwm/contracts';
import { GatewayError } from '../../../core/gateway/gateway-error';
import { WORK_MANAGER_GATEWAY, type WorkManagerGateway } from '../../../core/gateway/work-manager-gateway';
import { FakeLiveUpdates } from '../../../core/live/testing/fake-live-updates';
import { LIVE_UPDATES } from '../../../core/live/live-updates';
import { expect, userEvent, within } from 'storybook/test';
import { ArchivePage } from './archive-page';

const AT = '2026-09-05T10:00:00.000Z';
const PROJECT = 'project-archive-story' as ProjectId;
const root = ProjectSchema.parse({
  id: PROJECT,
  workspaceId: 'workspace-story',
  kind: 'root',
  name: 'Product launch',
  status: 'active',
  projectLayoutMode: 'flow',
  createdAt: AT,
  updatedAt: AT,
});
const section = ProjectSectionSchema.parse({
  id: 'section-archive-story',
  projectId: PROJECT,
  pageId: 'page-archive-story' as ProjectPageId,
  type: 'task-list',
  title: 'This week',
  position: 0,
  columnSpan: 12,
  collapsed: false,
  config: {},
  archivedAt: AT,
  createdAt: AT,
  updatedAt: AT,
});
const archive: ProjectArchiveResult = ProjectArchiveResultSchema.parse({
  projectId: PROJECT,
  root,
  items: [
    ProjectArchiveItemSchema.parse({
      kind: 'section',
      section,
      origin: {
        projectId: PROJECT,
        pageId: section.pageId,
        pageKind: 'home',
        pageEnabled: true,
        breadcrumb: [{ projectId: PROJECT, name: root.name }],
      },
      cause: { kind: 'own' },
      cascadeCount: 3,
      restoration: { kind: 'ready', operation: 'restore_section', permission: 'projects.write' },
    }),
    ProjectArchiveItemSchema.parse({
      kind: 'task',
      task: {
        id: 'task-archive-story',
        projectId: PROJECT,
        sectionId: section.id,
        title: 'Retire the old checklist',
        status: 'todo',
        priority: 'medium',
        archivedAt: AT,
        createdAt: AT,
        updatedAt: AT,
      },
      origin: {
        projectId: PROJECT,
        pageId: section.pageId,
        pageKind: 'home',
        pageEnabled: true,
        breadcrumb: [{ projectId: PROJECT, name: root.name }],
        sectionId: section.id,
        sectionName: section.title,
      },
      cause: { kind: 'section-cascade', sectionId: section.id },
      restoration: { kind: 'blocked', blocker: { kind: 'section', sectionId: section.id, name: section.title! } },
    }),
  ],
});

const archivedAncestor = SubprojectSchema.parse({
  id: 'project-legacy-story',
  workspaceId: 'workspace-story',
  kind: 'subproject',
  parentProjectId: PROJECT,
  name: 'Legacy attic',
  status: 'archived',
  projectLayoutMode: 'flow',
  createdAt: AT,
  updatedAt: AT,
});
const hiddenDescendant = SubprojectSchema.parse({
  id: 'project-legacy-child-story',
  workspaceId: 'workspace-story',
  kind: 'subproject',
  parentProjectId: archivedAncestor.id,
  name: 'Legacy shelving',
  status: 'active',
  projectLayoutMode: 'flow',
  createdAt: AT,
  updatedAt: AT,
});
const ancestorArchive: ProjectArchiveResult = ProjectArchiveResultSchema.parse({
  ...archive,
  items: [
    ProjectArchiveItemSchema.parse({
      kind: 'subproject',
      project: archivedAncestor,
      origin: {
        ...archive.items[0]!.origin,
        projectId: archivedAncestor.id,
        breadcrumb: [
          { projectId: PROJECT, name: root.name },
          { projectId: archivedAncestor.id, name: archivedAncestor.name },
        ],
      },
      cause: { kind: 'own' },
      restoration: { kind: 'ready', operation: 'restore_project', permission: 'projects.write' },
    }),
    ProjectArchiveItemSchema.parse({
      kind: 'subproject',
      project: hiddenDescendant,
      origin: {
        ...archive.items[0]!.origin,
        projectId: hiddenDescendant.id,
        pageId: 'page-project-legacy-child-story' as ProjectPageId,
        pageKind: 'work',
        breadcrumb: [
          { projectId: PROJECT, name: root.name },
          { projectId: archivedAncestor.id, name: archivedAncestor.name },
          { projectId: hiddenDescendant.id, name: hiddenDescendant.name },
        ],
      },
      cause: { kind: 'hidden-by-project', projectId: archivedAncestor.id },
      restoration: {
        kind: 'blocked',
        blocker: { kind: 'project', projectId: archivedAncestor.id, name: archivedAncestor.name },
      },
    }),
  ],
});

const gatewayFor = (
  answer: ProjectArchiveResult | GatewayError | 'pending',
  restore: 'ready' | 'pending' | 'failed' = 'ready',
): WorkManagerGateway =>
  ({
    archive: {
      get: () =>
        answer === 'pending'
          ? new Promise(() => undefined)
          : answer instanceof GatewayError
            ? Promise.reject(answer)
            : Promise.resolve(answer),
    },
    sections: {
      restore: () =>
        restore === 'pending'
          ? new Promise(() => undefined)
          : restore === 'failed'
            ? Promise.reject(new GatewayError('unreachable', 0, 'Restore was refused.'))
            : Promise.resolve(section),
    },
  }) as unknown as WorkManagerGateway;

const meta: Meta<ArchivePage> = {
  title: 'Projects/ArchivePage',
  component: ArchivePage,
  decorators: [
    applicationConfig({
      providers: [provideRouter([]), { provide: LIVE_UPDATES, useValue: new FakeLiveUpdates() }],
    }),
  ],
  args: {
    projectId: PROJECT,
    pageId: 'page-archive' as ProjectPageId,
    projectLayoutMode: 'flow',
    restoreBlocked: false,
    shortcutsAllowed: false,
    onProjectDataChange: () => undefined,
    onProjectHierarchyChange: () => undefined,
  },
};

export default meta;
type Story = StoryObj<ArchivePage>;

export const MixedArchive: Story = {
  decorators: [applicationConfig({ providers: [{ provide: WORK_MANAGER_GATEWAY, useValue: gatewayFor(archive) }] })],
};

export const Empty: Story = {
  decorators: [applicationConfig({ providers: [{ provide: WORK_MANAGER_GATEWAY, useValue: gatewayFor({ ...archive, items: [] }) }] })],
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

export const ReadyRestore: Story = {
  decorators: [
    applicationConfig({ providers: [{ provide: WORK_MANAGER_GATEWAY, useValue: gatewayFor(archive) }] }),
  ],
};

export const AncestorBlocked: Story = {
  args: { restoreBlocked: false },
  decorators: [
    applicationConfig({ providers: [{ provide: WORK_MANAGER_GATEWAY, useValue: gatewayFor(ancestorArchive) }] }),
  ],
};

export const Restoring: Story = {
  decorators: [
    applicationConfig({ providers: [{ provide: WORK_MANAGER_GATEWAY, useValue: gatewayFor(archive, 'pending') }] }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Restore This week' }));
    await expect(canvas.getByRole('button', { name: 'Restore This week' }).textContent).toContain('Restoring…');
  },
};

/** A root-level refusal disables every restore control and explains the reactivation step. */
export const ReactivationRefused: Story = {
  args: { restoreBlocked: true },
  decorators: [
    applicationConfig({ providers: [{ provide: WORK_MANAGER_GATEWAY, useValue: gatewayFor(archive) }] }),
  ],
};
