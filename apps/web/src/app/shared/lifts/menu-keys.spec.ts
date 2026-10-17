import { afterEach, describe, expect, it, vi } from 'vitest';
import { menuKeys } from './menu-keys';

afterEach(() => document.body.replaceChildren());

describe('menuKeys', () => {
  it('wraps, jumps to either end and closes on Tab without trapping it', () => {
    const items = [document.createElement('button'), document.createElement('button')];
    document.body.append(...items);
    const close = vi.fn();
    items[0].focus();
    menuKeys(new KeyboardEvent('keydown', { key: 'ArrowUp' }), items, close);
    expect(document.activeElement).toBe(items[1]);
    menuKeys(new KeyboardEvent('keydown', { key: 'ArrowDown' }), items, close);
    expect(document.activeElement).toBe(items[0]);
    menuKeys(new KeyboardEvent('keydown', { key: 'End' }), items, close);
    expect(document.activeElement).toBe(items[1]);
    menuKeys(new KeyboardEvent('keydown', { key: 'Home' }), items, close);
    expect(document.activeElement).toBe(items[0]);
    const tab = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    menuKeys(tab, items, close);
    expect(close).toHaveBeenCalledOnce();
    expect(tab.defaultPrevented).toBe(false);
  });
});
