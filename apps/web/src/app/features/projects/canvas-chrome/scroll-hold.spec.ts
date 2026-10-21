import { describe, expect, it } from 'vitest';
import { ScrollHold } from './scroll-hold';

/** A scroller and placements whose geometry the test moves by hand, as layout would. */
const harness = (options: { scrollTop?: number; viewport?: number } = {}) => {
  const scroller = document.createElement('main');
  let scrollTop = options.scrollTop ?? 400;
  Object.defineProperty(scroller, 'scrollTop', {
    get: () => scrollTop,
    set: (value: number) => { scrollTop = Math.max(0, value); },
  });
  scroller.getBoundingClientRect = () => ({ top: 0, bottom: options.viewport ?? 800 }) as DOMRect;
  const placement = (top: number) => {
    const element = document.createElement('div');
    let current = top;
    element.getBoundingClientRect = () => ({ top: current - (scrollTop - (options.scrollTop ?? 400)) }) as DOMRect;
    scroller.append(element);
    return { element, moveBy: (delta: number) => { current += delta; } };
  };
  return { scroller, placement, scrollTop: () => scrollTop, scrollBy: (delta: number) => { scrollTop += delta; } };
};

describe('ScrollHold (Slice 75, W1-030, W2-010)', () => {
  it('scrolls by the growth above the working placement, so its top stays put', () => {
    const { scroller, placement, scrollTop } = harness();
    placement(100);
    const list = placement(300);
    const hold = new ScrollHold(scroller);
    hold.setWorking(list.element);

    // Recent Activity above gains a 48 px row: everything below it moves down.
    list.moveBy(48);
    hold.check();

    expect(scrollTop()).toBe(448);
    expect(list.element.getBoundingClientRect().top).toBe(300);
  });

  it('never scrolls for growth below the working placement', () => {
    const { scroller, placement, scrollTop } = harness();
    const list = placement(300);
    placement(700);
    const hold = new ScrollHold(scroller);
    hold.setWorking(list.element);

    hold.check();

    expect(scrollTop()).toBe(400);
  });

  it('holds across several writes, and through the working list’s own growth', () => {
    const { scroller, placement, scrollTop } = harness();
    const list = placement(300);
    const hold = new ScrollHold(scroller);
    hold.setWorking(list.element);

    list.moveBy(48);
    hold.check();
    // The list's own new row grows it downward and leaves its top alone; a second activity row
    // arrives in the same frame.
    list.moveBy(48);
    hold.check();

    expect(scrollTop()).toBe(496);
    expect(list.element.getBoundingClientRect().top).toBe(300);
  });

  it('lets a scroll since the last check stand: a user scroll or a reveal resets the baseline', () => {
    const { scroller, placement, scrollTop, scrollBy } = harness();
    const list = placement(300);
    const hold = new ScrollHold(scroller);
    hold.setWorking(list.element);

    scrollBy(120);
    list.moveBy(48);
    hold.check();
    expect(scrollTop()).toBe(520);

    // The new baseline is where that scroll left the list; later growth above holds it there.
    list.moveBy(30);
    hold.check();
    expect(scrollTop()).toBe(550);
    expect(list.element.getBoundingClientRect().top).toBe(180 + 48);
  });

  it('holds nothing at scroll offset 0, where there is nothing above the viewport to hold against', () => {
    const { scroller, placement, scrollTop } = harness({ scrollTop: 0 });
    const list = placement(300);
    const hold = new ScrollHold(scroller);
    hold.setWorking(list.element);

    list.moveBy(48);
    hold.check();

    expect(scrollTop()).toBe(0);
  });

  it('holds nothing when the working placement was off screen, so the visible content is not moved', () => {
    const { scroller, placement, scrollTop } = harness({ viewport: 800 });
    const list = placement(1200);
    const hold = new ScrollHold(scroller);
    hold.setWorking(list.element);

    list.moveBy(48);
    hold.check();

    expect(scrollTop()).toBe(400);
  });

  it('holds nothing without a working placement, or once it has left the page', () => {
    const { scroller, placement, scrollTop } = harness();
    const list = placement(300);
    const hold = new ScrollHold(scroller);

    list.moveBy(48);
    hold.check();
    expect(scrollTop()).toBe(400);

    hold.setWorking(list.element);
    list.element.remove();
    list.moveBy(48);
    hold.check();
    expect(scrollTop()).toBe(400);
  });

  it('a new working placement takes its own baseline', () => {
    const { scroller, placement, scrollTop } = harness();
    const first = placement(100);
    const second = placement(400);
    const hold = new ScrollHold(scroller);
    hold.setWorking(first.element);
    first.moveBy(10);
    second.moveBy(10);
    hold.setWorking(second.element);

    hold.check();
    expect(scrollTop()).toBe(400);

    second.moveBy(48);
    hold.check();
    expect(scrollTop()).toBe(448);
  });
});
