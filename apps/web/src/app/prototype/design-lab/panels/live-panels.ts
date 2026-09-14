import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Sidebar } from '../../../core/shell/sidebar/sidebar';
import { ActivityFeed } from '../../../features/activity/activity-feed';
import { widgetDefinitionFor } from '../../../features/dashboard/widgets/registry';
import { DashboardWidgetFrame } from '../../../features/dashboard/widgets/widget-frame/dashboard-widget-frame';
import { ProjectSectionFrame } from '../../../features/projects/sections/section-frame/project-section-frame';
import { TaskDetailDrawer } from '../../../features/tasks/task-detail-drawer';
import { TaskRow } from '../../../features/tasks/task-row';
import {
  labActivity,
  labDashboard,
  labProjectTree,
  labSection,
  labTask,
  labWidget,
  stubSectionDefinition,
} from '../design-lab-fixtures';
import { SectionCanvasFrame } from '../section-canvas-frame';

/**
 * §67's catalogue, live half: the **real** components, driven by fixtures, with their real
 * empty, loading and error states.
 *
 * It injects nothing — every component here is presentational, and the section frame is
 * handed the *stub* content definition rather than a registry entry, because a real
 * definition's content component injects a store which injects the gateway.
 *
 * `design-lab-page.spec.ts` renders this with **no `WORK_MANAGER_GATEWAY` provided at all**:
 * if anything in the tree reaches for one, DI throws and the test fails.
 */
@Component({
  selector: 'app-design-lab-live-panels',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ActivityFeed,
    DashboardWidgetFrame,
    ProjectSectionFrame,
    SectionCanvasFrame,
    Sidebar,
    TaskDetailDrawer,
    TaskRow,
  ],
  templateUrl: './live-panels.html',
  styleUrl: './panels.scss',
})
export class LivePanels {
  protected readonly normal = labTask();
  protected readonly overdue = labTask({
    id: 'task-overdue',
    title: 'Send the pre-launch email',
    dueAt: '2026-08-01T23:59:59.999Z',
  });
  protected readonly done = labTask({
    id: 'task-done',
    title: 'Book the venue',
    status: 'done',
    completedAt: '2026-08-20T09:00:00.000Z',
  });
  protected readonly high = labTask({ id: 'task-high', title: 'Fix the sign-up form', priority: 'high' });
  protected readonly now = Date.parse('2026-08-27T16:00:00.000Z');

  protected readonly sectionDefinition = stubSectionDefinition();
  protected readonly renameSection = async (): Promise<boolean> => true;
  protected readonly fullWidth = labSection({ id: 'section-full', title: 'Full width', columnSpan: 12 });
  protected readonly halfWidth = labSection({ id: 'section-half', title: 'Half width', columnSpan: 6 });
  protected readonly collapsed = labSection({ id: 'section-collapsed', title: 'Collapsed', collapsed: true });
  protected readonly sectionStates = [
    labSection({ id: 'section-empty', title: 'Empty state', config: { state: 'empty' } }),
    labSection({ id: 'section-loading', title: 'Loading state', config: { state: 'loading' } }),
    labSection({ id: 'section-error', title: 'Error state', config: { state: 'error' } }),
  ];

  protected readonly widget = labWidget();
  protected readonly widgetDefinition = widgetDefinitionFor('fun_fact');
  protected readonly dashboard = labDashboard();

  protected readonly projectTree = labProjectTree();
  protected readonly emptyTree = [];
  protected readonly sidebarError = 'the prototype host is not running';
  protected readonly activity = labActivity();
  protected readonly drawerTask = labTask({ dueAt: '2026-09-03T23:59:59.999Z', estimate: 3 });
}
