import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it } from 'vitest';
import { WORK_MANAGER_GATEWAY } from '../../core/gateway/work-manager-gateway';
import { FakeWorkManagerGateway } from '../../core/gateway/testing/fake-gateway';
import { PROTOTYPE_CONTROL } from '../control/prototype-control';
import { FakePrototypeControl } from '../control/testing/fake-prototype-control';
import { DevPanel } from './dev-panel';

const render = async () => {
  TestBed.configureTestingModule({
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
