import type { Meta, StoryObj } from '@storybook/angular-vite';
import { applicationConfig, moduleMetadata } from '@storybook/angular-vite';
import { provideRouter } from '@angular/router';
import type { OperationHistorySummary, OperationHistoryTransitionResult, ProjectId } from '@cwm/contracts';
import { expect } from 'storybook/test';
import { FakeWorkManagerGateway } from '../../core/gateway/testing/fake-gateway';
import { WORK_MANAGER_GATEWAY } from '../../core/gateway/work-manager-gateway';
import { ProjectWorkspaceShell } from './project-workspace-shell';

const PROJECT = 'project-recoverable' as ProjectId;
const HISTORY: OperationHistorySummary = {
  projectId: PROJECT,
  historyId: 'history-project-recoverable' as OperationHistorySummary['historyId'],
  revision: 2,
  undo: null,
  redo: {
    actionId: 'operation-project-recoverable' as NonNullable<OperationHistorySummary['redo']>['actionId'],
    operation: 'project.add',
    label: 'Created "Research prototype"',
    expiresAt: '2026-09-24T17:00:00.000Z',
    blockedBy: null,
  },
  blockedBy: null,
};

const recoveryGateway = (summary: OperationHistorySummary): FakeWorkManagerGateway =>
  new FakeWorkManagerGateway({ projects: [], pages: [], historySummaries: [summary] });

const decorators = (gateway: FakeWorkManagerGateway) => [
  applicationConfig({ providers: [provideRouter([])] }),
  moduleMetadata({ providers: [{ provide: WORK_MANAGER_GATEWAY, useValue: gateway }] }),
];

const meta: Meta<ProjectWorkspaceShell> = {
  title: 'Projects/ProjectCreationRecovery',
  component: ProjectWorkspaceShell,
  args: { projectId: PROJECT },
};

export default meta;
type Story = StoryObj<ProjectWorkspaceShell>;

/** A missing project whose creator can restore the original project and canonical page. */
export const RedoAvailable: Story = {
  decorators: decorators(recoveryGateway(HISTORY)),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-project-creation-recovery]')).toBeVisible();
    await expect(canvasElement.querySelector('[data-history-redo]')).toHaveAttribute(
      'aria-label', 'Redo: Created "Research prototype"',
    );
  },
};

/** The controls show the in-flight transition while the host is still deciding. */
export const RedoPending: Story = {
  decorators: decorators((() => {
    const gateway = recoveryGateway(HISTORY);
    gateway.history.transition = () => new Promise<OperationHistoryTransitionResult>(() => undefined);
    return gateway;
  })()),
  play: async ({ canvasElement }) => {
    const redo = canvasElement.querySelector<HTMLButtonElement>('[data-history-redo]')!;
    await expect(redo).toHaveAttribute('aria-label', 'Redo: Created "Research prototype"');
    redo.click();
    await expect(redo).toHaveAttribute('aria-label', 'Redoing…');
    await expect(redo).toHaveAttribute('aria-disabled', 'true');
  },
};

/** Restoring a child is unavailable while its captured parent remains archived. */
export const ParentArchived: Story = {
  decorators: decorators(recoveryGateway({
    ...HISTORY,
    redo: {
      ...HISTORY.redo!,
      blockedBy: { projectId: 'project-legacy' as ProjectId, title: 'Legacy attic' },
    },
    blockedBy: { projectId: 'project-legacy' as ProjectId, title: 'Legacy attic' },
  })),
};
