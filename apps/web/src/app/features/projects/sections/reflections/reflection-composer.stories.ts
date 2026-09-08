import type { Meta, StoryObj } from '@storybook/angular-vite';
import { ReflectionSubjectViewSchema } from '@cwm/contracts';
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
