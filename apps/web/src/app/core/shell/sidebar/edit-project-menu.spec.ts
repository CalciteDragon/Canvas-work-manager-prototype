import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditProjectMenu } from './edit-project-menu';

// jsdom has no popover API: `hidePopover` fires the toggle a browser would, and opening is the
// toggle event a `popovertarget` press fires (as `project-header.spec.ts` does for More).
const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'hidePopover');
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'hidePopover', { configurable: true, value() {
    this.dispatchEvent(Object.assign(new Event('toggle'), { newState: 'closed', oldState: 'open' }));
  } });
});
afterEach(() => {
  if (original) Object.defineProperty(HTMLElement.prototype, 'hidePopover', original);
  else Reflect.deleteProperty(HTMLElement.prototype, 'hidePopover');
  document.body.replaceChildren();
});

const render = async (inputs: { addBlockedReason?: string | null } = {}) => {
  const fixture: ComponentFixture<EditProjectMenu> = TestBed.createComponent(EditProjectMenu);
  fixture.componentRef.setInput('rootName', 'Home renovation');
  fixture.componentRef.setInput('addBlockedReason', inputs.addBlockedReason ?? null);
  // A parent listening for Escape, as the phone drawer does (`app-shell.html`).
  const parent = document.createElement('div');
  const parentEscape = vi.fn();
  parent.addEventListener('keydown', (event) => { if (event.key === 'Escape') parentEscape(); });
  parent.appendChild(fixture.nativeElement);
  document.body.appendChild(parent);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string) => element.querySelector<T>(selector)!;
  const settle = async () => { await fixture.whenStable(); await fixture.whenStable(); };
  const pencil = () => q('[data-edit-project]');
  const menu = () => q('[data-edit-project-menu]');
  const open = async () => {
    pencil().focus();
    menu().dispatchEvent(Object.assign(new Event('toggle'), { newState: 'open', oldState: 'closed' }));
    await settle();
  };
  const key = (target: HTMLElement, name: string) => {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  };
  const pages = vi.fn();
  const add = vi.fn();
  fixture.componentInstance.pageSettingsRequested.subscribe(pages);
  fixture.componentInstance.addWorkstreamRequested.subscribe(add);
  return { fixture, element, q, settle, pencil, menu, open, key, parentEscape, pages, add };
};

describe('EditProjectMenu — the tree’s pencil (Slice 81, decision 3)', () => {
  it('is an icon button named Edit project that opens a menu', async () => {
    const { pencil, menu } = await render();

    expect(pencil().tagName).toBe('BUTTON');
    expect(pencil().getAttribute('aria-label')).toBe('Edit project');
    expect(pencil().getAttribute('aria-haspopup')).toBe('menu');
    expect(pencil().getAttribute('aria-expanded')).toBe('false');
    expect(pencil().getAttribute('popovertarget')).toBe(menu().id);
    expect(pencil().classList).toContain('icon-button');
    // The tooltip is drawn from the name, never a `title`, so the name is not announced twice.
    expect(pencil().getAttribute('data-tooltip')).toBe('');
    expect(pencil().hasAttribute('title')).toBe(false);
    expect(menu().getAttribute('popover')).toBe('auto');
    expect(menu().getAttribute('role')).toBe('menu');
  });

  it('opens with focus on Pages of Home renovation…, and the arrows, Home and End move between the two items', async () => {
    const { q, open, key, pencil } = await render();
    await open();
    const pagesItem = q('[data-edit-project-pages]');
    const addItem = q('[data-edit-project-add]');

    expect(pencil().getAttribute('aria-expanded')).toBe('true');
    expect([pagesItem, addItem].map((item) => [item.getAttribute('role'), item.textContent?.trim()])).toEqual([
      ['menuitem', 'Pages of Home renovation…'],
      ['menuitem', 'Add workstream'],
    ]);
    expect(document.activeElement).toBe(pagesItem);
    key(pagesItem, 'ArrowDown');
    expect(document.activeElement).toBe(addItem);
    key(addItem, 'ArrowUp');
    expect(document.activeElement).toBe(pagesItem);
    key(pagesItem, 'End');
    expect(document.activeElement).toBe(addItem);
    key(addItem, 'Home');
    expect(document.activeElement).toBe(pagesItem);
  });

  it('describes Add workstream as in Home renovation', async () => {
    const { element, q } = await render();
    const addItem = q('[data-edit-project-add]');

    expect(addItem.getAttribute('aria-disabled')).toBeNull();
    expect(element.querySelector(`#${addItem.getAttribute('aria-describedby')}`)?.textContent?.trim()).toBe('in Home renovation');
  });

  // Step 3 review: the drawer closes on any Escape that reaches it, so the menu keeps its Escape.
  it('closes on Escape, focuses the pencil, and does not let the Escape reach a parent', async () => {
    const { q, open, key, settle, pencil, parentEscape } = await render();
    await open();

    key(q('[data-edit-project-pages]'), 'Escape');
    await settle();

    expect(pencil().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(pencil());
    expect(parentEscape).not.toHaveBeenCalled();
    // Its tooltip stays down after the menu, so the next Escape reaches the drawer (step 5 review).
    expect(pencil().hasAttribute('data-tooltip-hidden')).toBe(true);
  });

  it('closes on Tab', async () => {
    const { q, open, key, settle, pencil } = await render();
    await open();

    key(q('[data-edit-project-pages]'), 'Tab');
    await settle();

    expect(pencil().getAttribute('aria-expanded')).toBe('false');
  });

  it.each([
    ['Pages of Home renovation…', '[data-edit-project-pages]', 'pages'],
    ['Add workstream', '[data-edit-project-add]', 'add'],
  ] as const)('emits %s once, with the pencil, after the menu has closed', async (_name, selector, which) => {
    const rendered = await render();
    await rendered.open();
    const emitted = rendered[which];
    const other = rendered[which === 'pages' ? 'add' : 'pages'];
    emitted.mockImplementation(() => expect(rendered.pencil().getAttribute('aria-expanded')).toBe('false'));

    rendered.q(selector).click();
    await rendered.settle();

    expect(emitted).toHaveBeenCalledExactlyOnceWith(rendered.pencil());
    expect(other).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(rendered.pencil());
  });

  it('keeps an archived root’s Add workstream focusable, unavailable and described by its reason', async () => {
    const reason = 'Home renovation is archived. Restore it to add workstreams.';
    const { element, q, open, key, settle, add, pencil } = await render({ addBlockedReason: reason });
    await open();
    const addItem = q('[data-edit-project-add]');

    expect(addItem.getAttribute('aria-disabled')).toBe('true');
    expect(addItem.hasAttribute('disabled')).toBe(false);
    expect(element.querySelector(`#${addItem.getAttribute('aria-describedby')}`)?.textContent?.trim()).toBe(reason);
    key(q('[data-edit-project-pages]'), 'ArrowDown');
    expect(document.activeElement).toBe(addItem);

    addItem.click();
    await settle();

    expect(add).not.toHaveBeenCalled();
    expect(pencil().getAttribute('aria-expanded')).toBe('true');
  });
});
