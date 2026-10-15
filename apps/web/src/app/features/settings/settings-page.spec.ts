import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeService } from '../../core/theme/theme-service';
import { SettingsPage } from './settings-page';

afterEach(() => localStorage.clear());

describe('Settings appearance (§22)', () => {
  it('offers explicit light/dark choices and Match device through the shared service', async () => {
    TestBed.configureTestingModule({ imports: [SettingsPage], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(SettingsPage);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLInputElement>('[data-settings-theme="light"]')?.click();
    expect(TestBed.inject(ThemeService).theme()).toBe('light');
    expect(localStorage.getItem('cwm.theme')).toBe('light');
    element.querySelector<HTMLInputElement>('[data-settings-theme="dark"]')?.click();
    expect(TestBed.inject(ThemeService).theme()).toBe('dark');
    expect(localStorage.getItem('cwm.theme')).toBe('dark');
    element.querySelector<HTMLInputElement>('[data-settings-match-device]')?.click();
    expect(localStorage.getItem('cwm.theme')).toBeNull();
    await fixture.whenStable();
    expect(element.querySelector<HTMLInputElement>('[data-settings-match-device]')?.checked).toBe(true);
  });
});
