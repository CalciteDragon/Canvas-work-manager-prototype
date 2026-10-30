import { provideRouter } from '@angular/router';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular-vite';
import { expect, within } from 'storybook/test';
import { UnavailablePage } from './unavailable-page';

const meta: Meta<UnavailablePage> = {
  title: 'Shared/Unavailable page',
  component: UnavailablePage,
  decorators: [applicationConfig({ providers: [provideRouter([])] })],
};
export default meta;
type Story = StoryObj<UnavailablePage>;

/** A project the user cannot see: the same words whether it was removed or belongs to someone else. */
export const Project: Story = {
  args: { heading: 'This project isn’t available', sentence: 'It may have been removed, or it isn’t shared with you.' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { level: 1 })).toHaveAttribute('data-route-focus');
    await expect(canvas.getByRole('link', { name: 'Go to Home' })).toHaveAttribute('href', '/app');
    await expect(canvasElement.querySelector('details')).toBeNull();
  },
};

/** The `**` route. */
export const UnknownAddress: Story = {
  args: { heading: 'This page doesn’t exist', sentence: 'Check the address, or go to Home.' },
};
