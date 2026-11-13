import { provideRouter } from '@angular/router';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { applicationConfig } from '@storybook/angular-vite';
import { ProjectSchema, type ProjectId } from '@cwm/contracts';
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

/**
 * Slice 81, B's root level inside Kitchen: the action row (the chevron up, the pencil and its menu),
 * the root's pages, and a workstream's disclosure, opened because it holds the current item.
 */
export const RootLevel: Story = {
  args: {
    projectTree: [{ project: KITCHEN, children: [{ project: ProjectSchema.parse({ ...KITCHEN, id: 'project-cabinets', kind: 'subproject', parentProjectId: 'project-kitchen', name: 'Cabinets' }), children: [] }] }],
    projectActions: true,
    projectPlace: {
      projectId: 'project-cabinets' as ProjectId, status: 'ready', root: { id: 'project-kitchen' as ProjectId, name: 'Kitchen', status: 'active' },
      ancestors: [{ id: 'project-kitchen' as ProjectId, name: 'Kitchen', status: 'active' }], current: { id: 'project-cabinets' as ProjectId, name: 'Cabinets', status: 'active' },
      pages: [{ kind: 'todos', label: 'Todos' }], currentKind: null, addBlockedReason: null,
    },
    pageSettingsRequested: fn(),
    addWorkstreamRequested: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'All projects' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Edit project' })).toHaveAttribute('aria-haspopup', 'menu');
    await expect(canvas.getByRole('link', { name: 'Cabinets' })).toHaveAttribute('aria-current', 'page');
  },
};

export const Empty: Story = { args: { projectTree: [] } };

export const ArchivedOnly: Story = {
  args: { projectTree: [], hasArchived: true },
  play: async ({ canvasElement }) => {
    const empty = within(canvasElement.querySelector<HTMLElement>('[data-projects-empty]')!);
    await expect(empty.getByText('No active projects.', { exact: false })).toBeVisible();
    await expect(empty.getByRole('link', { name: 'View archives' })).toHaveAttribute('href', '/settings/archived-projects');
  },
};
