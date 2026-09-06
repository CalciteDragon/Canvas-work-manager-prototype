import type { Meta, StoryObj } from '@storybook/angular-vite';
import { applicationConfig, componentWrapperDecorator } from '@storybook/angular-vite';
import { provideRouter } from '@angular/router';
import { ProjectSchema, type Project } from '@cwm/contracts';
import { PROJECT_PAGE_REGISTRY } from './project-page-registry';
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
    pages: [...PROJECT_PAGE_REGISTRY],
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

/**
 * A unit of work three levels down. The column is still its **root's** — §23's "opening a
 * subproject keeps its root's column" — so no page tab is current, the open work unit is
 * marked instead, and breadcrumbs lead back through its parents.
 */
export const SubprojectWithBreadcrumbs: Story = {
  args: { currentProjectId: CABINETS.id, activeKind: null, breadcrumbs: [ROOT, KITCHEN] },
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
