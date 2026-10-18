import { DeferBlockBehavior, DeferBlockState, TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WORK_MANAGER_GATEWAY } from '../../core/gateway/work-manager-gateway';
import { FakeWorkManagerGateway } from '../../core/gateway/testing/fake-gateway';
import { PROTOTYPE_CONTROL } from '../control/prototype-control';
import { FakePrototypeControl } from '../control/testing/fake-prototype-control';
import { DevPanel } from './dev-panel';
import { ToastSlot } from '../../shared/feedback/toast-slot';

const render = async (deferBlockBehavior = DeferBlockBehavior.Playthrough) => {
  TestBed.configureTestingModule({
    deferBlockBehavior,
    imports: [DevPanel],
    providers: [
      provideRouter([]),
      { provide: PROTOTYPE_CONTROL, useValue: new FakePrototypeControl() },
      { provide: WORK_MANAGER_GATEWAY, useValue: new FakeWorkManagerGateway() },
    ],
  });
  const fixture: ComponentFixture<DevPanel> = TestBed.createComponent(DevPanel);
  await fixture.whenStable();
  return fixture;
};

const chord = (overrides: Partial<KeyboardEventInit> = {}) =>
  new KeyboardEvent('keydown', { code: 'KeyD', shiftKey: true, ctrlKey: true, ...overrides });

const panel = (fixture: ComponentFixture<DevPanel>) =>
  (fixture.nativeElement as HTMLElement).querySelector('[data-dev-panel]');

afterEach(() => {
  sessionStorage.clear();
  TestBed.resetTestingModule();
});

describe('DevPanel (§46)', () => {
  it('suppresses feedback while open and releases on close or destroy', async () => {
    const fixture = await render();
    const slot = TestBed.inject(ToastSlot);
    document.dispatchEvent(chord());
    await fixture.whenStable();
    expect(slot.suppressed()).toBe(true);
    document.dispatchEvent(chord());
    await fixture.whenStable();
    expect(slot.suppressed()).toBe(false);
    document.dispatchEvent(chord());
    await fixture.whenStable();
    fixture.destroy();
    expect(slot.suppressed()).toBe(false);
  });

  it('is closed until the chord is pressed', async () => {
    const fixture = await render();

    expect(panel(fixture)).toBeNull();
  });

  it('opens on Ctrl+Shift+D and closes on the same chord', async () => {
    const fixture = await render();

    document.dispatchEvent(chord());
    await fixture.whenStable();
    expect(panel(fixture)).not.toBeNull();

    document.dispatchEvent(chord());
    await fixture.whenStable();
    expect(panel(fixture)).toBeNull();
  });

  // macOS presses Cmd, not Ctrl. §46 writes the shortcut as "Ctrl/Cmd + Shift + D".
  it('opens on Meta+Shift+D too', async () => {
    const fixture = await render();

    document.dispatchEvent(chord({ ctrlKey: false, metaKey: true }));
    await fixture.whenStable();

    expect(panel(fixture)).not.toBeNull();
  });

  it('closes on Escape', async () => {
    const fixture = await render();
    document.dispatchEvent(chord());
    await fixture.whenStable();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();

    expect(panel(fixture)).toBeNull();
  });

  // `key` is 'D' with Shift held, and whatever the layout produces on a non-US keyboard.
  // The physical key is what the shortcut means.
  it('ignores the letter without both modifiers', async () => {
    const fixture = await render();

    document.dispatchEvent(chord({ shiftKey: false }));
    document.dispatchEvent(chord({ ctrlKey: false }));
    await fixture.whenStable();

    expect(panel(fixture)).toBeNull();
  });

  it('is a modal dialog that takes focus', async () => {
    const fixture = await render();

    document.dispatchEvent(chord());
    await fixture.whenStable();

    const dialog = panel(fixture);
    expect(dialog?.getAttribute('role')).toBe('dialog');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.contains(document.activeElement)).toBe(true);
  });

  it('offers a backdrop that dismisses it', async () => {
    const fixture = await render();
    document.dispatchEvent(chord());
    await fixture.whenStable();

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-dev-panel-backdrop]')?.click();
    await fixture.whenStable();

    expect(panel(fixture)).toBeNull();
  });
});

const renderDeferred = async () => {
  return render(DeferBlockBehavior.Manual);
};

it('opens and focuses the eager modal before deferred controls, preserving Close focus on completion', async () => {
  const fixture = await renderDeferred();
  document.dispatchEvent(chord());
  await fixture.whenStable();
  const host = fixture.nativeElement as HTMLElement;
  expect(panel(fixture)).toBe(document.activeElement);
  expect(host.querySelector('[data-dev-panel-loading]')?.getAttribute('role')).toBe('status');
  expect(host.querySelector('app-dev-panel-controls')).toBeNull();
  const close = host.querySelector<HTMLButtonElement>('[data-dev-panel-close]')!;
  close.focus();
  const [block] = await fixture.getDeferBlocks();
  expect(block).toBeDefined();
  await block!.render(DeferBlockState.Complete);
  await fixture.whenStable();
  expect(host.querySelector('app-dev-panel-controls')).not.toBeNull();
  expect(document.activeElement).toBe(close);
});

it('closing before completion and reopening creates a fresh controls block', async () => {
  const fixture = await renderDeferred();
  document.dispatchEvent(chord());
  await fixture.whenStable();
  const [first] = await fixture.getDeferBlocks();
  expect(first).toBeDefined();
  (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-dev-panel-close]')!.click();
  await fixture.whenStable();
  expect(panel(fixture)).toBeNull();
  document.dispatchEvent(chord());
  await fixture.whenStable();
  const [second] = await fixture.getDeferBlocks();
  expect(second).toBeDefined();
  expect(second).not.toBe(first);
  expect((fixture.nativeElement as HTMLElement).querySelector('app-dev-panel-controls')).toBeNull();
  await second!.render(DeferBlockState.Complete);
  await fixture.whenStable();
  expect((fixture.nativeElement as HTMLElement).querySelectorAll('app-dev-panel-controls')).toHaveLength(1);
});

it('load failure keeps Close and chord usable and exposes a deliberate reload', async () => {
  const fixture = await renderDeferred();
  const reload = vi.spyOn(fixture.componentInstance as unknown as { reloadPage(): void }, 'reloadPage').mockImplementation(() => {});
  document.dispatchEvent(chord());
  await fixture.whenStable();
  const [block] = await fixture.getDeferBlocks();
  await block!.render(DeferBlockState.Error);
  const host = fixture.nativeElement as HTMLElement;
  expect(host.querySelector('[data-dev-panel-load-error]')?.textContent).toContain('Controls could not load');
  expect(host.querySelector('app-dev-panel-controls')).toBeNull();
  host.querySelector<HTMLButtonElement>('[data-dev-panel-reload]')!.click();
  expect(reload).toHaveBeenCalledOnce();
  host.querySelector<HTMLButtonElement>('[data-dev-panel-close]')!.click();
  await fixture.whenStable();
  expect(panel(fixture)).toBeNull();
  document.dispatchEvent(chord());
  await fixture.whenStable();
  document.dispatchEvent(chord());
  await fixture.whenStable();
  expect(panel(fixture)).toBeNull();
});
