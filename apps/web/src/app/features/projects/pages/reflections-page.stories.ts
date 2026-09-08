import { provideRouter } from '@angular/router';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { applicationConfig } from '@storybook/angular-vite';
import {
  ProjectJournalResultSchema,
  ProjectPageSchema,
  ProjectSchema,
  ProjectSectionSchema,
  ProjectCompletedWorkResultSchema,
  type ProjectId,
  type ProjectPageId,
} from '@cwm/contracts';
import { GatewayError } from '../../../core/gateway/gateway-error';
import { FakeWorkManagerGateway } from '../../../core/gateway/testing/fake-gateway';
import { WORK_MANAGER_GATEWAY } from '../../../core/gateway/work-manager-gateway';
import { LIVE_UPDATES } from '../../../core/live/live-updates';
import { FakeLiveUpdates } from '../../../core/live/testing/fake-live-updates';
import { ReflectionsPage } from './reflections-page';

const AT = '2026-09-05T10:00:00.000Z';
const PROJECT = 'project-reflections-story' as ProjectId;
const PAGE = 'page-reflections-story' as ProjectPageId;
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
const page = ProjectPageSchema.parse({ id: PAGE, projectId: PROJECT, kind: 'reflections', enabled: true, createdAt: AT, updatedAt: AT });
const section = ProjectSectionSchema.parse({
  id: 'section-reflections-story',
  projectId: PROJECT,
  pageId: PAGE,
  type: 'reflections',
  title: 'Launch notes',
  position: 0,
  columnSpan: 12,
  collapsed: false,
  config: {},
  createdAt: AT,
  updatedAt: AT,
});
const subject = {
  kind: 'task' as const,
  id: 'task-release-story',
  name: 'Ship the release',
  status: 'done' as const,
  completedAt: AT,
  archived: false,
  hiddenByArchivedAncestor: false,
  breadcrumb: [{ projectId: PROJECT, name: root.name }],
};
const journal = ProjectJournalResultSchema.parse({
  projectId: PROJECT,
  items: [{
    reflection: {
      id: 'reflection-story',
      projectId: PROJECT,
      sectionId: section.id,
      subject: { kind: 'task', id: subject.id },
      title: 'Launch checkpoint',
      body: 'The release went smoothly.',
      createdAt: AT,
      updatedAt: AT,
    },
    origin: {
      projectId: PROJECT,
      pageId: PAGE,
      pageKind: 'reflections',
      breadcrumb: [{ projectId: PROJECT, name: root.name }],
      sectionId: section.id,
      sectionName: section.title ?? 'Reflections',
    },
    subject,
  }],
});

const reopenedJournal = ProjectJournalResultSchema.parse({
  ...journal,
  items: [{
    ...journal.items[0]!,
    reflection: { ...journal.items[0]!.reflection, id: 'reflection-reopened-story' },
    subject: { ...subject, status: 'todo', completedAt: undefined },
  }],
});

const archivedJournal = ProjectJournalResultSchema.parse({
  ...journal,
  items: [{
    ...journal.items[0]!,
    reflection: { ...journal.items[0]!.reflection, id: 'reflection-archived-subject-story' },
    subject: { ...subject, archived: true },
  }],
});

const unlinkedJournal = ProjectJournalResultSchema.parse({
  projectId: PROJECT,
  items: [{
    ...journal.items[0]!,
    reflection: { ...journal.items[0]!.reflection, id: 'reflection-unlinked-story', subject: undefined, title: undefined },
    subject: undefined,
  }],
});

const gatewayFor = (answer: 'full' | 'unlinked' | 'reopened' | 'archived' | 'empty' | 'no-container' | 'loading' | 'journal-error' | 'picker-error' | 'failed') => {
  const completedWork = ProjectCompletedWorkResultSchema.parse({
    projectId: PROJECT,
    candidates: answer === 'full' ? [subject] : [],
  });
  const gateway = new FakeWorkManagerGateway({
    projects: [root],
    pages: [page],
    sections: answer === 'no-container' ? [] : [section],
    journal:
      answer === 'unlinked'
        ? unlinkedJournal
        : answer === 'full'
          ? journal
          : answer === 'reopened'
            ? reopenedJournal
            : answer === 'archived'
              ? archivedJournal
              : { projectId: PROJECT, items: [] },
    completedWork,
  });
  if (answer === 'loading') {
    gateway.journal.get = () => new Promise(() => undefined);
    gateway.journal.completedWork = () => new Promise(() => undefined);
    gateway.sections.list = () => new Promise(() => undefined);
  }
  if (answer === 'journal-error') {
    gateway.journal.get = async () => {
      throw new GatewayError('unreachable', 0, 'The journal is not readable.');
    };
  }
  if (answer === 'picker-error') {
    gateway.journal.completedWork = async () => {
      throw new GatewayError('unreachable', 0, 'Completed work is not readable.');
    };
  }
  if (answer === 'failed') {
    gateway.journal.get = async () => {
      throw new GatewayError('unreachable', 0, 'The host is not answering.');
    };
    gateway.journal.completedWork = async () => {
      throw new GatewayError('unreachable', 0, 'The host is not answering.');
    };
    gateway.sections.list = async () => {
      throw new GatewayError('unreachable', 0, 'The host is not answering.');
    };
  }
  return gateway;
};

const meta: Meta<ReflectionsPage> = {
  title: 'Projects/ReflectionsPage',
  component: ReflectionsPage,
  decorators: [applicationConfig({ providers: [provideRouter([]), { provide: LIVE_UPDATES, useValue: new FakeLiveUpdates() }] })],
  args: {
    projectId: PROJECT,
    pageId: PAGE,
    projectLayoutMode: 'flow',
    restoreBlocked: false,
    shortcutsAllowed: false,
    onProjectDataChange: () => undefined,
    onProjectHierarchyChange: () => undefined,
  },
};

export default meta;
type Story = StoryObj<ReflectionsPage>;

export const FullJournal: Story = {
  decorators: [applicationConfig({ providers: [{ provide: WORK_MANAGER_GATEWAY, useValue: gatewayFor('full') }] })],
};

export const UnlinkedOnly: Story = {
  decorators: [applicationConfig({ providers: [{ provide: WORK_MANAGER_GATEWAY, useValue: gatewayFor('unlinked') }] })],
};

export const RetainedReopenedSubject: Story = {
  decorators: [applicationConfig({ providers: [{ provide: WORK_MANAGER_GATEWAY, useValue: gatewayFor('reopened') }] })],
};

export const RetainedArchivedSubject: Story = {
  decorators: [applicationConfig({ providers: [{ provide: WORK_MANAGER_GATEWAY, useValue: gatewayFor('archived') }] })],
};

export const Empty: Story = {
  decorators: [applicationConfig({ providers: [{ provide: WORK_MANAGER_GATEWAY, useValue: gatewayFor('empty') }] })],
};

export const NoContainer: Story = {
  decorators: [applicationConfig({ providers: [{ provide: WORK_MANAGER_GATEWAY, useValue: gatewayFor('no-container') }] })],
};

export const Loading: Story = {
  decorators: [applicationConfig({ providers: [{ provide: WORK_MANAGER_GATEWAY, useValue: gatewayFor('loading') }] })],
};

export const JournalError: Story = {
  decorators: [applicationConfig({ providers: [{ provide: WORK_MANAGER_GATEWAY, useValue: gatewayFor('journal-error') }] })],
};

export const PickerError: Story = {
  decorators: [applicationConfig({ providers: [{ provide: WORK_MANAGER_GATEWAY, useValue: gatewayFor('picker-error') }] })],
};

export const Unreadable: Story = {
  decorators: [applicationConfig({ providers: [{ provide: WORK_MANAGER_GATEWAY, useValue: gatewayFor('failed') }] })],
};
