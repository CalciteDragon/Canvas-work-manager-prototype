import { provideRouter } from '@angular/router';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { applicationConfig } from '@storybook/angular-vite';
import { ProjectSchema } from '@cwm/contracts';
import { expect, fn, within } from 'storybook/test';
import { Sidebar } from './sidebar';

const KITCHEN = ProjectSchema.parse({ id: 'project-kitchen', workspaceId: 'workspace-story', kind: 'root', name: 'Kitchen',
  status: 'active', projectLayoutMode: 'flow', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' });

/**
 * §23's sidebar and its empty states (Slice 79, W4-034): "No projects yet" only when nothing
 * exists; with only archived projects, "No active projects." and the way to them in Settings.
 */
const meta: Meta<Sidebar> = {
  title: 'Shell/Sidebar',
  component: Sidebar,
  decorators: [applicationConfig({ providers: [provideRouter([])] })],
  args: { projectTree: [{ project: KITCHEN, children: [] }], failure: null, loading: false, createError: null, hasArchived: false,
    createRequested: fn(), retryRequested: fn() },
};
export default meta;
type Story = StoryObj<Sidebar>;

export const Projects: Story = {};

export const Empty: Story = { args: { projectTree: [] } };

export const ArchivedOnly: Story = {
  args: { projectTree: [], hasArchived: true },
  play: async ({ canvasElement }) => {
    const empty = within(canvasElement.querySelector<HTMLElement>('[data-projects-empty]')!);
    await expect(empty.getByText('No active projects.', { exact: false })).toBeVisible();
    await expect(empty.getByRole('link', { name: 'View archives' })).toHaveAttribute('href', '/settings/archived-projects');
  },
};
