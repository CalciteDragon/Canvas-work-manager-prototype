import { provideRouter } from '@angular/router';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { applicationConfig } from '@storybook/angular-vite';
import { ProjectSchema } from '@cwm/contracts';
import { FakeWorkManagerGateway } from '../../../core/gateway/testing/fake-gateway';
import { WORK_MANAGER_GATEWAY } from '../../../core/gateway/work-manager-gateway';
import { ArchivedProjectsPage } from './archived-projects-page';

const project = ProjectSchema.parse({ id: 'old-launch', workspaceId: 'workspace-story', kind: 'root', name: 'Old launch',
  status: 'archived', projectLayoutMode: 'flow', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' });

const meta: Meta<ArchivedProjectsPage> = {
  title: 'Settings/Archived projects',
  component: ArchivedProjectsPage,
  decorators: [applicationConfig({ providers: [provideRouter([]), {
    provide: WORK_MANAGER_GATEWAY,
    useValue: new FakeWorkManagerGateway({ projects: [project], archivedProjects: { items: [{ project, breadcrumb: [{ projectId: project.id, name: project.name }] }] } }),
  }] })],
};
export default meta;
type Story = StoryObj<ArchivedProjectsPage>;
export const Ready: Story = {};
