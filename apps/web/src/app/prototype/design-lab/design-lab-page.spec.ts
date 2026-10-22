import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it } from 'vitest';
import { DesignLabPage } from './design-lab-page';
import { DESIGN_LAB_TOKENS } from './design-lab-tokens';

/**
 * The boundary test. `WORK_MANAGER_GATEWAY` is deliberately **not provided**: if anything
 * in the catalogue reaches for it, DI throws and this fails — a stronger claim than a
 * gateway that rejects every call. `provideRouter([])` is not a gateway; the sidebar panel
 * renders `RouterLink`, which injects `Router` and `ActivatedRoute`.
 */
const render = async () => {
  TestBed.configureTestingModule({ imports: [DesignLabPage], providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(DesignLabPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement };
};

afterEach(() => {
  for (const token of DESIGN_LAB_TOKENS) document.documentElement.style.removeProperty(token.property);
  for (const plane of ['ground', 'pane', 'sheet', 'lift']) {
    document.documentElement.style.removeProperty(`--plane-${plane}-background`);
    document.documentElement.style.removeProperty(`--plane-${plane}-filter`);
  }
  document.documentElement.style.removeProperty('--motion-duration-cap');
  document.documentElement.style.removeProperty('--lab-sheet-filter');
});

describe('DesignLabPage (§22, §67)', () => {
  it('renders every catalogue panel with no gateway provided', async () => {
    const { element } = await render();

    const panels = [...element.querySelectorAll('[data-panel]')].map((panel) =>
      panel.getAttribute('data-panel'),
    );
    expect(panels).toEqual([
      'task-row',
      'section-frame',
      'section-states',
      'widget-frame',
      'navigation',
      'drawer',
      'activity',
      'buttons',
      'inputs',
      'field-status',
      'object-rows',
      'cards',
      'project-cards',
      'menus',
      'states',
      'controls',
      'planes',
    ]);
    // The real components, not a screenshot of them.
    expect(element.querySelector('app-task-row')).not.toBeNull();
    expect(element.querySelector('app-project-section-frame')).not.toBeNull();
    expect(element.querySelector('app-dashboard-widget-frame')).not.toBeNull();
    expect(element.querySelector('app-sidebar')).not.toBeNull();
    expect(element.querySelector('app-task-detail-drawer')).not.toBeNull();
    expect(element.querySelector('app-activity-feed')).not.toBeNull();
  });

  it('offers §22’s controls and the Depth plane and motion controls', async () => {
    const { element } = await render();

    expect([...element.querySelectorAll('[data-design-lab-control]')].map((control) =>
      control.getAttribute('data-design-lab-control'),
    )).toEqual(['radius', 'spacing', 'surfaceContrast', 'accent', 'fontScale', 'elevation', 'sidebarWidth', 'canvasChromeRestOpacity',
      'paneTint', 'paneAlpha', 'paneBlur', 'sheetTint', 'sheetAlpha', 'sheetBlur',
      'liftTint', 'liftAlpha', 'liftBlur', 'groundArtStrength', 'motionScale']);
  });

  // §77: the catalogue distinguishes adopted primitives from representative feature markup.
  it('labels controls and object rows as shared and the other primitives as not yet', async () => {
    const { element } = await render();

    const badge = (name: string) => element.querySelector(`[data-panel="${name}"] .panel__badge`)?.textContent ?? '';
    for (const name of ['buttons', 'inputs', 'controls', 'object-rows']) {
      expect(badge(name), name).toContain('shared');
      expect(badge(name), name).not.toContain('not yet');
    }
    expect(element.querySelector('[data-panel="buttons"] button.button.button--primary')).not.toBeNull();
    expect(element.querySelector('[data-panel="inputs"] input.field')).not.toBeNull();
    expect(element.querySelector('[data-panel="inputs"] select.select')).not.toBeNull();
    expect(element.querySelector('.lab-button, .lab-input')).toBeNull();
    for (const name of ['cards', 'project-cards', 'menus', 'states']) {
      expect(badge(name), name).toContain('not yet a shared component');
    }
    for (const panel of element.querySelectorAll('[data-panel-kind="live"]')) {
      expect(panel.querySelector('.panel__badge')?.textContent).toContain('live component');
    }
  });

  it('writes a moved control through to the document element', async () => {
    const { fixture, element } = await render();

    const radius = element.querySelector<HTMLInputElement>('#design-lab-radius')!;
    radius.value = '1.6';
    radius.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(document.documentElement.style.getPropertyValue('--knob-radius-scale')).toBe('1.6');

    element.querySelector<HTMLElement>('[data-design-lab-reset]')!.click();
    await fixture.whenStable();
    expect(document.documentElement.style.getPropertyValue('--knob-radius-scale')).toBe('');
  });

  it('previews solid planes and reduced motion, and resets both checked states', async () => {
    const { fixture, element } = await render();
    for (const id of ['solid-planes', 'reduced-motion']) {
      const input = element.querySelector<HTMLInputElement>(`#design-lab-${id}`)!;
      input.checked = true;
      input.dispatchEvent(new Event('change'));
    }
    await fixture.whenStable();
    fixture.detectChanges();
    expect(document.documentElement.style.getPropertyValue('--plane-pane-filter')).toBe('none');
    expect(document.documentElement.style.getPropertyValue('--motion-duration-cap')).toBe('80ms');
    element.querySelector<HTMLElement>('[data-design-lab-reset]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector<HTMLInputElement>('#design-lab-solid-planes')!.checked).toBe(false);
    expect(element.querySelector<HTMLInputElement>('#design-lab-reduced-motion')!.checked).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--motion-duration-cap')).toBe('');
  });

  /**
   * The export's *values* cannot be asserted here: jsdom loads no stylesheet, so every
   * measurement comes back unresolved and the block is mostly empty. What this proves is
   * the part jsdom can see — the button copies a block that names the theme and both
   * targets in `_tokens.scss`, says so when the measurements are partial, and shows the
   * text whether or not the clipboard exists.
   */
  it('exports a block naming the theme, and shows it when the clipboard is unavailable', async () => {
    const { fixture, element } = await render();

    element.querySelector<HTMLElement>('[data-design-lab-export]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const output = element.querySelector<HTMLTextAreaElement>('[data-design-lab-export-output] textarea')!;
    expect(output.value).toContain('captured in the dark theme');
    expect(output.value).toContain(':root {');
    expect(output.value).toContain('_tokens.scss');
    // No stylesheet under jsdom, so the block says it is incomplete rather than pretending
    // — and it is genuinely empty, which is why no value is asserted above.
    expect(element.querySelector('[data-design-lab-export-partial]')).not.toBeNull();
    // The knob values themselves are never exported: 1 has to keep meaning "as written".
    expect(output.value).not.toContain('--knob-radius-scale:');
  });

  it('drops a stale export as soon as a control moves', async () => {
    const { fixture, element } = await render();

    element.querySelector<HTMLElement>('[data-design-lab-export]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('[data-design-lab-export-output]')).not.toBeNull();

    const radius = element.querySelector<HTMLInputElement>('#design-lab-radius')!;
    radius.value = '1.6';
    radius.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(element.querySelector('[data-design-lab-export-output]')).toBeNull();
  });
});
