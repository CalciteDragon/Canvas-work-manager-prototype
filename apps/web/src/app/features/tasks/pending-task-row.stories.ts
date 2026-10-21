import type { Meta, StoryObj } from '@storybook/angular-vite';
import { PendingTaskRow } from './pending-task-row';

/** Slice 75's quick-add pending row: the title the person typed, busy, with nothing to act on. */
const meta: Meta<PendingTaskRow> = {
  title: 'Tasks/PendingTaskRow',
  component: PendingTaskRow,
  args: { title: 'Order sample tiles' },
};

export default meta;
type Story = StoryObj<PendingTaskRow>;

export const Adding: Story = {};
