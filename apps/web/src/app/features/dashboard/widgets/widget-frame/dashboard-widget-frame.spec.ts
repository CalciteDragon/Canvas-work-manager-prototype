import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { DashboardWidget } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { emptyDashboard } from '../../../../core/gateway/testing/fake-gateway';
import { widgetDefinitionFor, type DashboardWidgetDefinition } from '../registry';
import { DashboardWidgetFrame } from './dashboard-widget-frame';

const widget: DashboardWidget = { id: 'w-fact', type: 'fun_fact', position: 0, size: 'small', config: {}, hidden: false };
const funFact = widgetDefinitionFor('fun_fact')!;
const failing: DashboardWidgetDefinition = { ...funFact, failureOf: () => ({ sentence: 'Couldn’t write the fact.', reason: null }) };

const render = async (definition: DashboardWidgetDefinition, pending = false) => {
  TestBed.configureTestingModule({ imports: [DashboardWidgetFrame] });
  const fixture: ComponentFixture<DashboardWidgetFrame> = TestBed.createComponent(DashboardWidgetFrame);
  fixture.componentRef.setInput('widget', widget);
  fixture.componentRef.setInput('definition', definition);
  fixture.componentRef.setInput('dashboard', emptyDashboard());
  fixture.componentRef.setInput('pending', pending);
  let retries = 0;
  fixture.componentInstance.retry.subscribe(() => retries++);
  await fixture.whenStable();
  return { fixture, element: fixture.nativeElement as HTMLElement, retries: () => retries };
};

// Slice 78: widgets take data only; the frame renders a definition's failure and emits retry.
describe('DashboardWidgetFrame', () => {
  it('mounts the widget when its definition has no failure hook', async () => {
    const { element } = await render(funFact);

    expect(element.querySelector('[data-widget-title]')?.textContent).toBe('Fun Fact');
    expect(element.querySelector('app-fun-fact-widget')).not.toBeNull();
    expect(element.querySelector('[data-widget-failure]')).toBeNull();
  });

  it('renders the failure under the title instead of mounting the widget, and emits retry', async () => {
    const { fixture, element, retries } = await render(failing);

    expect(element.querySelector('[data-widget-title]')?.textContent).toBe('Fun Fact');
    expect(element.querySelector('app-fun-fact-widget')).toBeNull();
    expect(element.querySelector('[data-widget-failure] [data-failure-sentence]')?.textContent?.trim()).toBe('Couldn’t write the fact.');

    element.querySelector<HTMLElement>('[data-widget-failure] [data-recovery="try-again"]')!.click();
    await fixture.whenStable();
    expect(retries()).toBe(1);
  });

  it('is busy, its Try again aria-disabled, while pending', async () => {
    const { fixture, element, retries } = await render(failing, true);

    const failure = element.querySelector<HTMLElement>('[data-widget-failure]')!;
    expect(failure.getAttribute('aria-busy')).toBe('true');
    const button = failure.querySelector<HTMLElement>('[data-recovery="try-again"]')!;
    expect(button.getAttribute('aria-disabled')).toBe('true');
    button.click();
    await fixture.whenStable();
    expect(retries()).toBe(0);
  });
});
