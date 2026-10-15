import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeService } from './theme-service';

const key = 'cwm.theme';
let media: MediaQueryList;
let listeners: Set<EventListener>;
const service = () => TestBed.configureTestingModule({}).inject(ThemeService);
const device = (dark: boolean) => {
  Object.defineProperty(media, 'matches', { value: dark, configurable: true });
  listeners.forEach((listener) => listener({ matches: dark } as MediaQueryListEvent));
};

beforeEach(() => {
  listeners = new Set();
  media = {
    matches: false,
    addEventListener: vi.fn((_type, listener) => listeners.add(listener)),
    removeEventListener: vi.fn((_type, listener) => listeners.delete(listener)),
  } as unknown as MediaQueryList;
  vi.stubGlobal('matchMedia', vi.fn(() => media));
});
afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('ThemeService — device and explicit choice (§22)', () => {
  it('paints the device preference on construction and follows changes live', () => {
    const theme = service();
    expect(theme.theme()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    device(true);
    expect(theme.theme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    device(false);
    expect(theme.theme()).toBe('light');
  });

  it('persists toggles across construction and ignores device changes until Match device', () => {
    const theme = service();
    theme.toggle();
    expect(localStorage.getItem(key)).toBe('dark');
    device(false);
    expect(theme.theme()).toBe('dark');
    TestBed.resetTestingModule();
    const reloaded = service();
    expect(reloaded.theme()).toBe('dark');
    expect(reloaded.followsDevice()).toBe(false);
    reloaded.matchDevice();
    expect(localStorage.getItem(key)).toBeNull();
    expect(reloaded.theme()).toBe('light');
    expect(reloaded.followsDevice()).toBe(true);
    TestBed.resetTestingModule();
    expect(service().theme()).toBe('light');
  });

  it('uses either valid stored choice and ignores malformed storage', () => {
    for (const value of ['light', 'dark', 'invalid']) {
      localStorage.setItem(key, value);
      const theme = service();
      expect(theme.theme()).toBe(value === 'dark' ? 'dark' : 'light');
      expect(theme.followsDevice()).toBe(value === 'invalid');
      TestBed.resetTestingModule();
    }
  });

  it('keeps working for this session when every storage operation throws', () => {
    for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => { throw new Error('blocked'); });
    }
    const theme = service();
    theme.set('dark');
    device(false);
    expect(theme.theme()).toBe('dark');
    theme.matchDevice();
    expect(theme.theme()).toBe('light');
  });

  it('falls back to dark without matchMedia and removes its listener on destruction', () => {
    service();
    expect(listeners.size).toBe(1);
    TestBed.resetTestingModule();
    expect(listeners.size).toBe(0);
    vi.stubGlobal('matchMedia', undefined);
    expect(service().theme()).toBe('dark');
  });
});

