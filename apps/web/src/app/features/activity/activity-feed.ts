import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ActivityFeedEntry } from '@cwm/contracts';

/** How §57's three actors are told apart, in one place. */
interface ActorPresentation {
  icon: string;
  /** Read out instead of the icon, which is decorative. */
  label: string;
}

const ACTORS: Record<ActivityFeedEntry['actor'], ActorPresentation> = {
  user: { icon: '🧑', label: 'You' },
  agent: { icon: '🤖', label: 'Agent' },
  system: { icon: '⚙️', label: 'System' },
};

/**
 * §57's feed, rendered. The one place the prototype decides what a user action, an agent
 * action and a system action look like — the dashboard widget and the project section both
 * render this, so the three are told apart the same way wherever they appear.
 *
 * **Presentational only: it injects nothing.** A dashboard widget is handed data and never
 * a gateway (`widgets/widget-contract.ts`), because the dashboard is one derivation over
 * one clock reading; a feed component that fetched for itself could not be used there at
 * all, which would defeat the point of having one component.
 *
 * The line is **composed** from the entry's parts rather than printed from its stored
 * `summary` — see docs/decisions/2026-08-activity-feed-composes-from-parts.md. `summary`
 * freezes the entity's name at write time; `entityTitle` is read live.
 */
@Component({
  selector: 'app-activity-feed',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './activity-feed.html',
  styleUrl: './activity-feed.scss',
})
export class ActivityFeed {
  readonly entries = input.required<readonly ActivityFeedEntry[]>();
  /** What to say when there is nothing — the hosts word it differently. */
  readonly emptyMessage = input('Nothing has happened here yet.');

  readonly rows = computed(() =>
    this.entries().map((entry) => ({
      entry,
      actor: ACTORS[entry.actor],
      verb: verbOf(entry.action),
      // Falls back to the action's own subject when the entity has no title of its own —
      // a section, or a target a hand-edited data.json has since removed.
      target: entry.entityTitle ?? entry.entityType.replace('_', ' '),
    })),
  );
}

/**
 * `task.completed` reads as `Completed`. The verbs are not enumerated anywhere — §57 names
 * no action list and `ActivityActionSchema` is deliberately an open string — so this
 * de-snake-cases what it is given rather than pretending to a closed set it would have to
 * keep in step with every later slice.
 */
const verbOf = (action: string): string => {
  const verb = (action.split('.')[1] ?? action).replace(/_/g, ' ');
  return verb.charAt(0).toUpperCase() + verb.slice(1);
};
