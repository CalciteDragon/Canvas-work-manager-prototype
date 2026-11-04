import type { Meta, StoryObj } from '@storybook/angular-vite';
import { ProjectSchema, type Project } from '@cwm/contracts';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ArchivedBanner } from './archived-banner';

const AT = '2026-08-27T16:00:00.000Z';
const project = (id: string, name: string, status: 'active' | 'archived', parentProjectId?: string): Project =>
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

const ATTIC = project('project-attic', 'Legacy attic', 'archived');
const SHELVING = project('project-shelving', 'Legacy shelving', 'active', 'project-attic');
const RENOVATION = project('project-renovation', 'Home renovation', 'archived');
const KITCHEN = project('project-kitchen', 'Kitchen', 'archived', 'project-renovation');

/**
 * Slice 79's banner over every page of a read-only project (§26, §31, L4-007): which project makes
 * the page read-only, and the shared restore choice on it, the outermost archived owner.
 */
const meta: Meta<ArchivedBanner> = {
  title: 'Projects/ArchivedBanner',
  component: ArchivedBanner,
  args: { project: ATTIC, owner: ATTIC, pending: false, disabled: false, failure: null, restore: fn() },
};
export default meta;
type Story = StoryObj<ArchivedBanner>;

/** The project itself is archived: "Restore as Active", one press away. */
export const Own: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('“Legacy attic” is archived.')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Restore Legacy attic' }));
    await expect(args.restore).toHaveBeenLastCalledWith('active');
  },
};

/** Live work under an archived ancestor: the restore is the ancestor's. */
export const Ancestor: Story = { args: { project: SHELVING, owner: ATTIC } };

/** Archived itself and under an archived ancestor: the outer one first. */
export const ArchivedTwice: Story = { args: { project: KITCHEN, owner: RENOVATION } };

/** The restore in flight: the banner is busy and the choice aria-disabled, keeping focus. */
export const Pending: Story = { args: { pending: true } };

/** A failed restore, in the banner with its reason under Details. */
export const Failure: Story = {
  args: {
    failure: { ownerId: ATTIC.id, sentence: 'Couldn’t restore “Legacy attic”. Try again.', reason: 'The host did not answer.', retryable: true },
  },
};

/** A refusal Try again could not cure: no Try again; a context refresh moves the banner on. */
export const Refused: Story = {
  args: {
    project: SHELVING,
    failure: { ownerId: ATTIC.id, sentence: 'Couldn’t restore “Legacy attic”. Something above it may have been archived.', reason: 'parent is archived', retryable: false },
  },
};
