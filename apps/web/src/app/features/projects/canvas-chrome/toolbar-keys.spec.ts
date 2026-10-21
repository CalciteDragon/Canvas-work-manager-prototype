import { describe, expect, it } from 'vitest';
import { toolbarKeydown, toolbarFocusin } from './toolbar-keys';
describe('canvas toolbar keys (§31–32)', () => {
  it('roves with wrap and Home/End, ignores vertical arrows and follows any focus', () => {
    const toolbar = document.createElement('div');
    toolbar.innerHTML = '<button tabindex="0">Rename</button><button tabindex="-1">Collapse</button><button tabindex="-1">Move</button>';
    document.body.append(toolbar);
    toolbar.addEventListener('keydown', toolbarKeydown);
    toolbar.addEventListener('focusin', toolbarFocusin);
    const items = [...toolbar.querySelectorAll('button')];
    const key = (name: string) => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
    try {
      items[0].focus(); key('ArrowLeft'); expect(document.activeElement).toBe(items[2]);
      key('ArrowRight'); expect(document.activeElement).toBe(items[0]);
      key('End'); expect(document.activeElement).toBe(items[2]);
      key('Home'); expect(document.activeElement).toBe(items[0]);
      expect(key('ArrowDown')).toBe(true); expect(key('ArrowUp')).toBe(true);
      items[1].focus(); expect(items.map((item) => item.tabIndex)).toEqual([-1, 0, -1]);
    } finally { toolbar.remove(); }
  });
});
