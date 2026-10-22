import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ProjectSection, SectionConfig, TimelineItem } from '@cwm/contracts';
import type { SectionContentInputs } from '../section-contract';
import { TimelineStore } from './timeline-store';

@Component({
  selector: 'app-timeline-section',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [TimelineStore],
  templateUrl: './timeline-section.html',
  styleUrl: './timeline-section.scss',
})
export class TimelineSection {
  readonly section = input.required<ProjectSection>();
  readonly onConfigChange = input.required<(config: SectionConfig) => void>();
  readonly onProjectDataChange = input.required<() => void>();
  readonly projectDataRevision = input.required<number>();
  readonly projectHierarchyRevision = input.required<number>();
  readonly readOnly = input(false);
  readonly sourceLink = input<SectionContentInputs['sourceLink']>(null);
  readonly store = inject(TimelineStore);

  constructor() {
    effect(() => {
      this.projectDataRevision();
      this.projectHierarchyRevision();
      void this.store.sync(this.section().projectId);
    });
  }

  label(kind: string): string {
    return kind === 'sub-project' ? 'Workstream' : kind[0]!.toUpperCase() + kind.slice(1);
  }

  /** Open the canonical owner; a picker Preview stays inside its disclosure. */
  linkOf(item: TimelineItem): { route: string[]; fragment?: string } | null {
    if ((item.kind !== 'task' && item.kind !== 'sub-project') || !item.link ||
      (this.readOnly() && this.sourceLink() === null)) return null;
    const { projectId, pageKind, sectionId } = item.link;
    return {
      route: pageKind === 'home' ? ['/projects', projectId, 'pages', 'home'] : ['/projects', projectId],
      ...(sectionId === undefined ? {} : { fragment: `section-${sectionId}` }),
    };
  }
}
