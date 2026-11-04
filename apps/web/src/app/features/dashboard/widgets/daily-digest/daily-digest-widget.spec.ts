import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DashboardResultSchema, type DashboardResult } from '@cwm/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { dashboardWithoutDigest, emptyDashboard } from '../../../../core/gateway/testing/fake-gateway';
import { DailyDigestWidget, dailyDigestFailure } from './daily-digest-widget';

// Slice 78 (L4-022): a `null` digest means the provider failed. No reason crosses the wire,
// so there is nothing for Details.
describe('dailyDigestFailure', () => {
  it('says the digest could not be written when the provider failed', () => {
    expect(dailyDigestFailure(dashboardWithoutDigest())).toEqual({ sentence: 'Couldn’t write today’s digest.', reason: null });
  });

  it('answers null when there is a digest', () => {
    expect(dailyDigestFailure(emptyDashboard())).toBeNull();
  });
});

const overdueTask = (n: number, pageKind = 'home') => ({
  id: `task-${n}`,
  projectId: 'project-1',
  projectName: 'Website launch',
  origin: { projectId: 'project-1', pageId: 'page-1', pageKind, sectionId: `section-${n}`, sectionName: 'Tasks', breadcrumb: [{ projectId: 'project-1', name: 'Website launch' }] },
  projectIcon: '🚀',
  title: `Late task ${n}`,
  status: 'todo',
  priority: 'medium',
  overdue: true,
  dueAt: '2026-08-21T17:00:00.000Z',
});

const withOverdue = (count: number, base: DashboardResult = emptyDashboard()): DashboardResult =>
  DashboardResultSchema.parse({ ...base, today: { ...base.today, overdue: Array.from({ length: count }, (_, i) => overdueTask(i + 1, i === 0 ? 'work' : 'home')) } });

const render = async (dashboard: DashboardResult) => {
  TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', children: [] }])] });
  const fixture = TestBed.createComponent(DailyDigestWidget);
  fixture.componentRef.setInput('widget', { id: 'w-digest', type: 'daily_digest', position: 0, size: 'medium', config: {}, hidden: false });
  fixture.componentRef.setInput('dashboard', dashboard);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
};

afterEach(() => TestBed.resetTestingModule());

// Slice 79 (W4-028, Q1 (a)): Sam sees only the digest, so its overdue line has to lead
// somewhere — the overdue tasks themselves, listed under the prose.
describe('DailyDigestWidget — the overdue line leads to the tasks (§24)', () => {
  it('lists each overdue task under the prose, linking to its owner section', async () => {
    const element = await render(withOverdue(2));
    const rows = [...element.querySelectorAll('[data-digest-overdue]')];

    expect(rows).toHaveLength(2);
    expect(element.querySelector('.widget-prose')!.compareDocumentPosition(rows[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const links = rows.map((row) => row.querySelector('a')!);
    expect(links.map((link) => link.textContent?.trim())).toEqual(['Late task 1', 'Late task 2']);
    expect(links[0]!.getAttribute('href')).toBe('/projects/project-1#section-section-1');
    expect(links[1]!.getAttribute('href')).toBe('/projects/project-1/pages/home#section-section-2');
    expect(rows[0]!.closest('ul')?.getAttribute('aria-label')).toBe('Overdue tasks');
    expect(rows[0]!.closest('.digest-overdue')).not.toBeNull();
    expect(rows[0]!.classList).toContain('object-row');
    expect(rows[0]!.classList).toContain('object-row--overdue');
    expect(rows[0]!.textContent).toContain('2026-08-21');
    expect(rows[0]!.textContent).toContain('Website launch');
    expect(element.querySelector('[data-widget-task]')).toBeNull();
    expect(element.querySelector('[data-digest-overdue-more]')).toBeNull();
  });

  it('lists at most five, then says how many more are overdue, with no link', async () => {
    const element = await render(withOverdue(8));

    expect(element.querySelectorAll('[data-digest-overdue]')).toHaveLength(5);
    const more = element.querySelector('[data-digest-overdue-more]')!;
    expect(more.textContent?.trim()).toBe('and 3 more overdue');
    expect(more.querySelector('a')).toBeNull();
    expect(more.classList).toContain('widget-empty');
    expect(more.closest('.digest-overdue')).not.toBeNull();
  });

  it('lists exactly five with no remainder line', async () => {
    const element = await render(withOverdue(5));

    expect(element.querySelectorAll('[data-digest-overdue]')).toHaveLength(5);
    expect(element.querySelector('[data-digest-overdue-more]')).toBeNull();
  });

  it('lists nothing when nothing is overdue', async () => {
    const element = await render(emptyDashboard());

    expect(element.querySelector('[data-digest-overdue]')).toBeNull();
    expect(element.querySelector('[data-digest-overdue-more]')).toBeNull();
    expect(element.querySelector('ul')).toBeNull();
  });

  // The frame's swap to the failure is `dailyDigestFailure` and `dashboard-page.spec.ts`; this
  // proves the widget itself lists nothing if it is ever mounted over a `null` digest.
  it('lists nothing over a null digest', async () => {
    const element = await render(withOverdue(2, dashboardWithoutDigest()));

    expect(element.querySelector('[data-digest-overdue]')).toBeNull();
  });
});
