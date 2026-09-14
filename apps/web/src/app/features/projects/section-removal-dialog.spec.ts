import { TestBed } from '@angular/core/testing';
import { ProjectSectionSchema, type OwnedDataKind, type ProjectSection, type SectionId } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import type { SectionRemovalPrompt } from './project-page-store';
import { SectionRemovalDialog } from './section-removal-dialog';

const AT = '2026-08-27T16:00:00.000Z';

const section = (
  id: string,
  position: number,
  overrides: Record<string, unknown> = {},
): ProjectSection =>
  ProjectSectionSchema.parse({
    id,
    projectId: 'project-a',
    pageId: 'page-project-a',
    type: 'task-list',
    position,
    columnSpan: 12,
    collapsed: false,
    config: {},
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  });

const render = (overrides: Partial<SectionRemovalPrompt> = {}, pending = false) => {
  const prompt: SectionRemovalPrompt = {
    sectionId: 'section-tasks' as SectionId,
    sectionName: 'Backlog',
    rowCount: 2,
    ownedKind: 'tasks' as OwnedDataKind,
    targets: [],
    ...overrides,
  };
  const fixture = TestBed.createComponent(SectionRemovalDialog);
  fixture.componentRef.setInput('prompt', prompt);
  fixture.componentRef.setInput('pending', pending);
  fixture.detectChanges();
  return { fixture, prompt, text: fixture.nativeElement.textContent as string };
};

const options = (fixture: ReturnType<typeof render>['fixture']) =>
  [...fixture.nativeElement.querySelectorAll('[data-section-removal-target] option')].map(
    (option) => (option as HTMLOptionElement).textContent?.trim(),
  );

describe('SectionRemovalDialog (§31)', () => {
  it('asks a person’s question, naming the section and counting its rows', () => {
    const { text } = render();

    expect(text).toContain('Remove “Backlog”?');
    expect(text).toContain('It still holds 2 tasks. What should happen to them?');
    // The policy vocabulary belongs to the API, not to the person standing in front of this.
    expect(text).not.toContain('cascade');
    expect(text).not.toContain('reassign');
  });

  it('says 1 task for one and 2 tasks for two', () => {
    expect(render({ rowCount: 1 }).text).toContain('1 task.');
    expect(render({ rowCount: 2 }).text).toContain('2 tasks.');
  });

  it('says reflection and reflections for the second owned kind', () => {
    // Pins the naive `${count} ${ownedKind}` — `OwnedDataKind`'s values are already plural,
    // so the UI singularises rather than adding an `s`.
    expect(render({ ownedKind: 'reflections', rowCount: 1 }).text).toContain('1 reflection.');
    expect(render({ ownedKind: 'reflections', rowCount: 2 }).text).toContain('2 reflections.');
    expect(render({ ownedKind: 'reflections', rowCount: 2, targets: [section('section-b', 1)] }).text)
      .toContain('Archive the section and its reflections');
  });

  it('says what removal now does, for both owned kinds and both policies', () => {
    // Removal archives the section as well as settling its rows, so both labels have to say
    // so — and both stay derived from `ownedKind` rather than hard-coded to tasks.
    const tasks = render({ targets: [section('section-b', 1)] }).text;
    expect(tasks).toContain('Move the tasks out, then remove the section');
    expect(tasks).toContain('Archive the section and its tasks');

    const reflections = render({ ownedKind: 'reflections', targets: [section('section-b', 1)] }).text;
    expect(reflections).toContain('Move the reflections out, then remove the section');
    expect(reflections).toContain('Archive the section and its reflections');
  });

  it('names every offered target and leaks no section id', () => {
    const { fixture, text } = render({
      targets: [section('section-shipped', 1, { title: 'Shipped' }), section('section-later', 2)],
    });

    expect(options(fixture)).toEqual(['Shipped', 'Task List']);
    // The friction note's first half. Asserting against the fixture's own ids is robust
    // where a `/section-[0-9a-f]/` pattern would pass vacuously against these names.
    for (const id of ['section-tasks', 'section-shipped', 'section-later']) {
      expect(text).not.toContain(id);
    }
  });

  it('distinguishes two untitled targets by their absolute canvas position', () => {
    // Untitled on purpose: a titled fixture tests the case that was never broken. `position`
    // is absolute across all section types, so this is `position + 1`, not an index into
    // the filtered target list.
    const { fixture } = render({ targets: [section('section-b', 3), section('section-c', 5)] });

    expect(options(fixture)).toEqual([
      'Task List (position 4 on the canvas)',
      'Task List (position 6 on the canvas)',
    ]);
  });

  it('disambiguates an explicit title that collides with another target’s default', () => {
    // The rule is duplicate *resolved* names, not merely two absent `title` fields.
    const { fixture } = render({
      targets: [section('section-b', 1, { title: 'Task List' }), section('section-c', 6)],
    });

    expect(options(fixture)).toEqual([
      'Task List (position 2 on the canvas)',
      'Task List (position 7 on the canvas)',
    ]);
  });

  it('offers no reassign when nothing else could take the rows', () => {
    const { fixture } = render();

    expect(fixture.nativeElement.querySelector('[data-section-removal-target]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-section-removal-reassign]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-section-removal-cascade]')).not.toBeNull();
  });

  it('answers with the chosen target, defaulting to the first offered one', () => {
    const { fixture } = render({ targets: [section('section-b', 1), section('section-c', 2)] });
    const seen: unknown[] = [];
    fixture.componentInstance.reassignChosen.subscribe((id) => seen.push(id));
    fixture.componentInstance.cascadeChosen.subscribe(() => seen.push('cascade'));

    fixture.nativeElement.querySelector('[data-section-removal-reassign]').click();
    const select = fixture.nativeElement.querySelector('[data-section-removal-target]') as HTMLSelectElement;
    select.value = 'section-c';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-section-removal-reassign]').click();
    fixture.nativeElement.querySelector('[data-section-removal-cascade]').click();

    expect(seen).toEqual(['section-b', 'section-c', 'cascade']);
  });

  it('keeps the dialog actions focusable while a policy removal is pending and ignores duplicates', () => {
    const { fixture } = render({ targets: [section('section-b', 1)] }, true);
    const chosen = vi.fn();
    fixture.componentInstance.cascadeChosen.subscribe(chosen);
    const button = fixture.nativeElement.querySelector('[data-section-removal-cascade]') as HTMLButtonElement;

    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    button.click();

    expect(chosen).not.toHaveBeenCalled();
  });

  it('focuses the first choice and closes with Escape', async () => {
    const { fixture } = render();
    await fixture.whenStable();
    fixture.detectChanges();
    const cancelled = vi.fn();
    fixture.componentInstance.cancelled.subscribe(cancelled);
    const cancel = fixture.nativeElement.querySelector('[data-section-removal-cancel]') as HTMLButtonElement;

    expect(document.activeElement).toBe(cancel);
    fixture.nativeElement.querySelector('[data-section-removal-dialog]')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );

    expect(cancelled).toHaveBeenCalledOnce();
  });
});
