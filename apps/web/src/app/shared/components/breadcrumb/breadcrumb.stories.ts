import { provideRouter } from '@angular/router';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { applicationConfig } from '@storybook/angular-vite';
import { expect, within } from 'storybook/test';
import { Breadcrumb } from './breadcrumb';

/**
 * Slice 81's breadcrumb (L7-004): the navigation variant above a page heading, its links themed
 * pills (decision 2), and the inline variant that writes a path inside a sentence (W2-030).
 */
const meta: Meta<Breadcrumb> = {
  title: 'Shared/Breadcrumb',
  component: Breadcrumb,
  decorators: [applicationConfig({ providers: [provideRouter([])] })],
  args: {
    items: [
      { label: 'Home renovation', link: ['/projects', 'project-home'] },
      { label: 'Kitchen', link: ['/projects', 'project-kitchen'] },
      { label: 'Cabinets', link: null },
    ],
    variant: 'navigation',
  },
};
export default meta;
type Story = StoryObj<Breadcrumb>;

export const Workstream: Story = {
  play: async ({ canvasElement }) => {
    const nav = within(canvasElement).getByRole('navigation', { name: 'Breadcrumb' });
    await expect(within(nav).getAllByRole('link').map((link) => link.textContent?.trim())).toEqual(['Home renovation', 'Kitchen']);
    await expect(within(nav).getByText('Cabinets')).toHaveAttribute('aria-current', 'page');
  },
};

/** A root's page other than its first: "Home renovation › Todos". */
export const RootPage: Story = {
  args: { items: [{ label: 'Home renovation', link: ['/projects', 'project-home'] }, { label: 'Todos', link: null }] },
};

/** Settings children: "Settings › AI & Agents". */
export const SettingsChild: Story = {
  args: { items: [{ label: 'Settings', link: '/settings' }, { label: 'AI & Agents', link: null }] },
};

/** Archive's origin path, in running text: content links, no landmark, nothing current. */
export const Inline: Story = {
  args: {
    variant: 'inline',
    items: [
      { label: 'Home renovation', link: ['/projects', 'project-home'] },
      { label: 'Legacy attic', link: ['/projects', 'project-attic'] },
      { label: 'Work canvas', link: ['/projects', 'project-attic'] },
    ],
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('navigation')).toBeNull();
    await expect(within(canvasElement).getAllByRole('link')).toHaveLength(3);
  },
};
