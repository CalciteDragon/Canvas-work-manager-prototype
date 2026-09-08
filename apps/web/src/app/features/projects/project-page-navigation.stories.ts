import type { Meta, StoryObj } from '@storybook/angular-vite';
import { applicationConfig, componentWrapperDecorator } from '@storybook/angular-vite';
import { provideRouter } from '@angular/router';
import { ProjectPageSchema, ProjectSchema, type Project, type ProjectPage } from '@cwm/contracts';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ProjectPageNavigation } from './project-page-navigation';
import type { WorkTreeNode } from './project-workspace-store';

const AT = '2026-09-05T10:00:00.000Z';

const project = (id: string, name: string, parentProjectId?: string, icon?: string): Project =>
  ProjectSchema.parse({
    id,
    workspaceId: 'workspace-story',
    ...(parentProjectId === undefined ? { kind: 'root' } : { kind: 'subproject', parentProjectId }),
    name,
    icon,
    status: 'active',
    projectLayoutMode: 'flow',
    createdAt: AT,
    updatedAt: AT,
  });

const ROOT = project('project-renovation', 'Home renovation', undefined, '🏠');
const KITCHEN = project('project-kitchen', 'Kitchen', 'project-renovation', '🍳');
const CABINETS = project('project-cabinets', 'Cabinets', 'project-kitchen');
const GARDEN = project('project-garden', 'Garden', 'project-renovation', '🌿');

const workTree: WorkTreeNode[] = [
  { project: KITCHEN, children: [{ project: CABINETS, children: [] }] },
  { project: GARDEN, children: [] },
];

const page = (id: string, kind: ProjectPage['kind'], enabled = true): ProjectPage =>
  ProjectPageSchema.parse({ id, projectId: ROOT.id, kind, enabled, createdAt: AT, updatedAt: AT });

const HOME_ONLY: ProjectPage[] = [page('page-home', 'home')];
const ALL_ENABLED: ProjectPage[] = [
  page('page-home', 'home'),
  page('page-todos', 'todos'),
  page('page-archive', 'archive'),
  page('page-reflections', 'reflections'),
];

/**
 * §23's project navigation column. Presentational, so a story is the whole component: it
 * injects nothing and every state below is an input.
 *
 * The wrapper gives it the width the shell's grid track supplies, because the column's own
 * stylesheet sets no width — `--layout-project-column-width` is applied by
 * `project-workspace-shell.scss`, and a bare column would stretch to the canvas.
 */
const meta: Meta<ProjectPageNavigation> = {
  title: 'Projects/ProjectPageNavigation',
  component: ProjectPageNavigation,
  decorators: [
    // `RouterLink` injects `Router` and `ActivatedRoute`; an empty route array is enough,
    // since a link renders its `href` from `serializeUrl` and never checks the target.
    // `applicationConfig`, not `moduleMetadata`: `provideRouter` returns `EnvironmentProviders`.
    applicationConfig({ providers: [provideRouter([])] }),
    componentWrapperDecorator(
      (story) => `<div style="width: var(--layout-project-column-width); height: 24rem;">${story}</div>`,
    ),
  ],
  args: {
    root: ROOT,
    pages: ALL_ENABLED,
    workTree,
    currentProjectId: ROOT.id,
    activeKind: 'home',
    breadcrumbs: [],
    collapsed: false,
  },
};

export default meta;
type Story = StoryObj<ProjectPageNavigation>;

/** A root: its required Home is current, and the work hierarchy sits beneath it. */
export const Root: Story = {};

/** A new root starts with its required Home and no optional page records. */
export const HomeOnly: Story = {
  args: { pages: HOME_ONLY },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('Manage pages'));
    await expect(canvas.getByRole('checkbox', { name: 'Show Home page' })).toBeDisabled();
  },
};

/** Every currently implemented optional page is enabled. */
export const AllEnabled: Story = { args: { pages: ALL_ENABLED } };

/**
 * A unit of work three levels down. The column is still its **root's** — §23's "opening a
 * subproject keeps its root's column" — so no page tab is current, the open work unit is
 * marked instead, and breadcrumbs lead back through its parents.
 */
export const SubprojectWithBreadcrumbs: Story = {
  args: { currentProjectId: CABINETS.id, activeKind: null, breadcrumbs: [ROOT, KITCHEN] },
};

/** The same root-owned manager remains available while a descendant work canvas is open. */
export const SubprojectContext: Story = {
  args: { currentProjectId: KITCHEN.id, activeKind: null, breadcrumbs: [ROOT], pages: ALL_ENABLED },
};

/**
 * The narrow-width state. The toggle stays outside the collapsed region — a control that
 * collapses with what it collapses cannot bring it back — and the panel is `hidden`, so its
 * links leave the tab order rather than merely disappearing.
 */
export const Collapsed: Story = {
  args: { collapsed: true },
};

/** A root with nothing under it yet: the empty hierarchy says so rather than showing nothing. */
export const NoWorkYet: Story = {
  args: { workTree: [] },
};

/** The manager stays usable while a non-optimistic page write is in flight. */
export const Pending: Story = {
  args: { pages: HOME_ONLY, pageWritePending: true },
};

/** A failed write or context read is visible beside the controls. */
export const Refused: Story = {
  args: {
    pages: HOME_ONLY,
    pageWriteError: 'The Archive page could not be saved.',
  },
};

/** The disclosure and its event binding are real, even though the story has no gateway. */
export const ToggleOptionalPage: Story = {
  args: { pages: HOME_ONLY, pageToggleRequested: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('Manage pages'));
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Show Todos page' }));
    await expect(args.pageToggleRequested).toHaveBeenCalledWith({ kind: 'todos', enabled: true });
  },
};
