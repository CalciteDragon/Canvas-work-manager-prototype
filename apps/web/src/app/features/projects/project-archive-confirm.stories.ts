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
 * §81's archive confirmation, and Slice 79's blocked form (L4-008): with live workstreams under
 * the project the domain would refuse the archive, so the dialog says so first and offers no
 * commit.
 */
const meta: Meta<ProjectArchiveConfirm> = {
  title: 'Projects/ProjectArchiveConfirm',
  component: ProjectArchiveConfirm,
  decorators: [applicationConfig({ providers: [provideRouter([])] })],
  args: { project: RENOVATION, opener: document.body, archive: fn(async () => true), liveChildren: [] },
};
export default meta;
type Story = StoryObj<ProjectArchiveConfirm>;

/** Nothing live underneath: the commit form, as before. */
export const Commit: Story = {};

/** Live workstreams, a completed one included: each a link with its status, and Close only. */
export const Blocked: Story = {
  args: {
    liveChildren: [
      project('project-kitchen', 'Kitchen', 'active', RENOVATION.id),
      project('project-garden', 'Garden', 'completed', RENOVATION.id),
    ],
  },
  play: async ({ canvasElement }) => {
    const dialog = within(canvasElement.ownerDocument.body);
    await expect(dialog.getByRole('heading', { name: '“Home renovation” can’t be archived yet' })).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Garden' })).toHaveAttribute('href', '/projects/project-garden');
    await expect(dialog.queryByRole('button', { name: 'Archive it' })).toBeNull();
    await expect(dialog.getByRole('button', { name: 'Close' })).toHaveFocus();
  },
};
