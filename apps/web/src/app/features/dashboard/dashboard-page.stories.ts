import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { applicationConfig } from '@storybook/angular-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { FakeWorkManagerGateway, emptyDashboard, fakeIdentityProvider } from '../../core/gateway/testing/fake-gateway';
import { testIdentity } from '../../core/gateway/testing/shell-test-providers';
import { WORK_MANAGER_GATEWAY } from '../../core/gateway/work-manager-gateway';
import { IDENTITY_PROVIDER } from '../../core/identity/identity-provider';
import { SHELL_COMMANDS } from '../../core/shell/shell-commands';
import { DashboardPage } from './dashboard-page';

const requestCreate = fn();

/**
 * Home over an empty workspace (§24, Slice 79, W1-001): the first-run block above the widgets,
 * which keep their own empty sentences below (Q3 (a)). Outside `AppShell` the page has no
 * `SHELL_COMMANDS`, so the story provides one that says the workspace is empty.
 */
const meta: Meta<DashboardPage> = {
  title: 'Dashboard/Home',
  component: DashboardPage,
  decorators: [applicationConfig({ providers: [
    provideRouter([]),
    { provide: WORK_MANAGER_GATEWAY, useValue: new FakeWorkManagerGateway({ dashboard: emptyDashboard() }) },
    { provide: IDENTITY_PROVIDER, useValue: fakeIdentityProvider(testIdentity()) },
    { provide: SHELL_COMMANDS, useValue: { workspaceEmpty: signal(true), requestCreate, refreshProjects: async () => undefined } },
  ] })],
};
export default meta;
type Story = StoryObj<DashboardPage>;

export const FirstRun: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'New project' }));
    await expect(requestCreate).toHaveBeenCalled();
  },
};
