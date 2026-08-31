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
      'cards',
      'project-cards',
      'menus',
      'states',
    ]);
    // The real components, not a screenshot of them.
    expect(element.querySelector('app-task-row')).not.toBeNull();
    expect(element.querySelector('app-project-section-frame')).not.toBeNull();
    expect(element.querySelector('app-dashboard-widget-frame')).not.toBeNull();
    expect(element.querySelector('app-sidebar')).not.toBeNull();
    expect(element.querySelector('app-task-detail-drawer')).not.toBeNull();
    expect(element.querySelector('app-activity-feed')).not.toBeNull();
  });

  it('offers §22’s seven controls', async () => {
    const { element } = await render();

    expect([...element.querySelectorAll('[data-design-lab-control]')].map((control) =>
      control.getAttribute('data-design-lab-control'),
    )).toEqual(['radius', 'spacing', 'surfaceContrast', 'accent', 'fontScale', 'elevation', 'sidebarWidth']);
  });

  it('labels each primitive panel as not yet a shared component', async () => {
    const { element } = await render();

    const primitives = [...element.querySelectorAll('[data-panel-kind="primitive"]')];
    expect(primitives.length).toBeGreaterThan(0);
    for (const panel of primitives) {
      expect(panel.querySelector('.panel__badge')?.textContent).toContain('not yet a shared component');
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
});
