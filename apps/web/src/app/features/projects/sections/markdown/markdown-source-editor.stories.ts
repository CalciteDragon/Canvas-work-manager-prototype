import type { Meta, StoryObj } from '@storybook/angular-vite';
import { expect, userEvent, within } from 'storybook/test';
import { MarkdownSourceEditor } from './markdown-source-editor';

const meta: Meta<MarkdownSourceEditor> = {
  title: 'Projects/Sections/Markdown source editor',
  component: MarkdownSourceEditor,
  args: { initialSource: '# Kickoff\n\n- Pick a date\n- Write the brief', initialDraft: null, name: 'Kickoff' },
};
export default meta;
type Story = StoryObj<MarkdownSourceEditor>;

export const Fresh: Story = {};
/** Slice 79 (L3-012): a draft kept by Cancel or navigation, offered back with Discard draft. */
export const DraftBack: Story = {
  args: { initialDraft: '# Kickoff\n\n- Pick a date\n- Write the brief\n- Book the venue' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('status')).toHaveTextContent('Your unsaved draft is back.');
    await expect(canvas.getByRole('button', { name: 'Discard draft' })).toBeVisible();
  },
};
/** Slice 79 (W4-031): the rendered draft is captioned, not only marked by `aria-pressed`. */
export const UnsavedPreview: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Preview' }));
    await expect(canvas.getByText('Unsaved preview')).toBeVisible();
  },
};
