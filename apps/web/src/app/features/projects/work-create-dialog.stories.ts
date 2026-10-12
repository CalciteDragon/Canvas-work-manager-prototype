import type { Meta, StoryObj } from '@storybook/angular-vite';
import type { ProjectId } from '@cwm/contracts';
import { expect, fn, userEvent, within } from 'storybook/test';
import { WorkCreateDialog, type WorkCreateParent } from './work-create-dialog';

const parents: WorkCreateParent[] = [
  { id: 'project-root' as ProjectId, name: 'Renovation', depth: 0, completed: false },
  { id: 'project-kitchen' as ProjectId, name: 'Kitchen', depth: 1, completed: false },
  { id: 'project-cabinets' as ProjectId, name: 'Cabinets', depth: 2, completed: false },
  { id: 'project-garden' as ProjectId, name: 'Garden', depth: 1, completed: true },
];

const meta: Meta<WorkCreateDialog> = {
  title: 'Projects/WorkCreateDialog',
  component: WorkCreateDialog,
  args: { parents, create: fn(async () => null), closed: fn() },
};
export default meta;
type Story = StoryObj<WorkCreateDialog>;

/** Work creation starts under the root even while viewing a descendant. */
export const Default: Story = {};

/** The explicit selected parent stays visible immediately before Create. */
export const NestedParent: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(canvas.getByRole('combobox', { name: 'Parent' }), 'project-kitchen');
    await expect(canvas.getByText('Inside Kitchen')).toBeVisible();
  },
};

export const Pending: Story = {
  args: { create: () => new Promise<string | null>(() => undefined) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('textbox', { name: 'Name' }), 'Paint samples');
    await userEvent.click(canvas.getByRole('button', { name: /^Create$/ }));
    await expect(canvas.getByRole('dialog')).toHaveAttribute('aria-busy', 'true');
  },
};

export const Refused: Story = {
  args: { create: async () => 'The parent is archived.' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('textbox', { name: 'Name' }), 'Paint samples');
    await userEvent.selectOptions(canvas.getByRole('combobox', { name: 'Parent' }), 'project-kitchen');
    await userEvent.click(canvas.getByRole('button', { name: /^Create$/ }));
    await expect(canvas.getByRole('alert')).toHaveTextContent('The parent is archived.');
  },
};

export const RootOnly: Story = { args: { parents: parents.slice(0, 1) } };
