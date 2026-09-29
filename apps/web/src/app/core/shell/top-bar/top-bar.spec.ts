import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { Identity } from '@cwm/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { testIdentity } from '../../gateway/testing/shell-test-providers';
import { TopBar } from './top-bar';

const render = async (identity: Identity | null) => {
  TestBed.configureTestingModule({ imports: [TopBar] });
  const fixture: ComponentFixture<TopBar> = TestBed.createComponent(TopBar);
  fixture.componentRef.setInput('identity', identity);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
};

afterEach(() => document.documentElement.removeAttribute('data-theme'));

describe('TopBar', () => {
  it('names the persona and shows their emoji avatar', async () => {
    const element = await render(testIdentity());

    expect(element.querySelector('[data-identity-name]')?.textContent).toContain('Demo User');
    expect(element.querySelector('[data-identity-avatar]')?.textContent?.trim()).toBe('🧭');
  });

  // `avatar` is optional on `User`, and it is a glyph rather than an image URL.
  it('falls back to an initial when the persona has no avatar', async () => {
    const identity = testIdentity();
    const element = await render({ ...identity, user: { ...identity.user, avatar: undefined } });

    expect(element.querySelector('[data-identity-avatar]')?.textContent?.trim()).toBe('D');
  });

  it('switches the theme through the token attribute alone (§22)', async () => {
    const element = await render(testIdentity());

    element.querySelector<HTMLButtonElement>('[data-theme-toggle]')?.click();

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});

// Slice 58: at phone width the shell hands its navigation to a drawer, and the Menu that opens
// it lives here. The top bar only renders it and reports activation; `AppShell` owns the state.
describe('TopBar — the phone Menu (Slice 58)', () => {
  const renderMenu = async (inputs: { menuAvailable?: boolean; menuOpen?: boolean } = {}) => {
    TestBed.configureTestingModule({ imports: [TopBar] });
    const fixture: ComponentFixture<TopBar> = TestBed.createComponent(TopBar);
    fixture.componentRef.setInput('identity', testIdentity());
    if (inputs.menuAvailable !== undefined) fixture.componentRef.setInput('menuAvailable', inputs.menuAvailable);
    if (inputs.menuOpen !== undefined) fixture.componentRef.setInput('menuOpen', inputs.menuOpen);
    const requested: void[] = [];
    fixture.componentInstance.menuRequested.subscribe(() => requested.push(undefined));
    await fixture.whenStable();
    return { fixture, element: fixture.nativeElement as HTMLElement, requested };
  };

  it('offers no Menu unless the shell makes one available', async () => {
    const { element } = await renderMenu();

    expect(element.querySelector('[data-shell-menu]')).toBeNull();
  });

  it('names the drawer it controls, reflects its state, and reports activation', async () => {
    const { fixture, element, requested } = await renderMenu({ menuAvailable: true, menuOpen: false });
    const menu = element.querySelector<HTMLButtonElement>('[data-shell-menu]');

    expect(menu?.tagName).toBe('BUTTON');
    expect(menu?.textContent?.trim()).toBe('Menu');
    expect(menu?.getAttribute('aria-controls')).toBe('shell-navigation');
    expect(menu?.getAttribute('aria-expanded')).toBe('false');

    menu?.click();
    expect(requested).toHaveLength(1);

    fixture.componentRef.setInput('menuOpen', true);
    await fixture.whenStable();
    expect(element.querySelector('[data-shell-menu]')?.getAttribute('aria-expanded')).toBe('true');
  });

  // Visually hidden below the breakpoint by the stylesheet, but never removed or aria-hidden:
  // the persona is still who a screen reader user is acting as.
  it('keeps the persona name in the accessibility tree while the Menu is offered', async () => {
    const { element } = await renderMenu({ menuAvailable: true });
    const name = element.querySelector('[data-identity-name]');

    expect(name?.textContent).toContain('Demo User');
    expect(name?.closest('[aria-hidden="true"], [hidden]')).toBeNull();
  });
});
