import { moduleMetadata, type Meta, type StoryObj } from '@storybook/angular-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { RestoreStatusChoice } from './restore-status-choice';

/**
 * Slice 79's one restore control (L4-012), for every place that restores a project. Active is
 * preselected and shown before the press (Q2 (a)).
 */
const meta: Meta<RestoreStatusChoice> = {
  title: 'Shared/Projects/Restore status choice',
  component: RestoreStatusChoice,
  args: { subjectLabel: 'Legacy attic', pending: false, disabled: false, restore: fn() },
};
export default meta;
type Story = StoryObj<RestoreStatusChoice>;

/** "Restore as Active", one press away; a changed status is the one emitted. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const select = canvas.getByRole('combobox', { name: /Restore as/ });
    await expect(select).toHaveValue('active');
    await userEvent.click(canvas.getByRole('button', { name: 'Restore Legacy attic' }));
    await expect(args.restore).toHaveBeenLastCalledWith('active');
    await userEvent.selectOptions(select, 'on_hold');
    await userEvent.click(canvas.getByRole('button', { name: 'Restore Legacy attic' }));
    await expect(args.restore).toHaveBeenLastCalledWith('on_hold');
  },
};

/** The caller's restore in flight: both controls aria-disabled, keeping focus. */
export const Pending: Story = {
  args: { pending: true },
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Restore Legacy attic' });
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(button);
    await expect(args.restore).not.toHaveBeenCalled();
  },
};

/** A caller that cannot restore at all, such as an Archive list waiting on a re-read. */
export const Disabled: Story = { args: { disabled: true } };

/** Inside the archived variant of `.state-message`, as the Lab's specimen holds it. */
export const InArchivedBanner: Story = {
  decorators: [moduleMetadata({ imports: [RestoreStatusChoice] })],
  render: (args) => ({
    props: args,
    template: `
      <div class="state-message state-message--archived">
        <p class="state-message__sentence">“Legacy shelving” is inside “Legacy attic”, which is archived.</p>
        <app-restore-status-choice [subjectLabel]="subjectLabel" [pending]="pending" [disabled]="disabled" (restore)="restore($event)" />
      </div>
    `,
  }),
};
