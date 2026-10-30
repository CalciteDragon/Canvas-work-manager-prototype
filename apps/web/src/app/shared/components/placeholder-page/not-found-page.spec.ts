import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { NotFoundPage } from './not-found-page';

describe('NotFoundPage — the ** route (§68, Slice 78)', () => {
  it('says the page does not exist in plain words, with no §, and leads back to Home', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(NotFoundPage);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const heading = element.querySelector('h1')!;
    expect(heading.textContent?.trim()).toBe('This page doesn’t exist');
    expect(heading.hasAttribute('data-route-focus')).toBe(true);
    expect(element.textContent).toContain('Check the address, or go to Home.');
    expect(element.textContent).not.toContain('§');
    expect(element.querySelector('details')).toBeNull();
    expect(element.querySelector('a[data-go-home]')?.getAttribute('href')).toBe('/app');
  });
});
