import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { UnavailablePage } from './unavailable-page';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UnavailablePage],
  template: `
    <app-unavailable-page heading="This project isn’t available" sentence="It may have been removed, or it isn’t shared with you.">
      <button type="button" data-extra>Retry</button>
    </app-unavailable-page>
  `,
})
class Host {}

const setup = () => {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
};

describe('UnavailablePage (§68, Slice 78)', () => {
  it('lands focus on its heading, says one sentence, and leads back to Home', () => {
    const element = setup();
    const heading = element.querySelector('h1')!;
    expect(heading.textContent?.trim()).toBe('This project isn’t available');
    expect(heading.getAttribute('tabindex')).toBe('-1');
    expect(heading.hasAttribute('data-route-focus')).toBe(true);
    expect(element.querySelector('[data-unavailable-sentence]')?.textContent?.trim()).toBe('It may have been removed, or it isn’t shared with you.');
    const home = element.querySelector<HTMLAnchorElement>('a[data-go-home]')!;
    expect(home.textContent?.trim()).toBe('Go to Home');
    expect(home.getAttribute('href')).toBe('/app');
  });

  it('offers no Try again and no Details, and keeps what its caller projects', () => {
    const element = setup();
    expect(element.querySelector('details')).toBeNull();
    expect(element.querySelector('[data-recovery]')).toBeNull();
    expect(element.textContent).not.toContain('Try again');
    expect(element.querySelector('[data-extra]')).not.toBeNull();
  });
});
