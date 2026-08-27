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
