import type { Meta, StoryObj } from '@storybook/angular-vite';
import type { SectionId } from '@cwm/contracts';
import type { SectionRecoveryNoticeState } from './project-page-store';
import { SectionRecoveryNotice } from './section-recovery-notice';

const meta: Meta<SectionRecoveryNotice> = {
  title: 'Projects/SectionRecoveryNotice',
  component: SectionRecoveryNotice,
  args: {
    state: {
      message: 'Removed the Notes section. Undo is in the header.',
      removal: { archiveListed: true },
    } satisfies SectionRecoveryNoticeState,
    failedRemoval: null,
    busy: false,
  },
};

export default meta;
type Story = StoryObj<SectionRecoveryNotice>;

/** A removal Archive will list: the header holds its Undo, this offers Archive. */
export const RemovedToArchive: Story = {};

/** A committed write whose follow-up read failed. */
export const RefreshFailed: Story = {
  args: {
    state: { message: 'Saved. Undo is in the header.', refreshFailed: true } satisfies SectionRecoveryNoticeState,
  },
};

/** An uncertain removal: the exact request can be retried. */
export const RemovalFailed: Story = {
  args: {
    state: null,
    failedRemoval: { sectionId: 'section-notes' as SectionId, input: {}, message: 'could not reach the prototype host' },
  },
};
