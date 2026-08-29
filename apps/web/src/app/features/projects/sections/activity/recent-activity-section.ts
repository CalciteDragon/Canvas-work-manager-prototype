import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import type { ProjectSection, SectionConfig } from '@cwm/contracts';
import { ActivityFeed } from '../../../activity/activity-feed';
import { ActivityStore } from '../../../activity/activity-store';

/**
 * §30's **Recent Activity** section: what happened in this project, and who did it (§57).
 *
 * It reloads on `projectDataRevision` as well as on the project id. A feed of "what just
 * happened" that ignored it would go stale the instant someone completed a task in the
 * Task List section beside it — the most visible staleness the canvas could have.
 */
@Component({ selector: 'app-recent-activity-section', changeDetection: ChangeDetectionStrategy.OnPush, imports: [ActivityFeed], providers: [ActivityStore], templateUrl: './recent-activity-section.html', styleUrl: './recent-activity-section.scss' })
export class RecentActivitySection {
  readonly section = input.required<ProjectSection>(); readonly onConfigChange = input.required<(config: SectionConfig) => void>(); readonly onProjectDataChange = input.required<() => void>(); readonly projectDataRevision = input.required<number>(); readonly store = inject(ActivityStore);
  constructor() { effect(() => { this.projectDataRevision(); void this.store.load(this.section().projectId); }); }
}
