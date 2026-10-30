import type { Meta, StoryObj } from '@storybook/angular-vite';
import { ProjectSectionSchema } from '@cwm/contracts';
import { expect, fn, userEvent, within } from 'storybook/test';
import { MarkdownSectionBody } from './markdown-section-body';
import type { Failure } from '../../../../shared/feedback/failure';

const section = (config: unknown = { markdown: '# Kickoff\n\n- Pick a date\n- Write the brief' }) => ProjectSectionSchema.parse({
  id: 'section-markdown-story', projectId: 'project-story', pageId: 'page-story', type: 'markdown', title: 'Kickoff',
  config, position: 0, columnSpan: 12, collapsed: false,
  createdAt: '2026-10-02T12:00:00.000Z', updatedAt: '2026-10-02T12:00:00.000Z',
});

const meta: Meta<MarkdownSectionBody> = {
  title: 'Projects/Sections/Markdown',
  component: MarkdownSectionBody,
  args: { section: section(), save: fn(async () => null), readOnly: false },
};
export default meta;
type Story = StoryObj<MarkdownSectionBody>;

export const Rendered: Story = {};
export const Empty: Story = { args: { section: section({}) } };
export const ReadOnlyShortcut: Story = { args: { readOnly: true } };
export const Unreadable: Story = { args: { section: section({ text: 'Preserved foreign content' }) } };
export const Editing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Edit Markdown for Kickoff' }));
    await expect(canvas.getByRole('textbox', { name: 'Markdown source for Kickoff' })).toHaveFocus();
  },
};
export const Preview: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Edit Markdown for Kickoff' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Preview' }));
    await expect(canvas.getByRole('heading', { name: 'Kickoff', level: 3 })).toBeVisible();
  },
};
export const Pending: Story = {
  args: { save: () => new Promise<Failure | null>(() => undefined) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Edit Markdown for Kickoff' }));
    await userEvent.type(canvas.getByRole('textbox'), '\n\nDraft that is being saved.');
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    await expect(canvas.getByRole('button', { name: 'Saving…' })).toHaveAttribute('aria-disabled', 'true');
  },
};
export const Refused: Story = {
  args: { save: async (): Promise<Failure> => ({ sentence: 'Couldn’t save “Kickoff”. Try again.', reason: 'The prototype host is not answering.' }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Edit Markdown for Kickoff' }));
    await userEvent.type(canvas.getByRole('textbox'), '\n\nKeep this draft.');
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    await expect(canvas.getByRole('alert')).toHaveTextContent('Couldn’t save “Kickoff”. Try again.');
    await expect(canvas.getByRole('textbox')).toHaveValue(expect.stringContaining('Keep this draft.'));
  },
};
