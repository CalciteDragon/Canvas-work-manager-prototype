import { TestBed } from '@angular/core/testing';
import { ActivityFeedEntrySchema, type ActivityFeedEntry } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { ActivityFeed } from './activity-feed';

const entry = (overrides: Record<string, unknown> = {}): ActivityFeedEntry =>
  ActivityFeedEntrySchema.parse({
    id: 'activity-1',
    workspaceId: 'workspace-demo',
    actor: 'user',
    actorUserId: 'user-demo',
    action: 'task.completed',
    entityType: 'task',
    entityId: 'task-1',
    projectId: 'project-work-manager',
    summary: 'Completed "Configure deployment"',
    createdAt: '2026-08-24T15:32:00.000Z',
    actorName: 'Demo User',
    entityTitle: 'Configure deployment',
    projectName: 'Work Manager',
    ...overrides,
  });

const render = async (entries: ActivityFeedEntry[]) => {
  const fixture = TestBed.createComponent(ActivityFeed);
  fixture.componentRef.setInput('entries', entries);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
};

const texts = (fixture: Awaited<ReturnType<typeof render>>, selector: string): string[] =>
  [...fixture.nativeElement.querySelectorAll(selector)].map((node) => (node as HTMLElement).textContent?.trim() ?? '');

describe('ActivityFeed (§57)', () => {
  /** §57: "The UI should clearly distinguish user action / agent action / system action." */
  it('marks the three actors distinctly, and not by colour alone', async () => {
    const fixture = await render([
      entry({ id: 'activity-1', actor: 'user', actorUserId: 'user-demo', actorName: 'Demo User' }),
      entry({
        id: 'activity-2',
        actor: 'agent',
        actorUserId: undefined,
        actorAgentConnectionId: 'agent-claude',
        actorName: 'Claude',
      }),
      entry({ id: 'activity-3', actor: 'system', actorUserId: undefined, actorName: 'System' }),
    ]);

    expect(
      [...fixture.nativeElement.querySelectorAll('[data-activity-entry]')].map((node) =>
        (node as HTMLElement).getAttribute('data-actor'),
      ),
    ).toEqual(['user', 'agent', 'system']);
    // A badge that carried only a colour would be invisible to anyone who cannot see the
    // difference, so each one also says the actor kind in words.
    expect(texts(fixture, '.activity__badge-label')).toEqual(['You', 'Agent', 'System']);
  });

  it('names the actor, and composes the line from the live title rather than the stored summary', async () => {
    const fixture = await render([entry({ entityTitle: 'Configure the deploy pipeline' })]);

    expect(texts(fixture, '[data-activity-actor]')).toEqual(['Demo User']);
    expect(texts(fixture, '[data-activity-line]')).toEqual(['Completed “Configure the deploy pipeline”']);
  });

  it('renders an entry with no project — an agent_connection event has none', async () => {
    const fixture = await render([
      entry({
        action: 'agent_connection.revoked',
        entityType: 'agent_connection',
        entityId: 'agent-old',
        projectId: undefined,
        projectName: undefined,
        entityTitle: 'Retired assistant',
      }),
    ]);

    expect(fixture.nativeElement.querySelector('[data-activity-project]')).toBeNull();
    expect(texts(fixture, '[data-activity-line]')).toEqual(['Revoked “Retired assistant”']);
  });

  it('falls back to the entity kind when there is no title, rather than rendering a gap', async () => {
    const fixture = await render([
      entry({ action: 'section.added', entityType: 'section', entityId: 'section-1', entityTitle: undefined }),
    ]);

    expect(texts(fixture, '[data-activity-line]')).toEqual(['Added “section”']);
  });

  it('says so when there is nothing, in the words its host chose', async () => {
    const fixture = TestBed.createComponent(ActivityFeed);
    fixture.componentRef.setInput('entries', []);
    fixture.componentRef.setInput('emptyMessage', 'No agent has done anything yet.');
    fixture.detectChanges();

    expect((fixture.nativeElement.querySelector('[data-activity-empty]') as HTMLElement).textContent?.trim()).toBe(
      'No agent has done anything yet.',
    );
  });
});

describe('ActivityFeed timestamps (§57)', () => {
  /**
   * §57 draws `11:32 AM`. Slice 11 learned that a bare time misleads: a feed is mostly
   * history, and five-day-old rows would all read as tonight.
   */
  it('prints a date as well as a time, in UTC, keeping the exact instant in datetime', async () => {
    const fixture = await render([entry({ createdAt: '2026-08-24T15:32:00.000Z' })]);
    const time = fixture.nativeElement.querySelector('[data-activity-time]') as HTMLElement;

    expect(time.textContent?.trim()).toBe('24 Aug, 15:32');
    expect(time.getAttribute('datetime')).toBe('2026-08-24T15:32:00.000Z');
  });
});
