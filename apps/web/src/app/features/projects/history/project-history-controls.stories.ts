import type { Meta, StoryObj } from '@storybook/angular-vite';
import { expect, userEvent, within } from 'storybook/test';
import { ProjectHistoryControls } from './project-history-controls';

const meta: Meta<ProjectHistoryControls> = {
  title: 'Projects/ProjectHistoryControls',
  component: ProjectHistoryControls,
  args: {
    undo: { name: 'Undo: Collapsed the Tasks shortcut', enabled: true },
    redo: { name: 'Nothing to redo', enabled: false },
    retryAvailable: false,
  },
};

export default meta;
type Story = StoryObj<ProjectHistoryControls>;

/** The next Undo names what it will change; Redo says why it cannot act, and stays focusable. */
export const UndoAvailable: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const redo = canvas.getByRole('button', { name: 'Nothing to redo' });
    await expect(redo).toHaveAttribute('aria-disabled', 'true');
    await expect(redo).not.toHaveAttribute('disabled');
    await userEvent.tab();
    await expect(canvas.getByRole('button', { name: 'Undo: Collapsed the Tasks shortcut' })).toHaveFocus();
  },
};

export const BothAvailable: Story = {
  args: {
    undo: { name: 'Undo: Renamed "Home renovation" to "House"', enabled: true },
    redo: { name: 'Redo: Moved the Tasks shortcut', enabled: true },
  },
};

/** An archived ancestor blocks this step; the name says which project to reactivate. */
export const BlockedByArchivedAncestor: Story = {
  args: {
    undo: { name: 'Undo unavailable while Legacy attic is archived', enabled: false },
    redo: { name: 'Nothing to redo', enabled: false },
  },
};

export const Saving: Story = {
  args: {
    undo: { name: 'Undoing…', enabled: false },
    redo: { name: 'Saving a change…', enabled: false },
  },
};

export const Loading: Story = {
  args: {
    undo: { name: 'Loading history…', enabled: false },
    redo: { name: 'Loading history…', enabled: false },
  },
};

export const Unavailable: Story = {
  args: {
    undo: { name: 'History unavailable', enabled: false },
    redo: { name: 'History unavailable', enabled: false },
    retryAvailable: true,
  },
};
