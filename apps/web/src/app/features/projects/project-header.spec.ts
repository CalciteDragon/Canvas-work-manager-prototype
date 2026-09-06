import { TestBed } from '@angular/core/testing';
import { ProjectSchema, type Project } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { ProjectHeader } from './project-header';

const AT = '2026-08-27T16:00:00.000Z';

const root = (overrides: Record<string, unknown> = {}): Project =>
  ProjectSchema.parse({
    id: 'project-a',
    workspaceId: 'workspace-demo',
    kind: 'root',
    name: 'Website launch',
    icon: '🚀',
    status: 'on_hold',
    targetDate: '2026-09-30',
    projectLayoutMode: 'flow',
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  });

const workUnit = (overrides: Record<string, unknown> = {}): Project =>
  ProjectSchema.parse({
    id: 'project-kitchen',
    workspaceId: 'workspace-demo',
    kind: 'subproject',
    parentProjectId: 'project-a',
    name: 'Kitchen',
    status: 'active',
    projectLayoutMode: 'flow',
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  });

const render = async (
  options: { project?: Project; progress?: number | null; writeError?: string | null } = {},
) => {
  // No providers: the header injects nothing, which is the property that keeps §19's chain
  // from becoming Component → Gateway. Two fixtures in one test are therefore free.
  const fixture = TestBed.createComponent(ProjectHeader);
  fixture.componentRef.setInput('project', options.project ?? root());
  // `?? 50` would swallow the `null` this component draws a whole branch for.
  fixture.componentRef.setInput('progress', 'progress' in options ? options.progress : 50);
  fixture.componentRef.setInput('writeError', options.writeError ?? null);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
};

const query = (fixture: Awaited<ReturnType<typeof render>>, selector: string) =>
  fixture.nativeElement.querySelector(selector) as HTMLElement | null;

const openMore = async (fixture: Awaited<ReturnType<typeof render>>) => {
  query(fixture, '[data-project-more]')!.click();
  await fixture.whenStable();
  fixture.detectChanges();
};

describe('ProjectHeader (§26)', () => {
  it('renders §26’s header: icon, name, status, progress and target date', async () => {
    const fixture = await render();

    expect(query(fixture, '[data-project-icon]')?.textContent).toContain('🚀');
    expect(query(fixture, '[data-project-name]')?.textContent).toContain('Website launch');
    expect(query(fixture, '[data-project-status]')?.textContent).toContain('on hold');
    expect(query(fixture, '[data-project-progress]')?.textContent).toContain('50%');
    expect(query(fixture, '[data-project-target-date]')?.textContent).toContain('2026-09-30');
    expect(query(fixture, '[data-project-date-label]')?.textContent).toContain('Target date');
  });

  it('renders 0% for a project with nothing done, not "Not available"', async () => {
    // `0` is falsy, so an `@if (progress; as …)` binding reads a real zero as "no value" —
    // the one number a progress control most needs to be able to say.
    const fixture = await render({ progress: 0 });

    expect(query(fixture, '[data-project-progress]')?.textContent).toContain('0%');
    expect(query(fixture, '[data-project-progress-unavailable]')).toBeNull();
  });

  it('says progress is unavailable when there is nothing to measure', async () => {
    const fixture = await render({ progress: null });

    expect(query(fixture, '[data-project-progress-unavailable]')).not.toBeNull();
  });

  // §26 relabels the same stored date on a unit of work. One field, two labels — a deadline
  // does not become a second column because the thing holding it is smaller.
  it('calls the same date a due date on a unit of work, and shows its description', async () => {
    const fixture = await render({
      project: workUnit({ description: 'Appliances first', targetDate: '2026-10-15' }),
    });

    expect(query(fixture, '[data-project-date-label]')?.textContent).toContain('Due date');
    expect(query(fixture, '[data-project-target-date]')?.textContent).toContain('2026-10-15');
    expect(query(fixture, '[data-project-description]')?.textContent).toContain('Appliances first');
  });

  it('says "No due date" on an undated work unit, and "No target date" on a root', async () => {
    expect((await render({ project: workUnit() })).nativeElement.textContent).toContain('No due date');
    expect((await render({ project: root({ targetDate: undefined }) })).nativeElement.textContent)
      .toContain('No target date');
  });

  it('shows a work unit’s completion time once it is completed, and nothing while it is open', async () => {
    const open = await render({ project: workUnit() });
    expect(query(open, '[data-project-completed-at]')).toBeNull();

    const done = await render({
      project: workUnit({ status: 'completed', completedAt: '2026-09-01T10:00:00.000Z' }),
    });
    expect(query(done, '[data-project-completed-at]')?.textContent).toContain('2026-09-01');
  });

  it('opens the More menu and closes it on Escape', async () => {
    const fixture = await render();
    await openMore(fixture);
    expect(query(fixture, '[data-project-more-menu]')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(query(fixture, '[data-project-more-menu]')).toBeNull();
  });

  it('asks for a rename and a description without touching a gateway itself', async () => {
    const fixture = await render({ project: workUnit() });
    const renames: string[] = [];
    const descriptions: Array<string | null> = [];
    fixture.componentInstance.renameRequested.subscribe((name) => renames.push(name));
    fixture.componentInstance.descriptionRequested.subscribe((text) => descriptions.push(text));
    await openMore(fixture);

    const name = query(fixture, '[data-project-rename-input]') as HTMLInputElement;
    name.value = 'Kitchen refit';
    query(fixture, '[data-project-rename-submit]')!.click();
    await openMore(fixture);
    const description = query(fixture, '[data-project-description-input]') as HTMLInputElement;
    description.value = 'Appliances and finishes first';
    query(fixture, '[data-project-description-submit]')!.click();
    fixture.detectChanges();

    expect(renames).toEqual(['Kitchen refit']);
    expect(descriptions).toEqual(['Appliances and finishes first']);
  });

  // A description is optional and clearable, so an emptied field is a real intent — unlike
  // the name, which has no meaningful empty value.
  it('clears a description with an emptied field, and asks for nothing on a blank name', async () => {
    const fixture = await render({ project: workUnit({ description: 'Appliances first' }) });
    const descriptions: Array<string | null> = [];
    const renames: string[] = [];
    fixture.componentInstance.descriptionRequested.subscribe((text) => descriptions.push(text));
    fixture.componentInstance.renameRequested.subscribe((name) => renames.push(name));
    await openMore(fixture);

    const description = query(fixture, '[data-project-description-input]') as HTMLInputElement;
    description.value = '   ';
    query(fixture, '[data-project-description-submit]')!.click();
    const name = query(fixture, '[data-project-rename-input]') as HTMLInputElement;
    name.value = '  ';
    query(fixture, '[data-project-rename-submit]')!.click();
    fixture.detectChanges();

    expect(descriptions).toEqual([null]);
    expect(renames).toEqual([]);
  });

  it('keeps the header rendered while showing a failed write', async () => {
    const fixture = await render({ writeError: 'the prototype host is not running' });

    expect(query(fixture, '[data-project-write-error]')?.textContent).toContain('not running');
    expect(query(fixture, '[data-project-name]')?.textContent).toContain('Website launch');
  });

  it('asks for confirmation before archiving, and writes nothing when it is cancelled', async () => {
    const fixture = await render();
    let archives = 0;
    fixture.componentInstance.archiveRequested.subscribe(() => (archives += 1));
    await openMore(fixture);

    query(fixture, '[data-project-archive]')!.click();
    fixture.detectChanges();
    expect(query(fixture, '[data-project-archive-confirm]')).not.toBeNull();
    expect(archives).toBe(0);

    query(fixture, '[data-project-archive-cancel]')!.click();
    fixture.detectChanges();
    expect(archives).toBe(0);

    query(fixture, '[data-project-archive]')!.click();
    fixture.detectChanges();
    query(fixture, '[data-project-archive-confirm-yes]')!.click();
    expect(archives).toBe(1);
  });

  it('clears a target date through the menu’s explicit Clear', async () => {
    const fixture = await render();
    const dates: Array<string | null> = [];
    fixture.componentInstance.targetDateRequested.subscribe((date) => dates.push(date));
    await openMore(fixture);

    query(fixture, '[data-project-target-date-clear]')!.click();

    expect(dates).toEqual([null]);
  });
});
