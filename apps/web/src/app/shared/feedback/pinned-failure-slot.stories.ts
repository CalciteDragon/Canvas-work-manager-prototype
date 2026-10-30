import { moduleMetadata, type Meta, type StoryObj } from '@storybook/angular-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { Failure } from './failure';
import { FailureMessage } from './failure-message';
import { PinnedFailureDirective } from './pinned-failure.directive';
import { PinnedFailureSlot } from './pinned-failure-slot';

const FAILED: Failure = { sentence: 'Couldn’t complete “Order tiles”. Try again.', reason: 'Task "task-tiles" could not be completed.' };
const rows = Array.from({ length: 24 }, (_, index) => `Task ${index + 1}`);

/**
 * Off-screen write failures (Slice 78, §24). A scroll port holds a long list whose one failed row
 * sits below the fold, so its failure is pinned to the port's bottom edge with ↓. Pressing the
 * copy scrolls the row's sentence into view and focuses the control it describes; scrolling it
 * into view by hand unpins it; Dismiss hides this occurrence and never scrolls.
 */
const meta: Meta = {
  title: 'Shared/Feedback/Pinned failure',
  decorators: [moduleMetadata({ imports: [FailureMessage, PinnedFailureDirective, PinnedFailureSlot] })],
  parameters: { layout: 'padded' },
  render: (args) => ({
    props: { ...args, rows, failure: FAILED },
    template: `
      <div data-story-port style="anchor-name: --toast-track; block-size: calc(var(--toast-max-block-size) * 2); overflow: auto; display: grid; gap: var(--space-2); padding: var(--space-4); border: var(--border-hairline) solid var(--color-border)">
        @for (row of rows; track row; let last = $last) {
          @if (last) {
            <div data-failed-row [appPinnedFailure]="failure" pinnedFailureSubject="Order tiles" pinnedFailureSentence="story-row-error" style="display: grid; gap: var(--space-1)">
              <label><input type="checkbox" data-row-control aria-describedby="story-row-error" /> Order tiles</label>
              <app-failure-message [failure]="failure" weight="inline" live="alert" sentenceId="story-row-error" />
            </div>
          } @else {
            <label><input type="checkbox" /> {{ row }}</label>
          }
        }
        <app-pinned-failure-slot />
      </div>`,
  }),
};
export default meta;
type Story = StoryObj;

/** The failed row is below the fold: one pinned copy at the bottom edge, a button and not an alert. */
export const PinnedBelow: Story = {
  play: async ({ canvasElement }) => {
    const pin = await waitFor(() => {
      const found = canvasElement.querySelector<HTMLButtonElement>('[data-failure-pin="bottom"]');
      if (!found) throw new Error('not pinned yet');
      return found;
    });
    await expect(pin).toHaveTextContent('↓ Couldn’t complete “Order tiles”.');
    await expect(pin).toHaveAccessibleName('Show “Order tiles”: Couldn’t complete “Order tiles”.');
    await expect(canvasElement.querySelector('[data-failure-pin="top"]')).toBeNull();
  },
};

/** Pressing reveals the sentence and focuses the checkbox it describes; the copy then goes. */
export const PressReveals: Story = {
  play: async (context) => {
    await PinnedBelow.play!(context);
    const { canvasElement } = context;
    await userEvent.click(canvasElement.querySelector<HTMLButtonElement>('[data-failure-pin="bottom"]')!);
    await expect(canvasElement.querySelector('[data-row-control]')).toHaveFocus();
    await waitFor(() => expect(canvasElement.querySelector('[data-failure-pin]')).toBeNull());
    await expect(within(canvasElement).getByRole('alert')).toHaveTextContent('Couldn’t complete “Order tiles”.');
  },
};

/** Dismiss hides this occurrence without scrolling; the row keeps its failure. */
export const Dismissed: Story = {
  play: async (context) => {
    await PinnedBelow.play!(context);
    const { canvasElement } = context;
    const port = canvasElement.querySelector<HTMLElement>('[data-story-port]')!;
    const before = port.scrollTop;
    await userEvent.click(canvasElement.querySelector<HTMLButtonElement>('[data-failure-pin-dismiss="bottom"]')!);
    await expect(canvasElement.querySelector('[data-failure-pin]')).toBeNull();
    await expect(port.scrollTop).toBe(before);
    await expect(canvasElement.querySelector('[data-failed-row] [data-failure-sentence]')).not.toBeNull();
  },
};
