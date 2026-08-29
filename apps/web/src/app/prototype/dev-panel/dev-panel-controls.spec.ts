import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it } from 'vitest';
import { PrototypeSettings } from '../../core/config/prototype-settings';
import { FakeWorkManagerGateway } from '../../core/gateway/testing/fake-gateway';
import { WORK_MANAGER_GATEWAY } from '../../core/gateway/work-manager-gateway';
import { PROTOTYPE_CONTROL } from '../control/prototype-control';
import { FakePrototypeControl } from '../control/testing/fake-prototype-control';
import { DevPanelControls } from './dev-panel-controls';

/**
 * §71 makes the development panel deliberately disposable, so this is a smoke test: that
 * §46's controls are present with the values the spec names, not an exhaustive pass over
 * every interaction.
 */
const renderFixture = async () => {
  TestBed.configureTestingModule({
    imports: [DevPanelControls],
    providers: [
      provideRouter([]),
      { provide: PROTOTYPE_CONTROL, useValue: new FakePrototypeControl() },
      { provide: WORK_MANAGER_GATEWAY, useValue: new FakeWorkManagerGateway() },
    ],
  });
  const fixture: ComponentFixture<DevPanelControls> = TestBed.createComponent(DevPanelControls);
  await fixture.whenStable();
  return fixture;
};

const render = async () => (await renderFixture()).nativeElement as HTMLElement;

const texts = (element: HTMLElement, selector: string) =>
  [...element.querySelectorAll(selector)].map((node) => node.textContent?.trim());

afterEach(() => {
  sessionStorage.clear();
  TestBed.resetTestingModule();
});

describe('DevPanelControls (§46)', () => {
  // §46's four values. The labels are abbreviated ('1 s' for the spec's "1 second") —
  // the values are what must match, and `prototype-settings.spec.ts` pins those.
  it('offers §46’s four latency presets', async () => {
    expect(texts(await render(), '[data-panel-delay]')).toEqual(['none', '300 ms', '1 s', '3 s']);
  });

  it('offers a failure ladder from never to always', async () => {
    expect(texts(await render(), '[data-panel-failure]')).toEqual(['0%', '25%', '50%', '100%']);
  });

  it('lists every persona the host reported', async () => {
    const element = await render();

    expect(texts(element, '[data-panel-persona]')).toEqual(['🧭 Demo User', '🌱 Alex']);
  });

  it('lists every seed the host reported, plus §76’s reset', async () => {
    const element = await render();

    expect(texts(element, '[data-panel-seed]')).toContain('overdue-chaos');
    expect(element.querySelector('[data-panel-reset]')).not.toBeNull();
  });

  // §47 names six. Four gate features later slices build, and the panel must not imply
  // that turning them changes anything today.
  it('renders all six §47 flags and marks the four that are inert', async () => {
    const element = await render();

    expect([...element.querySelectorAll('[data-panel-flag]')].map((node) => node.getAttribute('data-flag'))).toEqual([
      'gridProjectLayout',
      'nestedProjects',
      'subtasks',
      'manualProgress',
      'aiSummarySections',
      'agentConfirmations',
    ]);
    expect(element.querySelectorAll('[data-panel-flag-inert]')).toHaveLength(4);
  });

  it('writes a flag change into the one central service', async () => {
    const element = await render();
    const settings = TestBed.inject(PrototypeSettings);

    element.querySelector<HTMLInputElement>('[data-flag="nestedProjects"]')?.click();

    expect(settings.flags().nestedProjects).toBe(false);
  });

  it('says the layout control needs a project when the route has none', async () => {
    expect((await render()).querySelector('[data-layout-no-project]')).not.toBeNull();
  });

  it('offers the theme and AI provider choices', async () => {
    const element = await render();

    expect(texts(element, '[data-panel-theme]')).toEqual(['dark', 'light']);
    expect(texts(element, '[data-panel-ai]')).toEqual(['mock', 'real']);
  });

  it('captures a §79 note and confirms where it went', async () => {
    const fixture = await renderFixture();
    const element = fixture.nativeElement as HTMLElement;
    const control = TestBed.inject(PROTOTYPE_CONTROL) as FakePrototypeControl;
    const textarea = element.querySelector<HTMLTextAreaElement>('[data-panel-note]')!;

    textarea.value = 'The seed control needs a confirmation step.';
    textarea.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    element.querySelector<HTMLButtonElement>('[data-panel-note-save]')?.click();
    await fixture.whenStable();

    expect(control.notes.at(-1)?.note).toBe('The seed control needs a confirmation step.');
    expect(element.querySelector('[data-panel-note-saved]')).not.toBeNull();
  });
});
