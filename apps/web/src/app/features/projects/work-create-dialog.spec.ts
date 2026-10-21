import { TestBed } from '@angular/core/testing';
import { ToastSlot } from '../../shared/feedback/toast-slot';
import type { ProjectId } from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { WorkCreateDialog, type WorkCreateParent } from './work-create-dialog';

const ROOT = 'project-root' as ProjectId;
const KITCHEN = 'project-kitchen' as ProjectId;
const PARENTS: WorkCreateParent[] = [
  { id: ROOT, name: 'Renovation', depth: 0, completed: false },
  { id: KITCHEN, name: 'Kitchen', depth: 1, completed: false },
  { id: 'project-garden' as ProjectId, name: 'Garden', depth: 1, completed: true },
];

const render = async (create: (parentId: ProjectId, name: string) => Promise<string | null> = async () => null) => {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(WorkCreateDialog);
  fixture.componentRef.setInput('parents', PARENTS);
  fixture.componentRef.setInput('create', create);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
};
const query = <T extends HTMLElement = HTMLElement>(fixture: Awaited<ReturnType<typeof render>>, selector: string) =>
  fixture.nativeElement.querySelector(selector) as T;
const nameWork = (fixture: Awaited<ReturnType<typeof render>>, name = 'Paint samples') => {
  const control = query<HTMLInputElement>(fixture, '[data-create-work-name]');
  control.value = name;
  control.dispatchEvent(new Event('input'));
};
const chooseKitchen = (fixture: Awaited<ReturnType<typeof render>>) => {
  const select = query<HTMLSelectElement>(fixture, '[data-create-work-parent]');
  select.value = KITCHEN;
  select.dispatchEvent(new Event('change'));
  fixture.detectChanges();
};

describe('WorkCreateDialog (§23, §26)', () => {
  it('suppresses the toast until the custom modal is destroyed', async () => {
    const fixture = await render();
    const slot = TestBed.inject(ToastSlot);
    expect(slot.suppressed()).toBe(true);
    expect(query(fixture, '[data-modal-lift]')).not.toBeNull();
    fixture.destroy();
    expect(slot.suppressed()).toBe(false);
  });
  it('focuses required name; defaults to root and lists indented parents with completed marked', async () => {
    const fixture = await render();
    const name = query<HTMLInputElement>(fixture, '[data-create-work-name]');
    const select = query<HTMLSelectElement>(fixture, '[data-create-work-parent]');
    expect(name.required).toBe(true);
    expect(document.activeElement).toBe(name);
    expect(select.value).toBe(ROOT);
    expect([...select.options].map((option) => option.textContent)).toEqual([
      'Renovation', '\u00a0\u00a0Kitchen', '\u00a0\u00a0Garden (completed)',
    ]);
    chooseKitchen(fixture);
    expect(query(fixture, '[data-create-work-inside]').textContent).toContain('Inside Kitchen');
  });

  it('refuses an empty name with Enter a name. beside the field, focus kept, nothing sent (Slice 75, L4-024)', async () => {
    const create = vi.fn(async () => null);
    const fixture = await render(create);
    expect(query(fixture, 'form')?.hasAttribute('novalidate')).toBe(true);
    nameWork(fixture, '   ');
    query(fixture, '[data-create-work-submit]').click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(create).not.toHaveBeenCalled();
    const message = query(fixture, '[data-create-work-name-error]');
    expect(message.textContent?.trim()).toBe('Enter a name.');
    expect(message.getAttribute('role')).toBe('alert');
    const name = query<HTMLInputElement>(fixture, '[data-create-work-name]');
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(name.getAttribute('aria-describedby')).toBe(message.id);
    expect(document.activeElement).toBe(name);

    nameWork(fixture, 'P');
    fixture.detectChanges();
    expect(query(fixture, '[data-create-work-name-error]')).toBeNull();
    expect(name.getAttribute('aria-invalid')).toBeNull();
  });

  it.each(['Cancel', 'Escape', 'backdrop'])('%s closes without calling create', async (action) => {
    const create = vi.fn(async () => null);
    const fixture = await render(create);
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    if (action === 'Cancel') query(fixture, '[data-create-work-cancel]').click();
    else if (action === 'Escape') query(fixture, '[data-work-create-dialog]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    else query(fixture, '[data-work-create-backdrop]').click();
    expect(create).not.toHaveBeenCalled();
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('calls create once while pending; busy guards dismissal; failure retains name and parent with alert; success closes', async () => {
    let finish!: (message: string | null) => void;
    const create = vi.fn(() => new Promise<string | null>((resolve) => (finish = resolve)));
    const fixture = await render(create);
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    nameWork(fixture);
    chooseKitchen(fixture);
    const first = fixture.componentInstance.submit();
    await fixture.componentInstance.submit();
    fixture.detectChanges();
    expect(create).toHaveBeenCalledExactlyOnceWith(KITCHEN, 'Paint samples');
    expect(query<HTMLButtonElement>(fixture, '[data-create-work-submit]').disabled).toBe(true);
    query(fixture, '[data-work-create-backdrop]').click();
    query(fixture, '[data-work-create-dialog]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.componentInstance.close();
    expect(closed).not.toHaveBeenCalled();
    finish('The parent is archived.');
    await first;
    fixture.detectChanges();
    expect(query<HTMLInputElement>(fixture, '[data-create-work-name]').value).toBe('Paint samples');
    expect(query<HTMLSelectElement>(fixture, '[data-create-work-parent]').value).toBe(KITCHEN);
    expect(query(fixture, '[role="alert"]').textContent).toContain('The parent is archived.');
    const second = fixture.componentInstance.submit();
    finish(null);
    await second;
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('Tab cycles inside and recovers focus from outside', async () => {
    const fixture = await render();
    const name = query(fixture, '[data-create-work-name]');
    const submit = query(fixture, '[data-create-work-submit]');
    const dialog = query(fixture, '[data-work-create-dialog]');
    submit.focus();
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(name);
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(submit);
    dialog.focus();
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(name);
  });

  it('keeps focus on the modal while every control is disabled during a write', async () => {
    let finish!: (message: string | null) => void;
    const fixture = await render(() => new Promise((resolve) => (finish = resolve)));
    nameWork(fixture);
    const submit = query(fixture, '[data-create-work-submit]');
    submit.focus();
    const request = fixture.componentInstance.submit();
    fixture.detectChanges();
    const dialog = query(fixture, '[data-work-create-dialog]');
    expect(document.activeElement).toBe(dialog);
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    dialog.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(dialog);
    finish('Try again');
    await request;
  });

  it('resets a removed chosen parent to root with its saved name; next change clears note', async () => {
    const fixture = await render();
    chooseKitchen(fixture);
    fixture.componentRef.setInput('parents', [PARENTS[0]!, PARENTS[2]!]);
    fixture.detectChanges();
    expect(query<HTMLSelectElement>(fixture, '[data-create-work-parent]').value).toBe(ROOT);
    expect(query(fixture, '[data-create-work-parent-note]').textContent).toContain('Kitchen is no longer available; choose another parent.');
    const select = query<HTMLSelectElement>(fixture, '[data-create-work-parent]');
    select.value = PARENTS[2]!.id;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(query(fixture, '[data-create-work-parent-note]')).toBeNull();
  });

  it('defers stale parent reset while pending until refusal; successful close does not reset', async () => {
    let finish!: (message: string | null) => void;
    const fixture = await render(() => new Promise((resolve) => (finish = resolve)));
    chooseKitchen(fixture);
    nameWork(fixture);
    const request = fixture.componentInstance.submit();
    fixture.componentRef.setInput('parents', [PARENTS[0]!]);
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedParentId()).toBe(KITCHEN);
    expect(query(fixture, '[data-create-work-parent-note]')).toBeNull();
    finish('Parent unavailable');
    await request;
    fixture.detectChanges();
    expect(query<HTMLSelectElement>(fixture, '[data-create-work-parent]').value).toBe(ROOT);
    expect(query(fixture, '[data-create-work-parent-note]').textContent).toContain('Kitchen is no longer available');

    const success = await render(() => new Promise((resolve) => (finish = resolve)));
    chooseKitchen(success);
    nameWork(success);
    const successfulRequest = success.componentInstance.submit();
    success.componentRef.setInput('parents', [PARENTS[0]!]);
    success.detectChanges();
    finish(null);
    await successfulRequest;
    success.detectChanges();
    expect(success.componentInstance.selectedParentId()).toBe(KITCHEN);
  });
});
