import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ProjectRestoreStatusSchema, type ProjectRestoreStatus } from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { RestoreStatusChoice } from './restore-status-choice';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RestoreStatusChoice],
  template: `
    <app-restore-status-choice data-choice subjectLabel="Legacy attic" [pending]="pending()" [disabled]="disabled()"
      (restore)="restored($event)" />
  `,
})
class Host {
  readonly pending = signal(false);
  readonly disabled = signal(false);
  readonly restored = vi.fn<(status: ProjectRestoreStatus) => void>();
}

const setup = () => {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const choice = () => element.querySelector<HTMLElement>('[data-choice]')!;
  const select = () => choice().querySelector<HTMLSelectElement>('select')!;
  const button = () => choice().querySelector<HTMLButtonElement>('button')!;
  return { fixture, host: fixture.componentInstance, choice, select, button };
};

describe('RestoreStatusChoice (Slice 79, §23, §31, L4-012)', () => {
  it('offers one option list in one casing, the restore statuses from contracts', () => {
    const { select } = setup();

    const options = [...select().options];
    expect(options.map((option) => option.value)).toEqual([...ProjectRestoreStatusSchema.options]);
    expect(options.map((option) => option.textContent?.trim())).toEqual(['Planning', 'Active', 'On hold', 'Completed']);
  });

  // Q2 (a): the status is shown before the press, so nothing is guessed silently.
  it('preselects Active, visibly, as “Restore as Active”', () => {
    const { select, choice } = setup();

    expect(select().value).toBe('active');
    expect(select().selectedOptions[0]?.textContent?.trim()).toBe('Active');
    const label = choice().querySelector('label')!;
    expect(label.textContent).toContain('Restore as');
    expect(label.contains(select()) || select().labels?.[0] === label).toBe(true);
  });

  it('emits the shown status on Restore, and the chosen one after a change', () => {
    const { select, button, host, fixture } = setup();

    button().click();
    expect(host.restored).toHaveBeenLastCalledWith('active');

    select().value = 'on_hold';
    select().dispatchEvent(new Event('change'));
    fixture.detectChanges();
    button().click();
    expect(host.restored).toHaveBeenLastCalledWith('on_hold');
    expect(host.restored).toHaveBeenCalledTimes(2);
  });

  // T09's `button(/^Restore /)` and its exact-label check still hold.
  it('names Restore after its subject', () => {
    const { button } = setup();

    expect(button().textContent?.trim()).toBe('Restore');
    expect(button().getAttribute('aria-label')).toBe('Restore Legacy attic');
  });

  it('is aria-disabled while pending, keeps focus and emits nothing', () => {
    const { select, button, host, fixture } = setup();

    host.pending.set(true);
    fixture.detectChanges();
    expect(button().getAttribute('aria-disabled')).toBe('true');
    expect(button().disabled).toBe(false);
    expect(select().getAttribute('aria-disabled')).toBe('true');
    expect(select().disabled).toBe(false);
    // Slice 79 step 3: the press says it is running, as Archive's other rows and Settings did; the name holds.
    expect(button().textContent?.trim()).toBe('Restoring…');
    expect(button().getAttribute('aria-label')).toBe('Restore Legacy attic');
    button().click();
    expect(host.restored).not.toHaveBeenCalled();

    // A change while pending is refused: the shown status stays the one being restored.
    select().value = 'completed';
    select().dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(select().value).toBe('active');

    host.pending.set(false);
    fixture.detectChanges();
    expect(button().hasAttribute('aria-disabled')).toBe(false);
    expect(button().textContent?.trim()).toBe('Restore');
    button().click();
    expect(host.restored).toHaveBeenLastCalledWith('active');
  });

  it('is natively disabled when its caller cannot restore', () => {
    const { select, button, host, fixture } = setup();

    host.disabled.set(true);
    fixture.detectChanges();
    expect(button().disabled).toBe(true);
    expect(select().disabled).toBe(true);
    host.pending.set(true);
    fixture.detectChanges();
    expect(button().hasAttribute('aria-disabled')).toBe(false);
  });

  it('refuses a value that is not a restore status and keeps the shown one', () => {
    const { select, button, host, fixture } = setup();

    select().append(new Option('Archived', 'archived'));
    select().value = 'archived';
    select().dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(select().value).toBe('active');
    button().click();
    expect(host.restored).toHaveBeenLastCalledWith('active');
  });
});
