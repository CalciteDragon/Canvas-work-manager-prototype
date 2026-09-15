import type { Meta, StoryObj } from '@storybook/angular-vite';
import type { UndoReceipt, UndoRecordId } from '@cwm/contracts';
import type { SectionUndoNoticeState } from './project-page-store';
import { SectionUndoNotice } from './section-undo-notice';

const receipt: UndoReceipt = {
  undoId: 'undo-story' as UndoRecordId,
  operation: 'section.remove',
  sequence: 1,
  label: 'Removed Notes',
  createdAt: '2026-09-14T09:00:00.000Z',
  expiresAt: '2026-09-15T09:00:00.000Z',
};

const meta: Meta<SectionUndoNotice> = {
  title: 'Projects/SectionUndoNotice',
  component: SectionUndoNotice,
  args: {
    state: {
      kind: 'available',
      receipt,
      message: 'Section removed. Undo is available on this page.',
    } satisfies SectionUndoNoticeState,
    failedRemoval: null,
    busy: false,
  },
};

export default meta;
type Story = StoryObj<SectionUndoNotice>;

export const Available: Story = {};

export const Conflict: Story = {
  args: {
    state: {
      kind: 'refusal',
      receipt,
      message: 'undo_conflict: Undo could not safely restore the removed section.',
      refusal: {
        reason: 'undo_conflict',
        undoId: receipt.undoId,
        conflicts: [{
          entityType: 'task',
          id: 'task-story',
          title: 'Confirm delivery',
          problem: 'moved',
          nextStep: 'move-back-and-retry',
        }],
      },
    },
  },
};

export const RefreshNeeded: Story = {
  args: {
    state: { kind: 'result', receipt: null, message: 'Undo restored Notes.', refreshFailed: true },
  },
};
