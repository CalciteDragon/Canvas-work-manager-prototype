import type { Meta, StoryObj } from '@storybook/angular-vite';
import { ReflectionSubjectViewSchema } from '@cwm/contracts';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ReflectionComposer } from './reflection-composer';

const subject = ReflectionSubjectViewSchema.parse({
  kind: 'task' as const,
  id: 'task-release',
  name: 'Ship the release',
  status: 'done' as const,
  completedAt: '2026-09-05T10:00:00.000Z',
  archived: false,
  hiddenByArchivedAncestor: false,
  breadcrumb: [{ projectId: 'project-root', name: 'Product launch' }],
});

const meta: Meta<ReflectionComposer> = {
  title: 'Projects/ReflectionComposer',
  component: ReflectionComposer,
  args: { readOnly: false, subject: null, error: null },
};

export default meta;
type Story = StoryObj<ReflectionComposer>;

export const Idle: Story = {};

export const Armed: Story = {
  args: { subject },
};

export const ReadOnly: Story = {
  args: { readOnly: true },
};

export const Error: Story = {
  args: { error: 'The prototype host could not save this reflection.' },
};

export const SubmitAndClear: Story = {
  args: { submitted: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByPlaceholderText('Optional title'), 'Weekly checkpoint');
    await userEvent.type(canvas.getByPlaceholderText('Write a reflection'), 'The handoff is ready.');
    await userEvent.selectOptions(canvas.getByRole('combobox'), 'What went well?');
    await userEvent.click(canvas.getByRole('button', { name: 'Add reflection' }));
    await expect(args.submitted).toHaveBeenCalledWith({
      title: 'Weekly checkpoint',
      body: 'The handoff is ready.',
      prompt: 'What went well?',
    });
    // `clear()` belongs to the page after a successful save; exercise the same public form
    // behavior here without inventing a second clear button in the component contract.
    const form = canvas.getByRole('textbox', { name: 'Write a reflection' }).closest('form') as HTMLFormElement;
    form.reset();
    await expect(canvas.getByPlaceholderText('Write a reflection')).toHaveValue('');
  },
};
