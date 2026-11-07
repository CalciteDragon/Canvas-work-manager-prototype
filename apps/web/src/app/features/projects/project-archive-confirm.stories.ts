import { provideRouter } from '@angular/router';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular-vite';
import { ProjectSchema, type Project } from '@cwm/contracts';
import { expect, fn, within } from 'storybook/test';
import { ProjectArchiveConfirm } from './project-archive-confirm';

const AT = '2026-08-27T16:00:00.000Z';
const project = (id: string, name: string, status: Project['status'], parentProjectId?: string): Project =>
  ProjectSchema.parse({
    id,
    workspaceId: 'workspace-demo',
    ...(parentProjectId === undefined ? { kind: 'root' } : { kind: 'subproject', parentProjectId }),
    name,
    status,
    projectLayoutMode: 'flow',
    createdAt: AT,
    updatedAt: AT,
  });

const RENOVATION = project('project-renovation', 'Home renovation', 'active');

/**
 * §81's archive confirmation (Slice 80): with live workstreams under the project it lists them,
 * nested, and a press names what is on screen.
 */
const meta: Meta<ProjectArchiveConfirm> = {
  title: 'Projects/ProjectArchiveConfirm',
  component: ProjectArchiveConfirm,
  decorators: [applicationConfig({ providers: [provideRouter([])] })],
  args: { project: RENOVATION, opener: document.body, archive: fn(async () => true), workstreams: [] },
};
export default meta;
type Story = StoryObj<ProjectArchiveConfirm>;

/** Nothing live underneath: the commit form, as before. */
export const Commit: Story = {};

/** Live workstreams, a nested and a completed one included: each with its status, and Archive all. */
export const WithWorkstreams: Story = {
  args: {
    workstreams: [
      { project: project('project-kitchen', 'Kitchen', 'active', RENOVATION.id), children: [{ project: project('project-cabinets', 'Cabinets', 'on_hold', 'project-kitchen'), children: [] }] },
      { project: project('project-garden', 'Garden', 'completed', RENOVATION.id), children: [] },
    ],
  },
  play: async ({ canvasElement }) => {
    const dialog = within(canvasElement.ownerDocument.body);
    await expect(dialog.getByRole('heading', { name: 'Archive “Home renovation” and its 3 workstreams?' })).toBeVisible();
    await expect(dialog.getByText('Cabinets · On hold')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Archive all' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  },
};

/** About twenty rows at phone width, which no seed holds: the list scrolls by itself. */
export const LongList: Story = {
  args: {
    workstreams: Array.from({ length: 20 }, (_, i) => ({ project: project(`project-${i}`, `Workstream ${i + 1}`, 'active', RENOVATION.id), children: [] })),
  },
  globals: { viewport: { value: 'mobile1' } },
};
