import type { Meta, StoryObj } from '@storybook/angular-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { FailureMessage } from './failure-message';

const REASON = 'Task list "section-kitchen-tasks" could not be read: the prototype host is not running.';

const meta: Meta<FailureMessage> = {
  title: 'Shared/Feedback/Failure message',
  component: FailureMessage,
  args: {
    failure: { sentence: 'Couldn’t load this task list.', reason: REASON },
    weight: 'region',
    live: 'alert',
    recovery: 'try-again',
    pending: false,
    retry: fn(),
  },
};
export default meta;
type Story = StoryObj<FailureMessage>;

/** A read failure replacing a section body: sentence, Try again, and the reason under Details. */
export const Region: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('alert')).toHaveTextContent('Couldn’t load this task list.');
    const details = canvasElement.querySelector('details')!;
    await expect(details.open).toBe(false);
    await userEvent.click(canvas.getByText('Details'));
    await expect(details.open).toBe(true);
    await expect(details).toHaveTextContent(REASON);
    await userEvent.click(canvas.getByRole('button', { name: 'Try again' }));
    await expect(args.retry).toHaveBeenCalledOnce();
  },
};

/** The digest's provider failure: no reason travels, so there is no Details. */
export const RegionWithoutReason: Story = {
  args: { failure: { sentence: 'Couldn’t write today’s digest.', reason: null } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('details')).toBeNull();
  },
};

/** Stale content still on screen is said politely. */
export const Stale: Story = {
  args: { failure: { sentence: 'This list may be out of date.', reason: REASON }, live: 'status' },
};

/** A committed write whose follow-up read failed. */
export const RetryRefresh: Story = {
  args: { failure: { sentence: 'Saved, but this journal couldn’t refresh.', reason: REASON }, live: 'status', recovery: 'retry-refresh' },
};

/** A retry in flight: busy, with its button aria-disabled. */
export const Pending: Story = {
  args: { failure: { sentence: 'Couldn’t write today’s digest.', reason: null }, pending: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Try again' })).toHaveAttribute('aria-disabled', 'true');
  },
};

/** A write failure on its row, field or card, in slice 75's failed tone. */
export const Inline: Story = {
  args: { failure: { sentence: 'Couldn’t complete “Order tiles”. Try again.', reason: REASON }, weight: 'inline', recovery: null },
};
