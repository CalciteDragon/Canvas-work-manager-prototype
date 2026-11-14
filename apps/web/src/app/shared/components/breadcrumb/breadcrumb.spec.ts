import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it } from 'vitest';
import { Breadcrumb, type BreadcrumbItem } from './breadcrumb';

const cabinets: BreadcrumbItem[] = [
  { label: 'Home renovation', link: ['/projects', 'project-home'] },
  { label: 'Kitchen', link: ['/projects', 'project-kitchen'] },
  { label: 'Cabinets', link: null },
];

const render = (items: readonly BreadcrumbItem[], variant?: 'navigation' | 'inline') => {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(Breadcrumb);
  fixture.componentRef.setInput('items', items);
  if (variant) fixture.componentRef.setInput('variant', variant);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
};
const text = (element: Element) => element.textContent?.replace(/\s+/g, ' ').trim();

afterEach(() => TestBed.resetTestingModule());

describe('Breadcrumb (§26, Slice 81, L7-004)', () => {
  it('is a navigation landmark of ancestors as links, the current item last as text', () => {
    const element = render(cabinets);
    const nav = element.querySelector('nav')!;
    expect(nav.getAttribute('aria-label')).toBe('Breadcrumb');
    const items = [...nav.querySelectorAll('ol > li')];
    expect(items.map(text)).toEqual(['Home renovation', '›Kitchen', '›Cabinets']);
    const links = [...nav.querySelectorAll('a')];
    expect(links.map(text)).toEqual(['Home renovation', 'Kitchen']);
    expect(links[1].getAttribute('href')).toBe('/projects/project-kitchen');
    const current = items[2].querySelector('[aria-current="page"]')!;
    expect(current.tagName).toBe('SPAN');
    expect(text(current)).toBe('Cabinets');
    expect(nav.querySelectorAll('[aria-current]')).toHaveLength(1);
  });

  it('draws its separators as decoration', () => {
    const separators = [...render(cabinets).querySelectorAll('.breadcrumb__separator')];
    expect(separators).toHaveLength(2);
    for (const separator of separators) {
      expect(separator.getAttribute('aria-hidden')).toBe('true');
      expect(separator.textContent?.trim()).toBe('›');
    }
  });

  it('makes its links themed pills, not underlined content links (decision 2, Q14 (a))', () => {
    const element = render(cabinets);
    for (const link of element.querySelectorAll('a')) {
      expect(link.classList.contains('breadcrumb__link')).toBe(true);
      expect(link.classList.contains('link')).toBe(false);
    }
  });

  it('keeps a fragment on a link', () => {
    const element = render([{ label: 'Home renovation', link: ['/projects', 'project-home'], fragment: 'section-a' }, { label: 'Backlog', link: null }]);
    expect(element.querySelector('a')!.getAttribute('href')).toBe('/projects/project-home#section-a');
  });

  it('inline: a path inside a sentence, with content links, no landmark and nothing current (W2-030)', () => {
    const element = render([
      { label: 'Home renovation', link: ['/projects', 'project-home'] },
      { label: 'Legacy attic', link: ['/projects', 'project-attic'] },
      { label: 'Work canvas', link: null },
    ], 'inline');
    expect(element.querySelector('nav, ol, [aria-current]')).toBeNull();
    expect(text(element)).toBe('Home renovation › Legacy attic › Work canvas');
    const links = [...element.querySelectorAll('a')];
    expect(links.map(text)).toEqual(['Home renovation', 'Legacy attic']);
    for (const link of links) {
      expect(link.classList.contains('link')).toBe(true);
      expect(link.classList.contains('link--inline')).toBe(true);
      expect(link.classList.contains('breadcrumb__link')).toBe(false);
    }
    expect(element.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
  });
});
