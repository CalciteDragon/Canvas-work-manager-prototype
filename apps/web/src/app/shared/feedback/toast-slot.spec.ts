import { TestBed } from '@angular/core/testing';
import { NavigationStart, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ToastSlot } from './toast-slot';

describe('ToastSlot', () => {
  it('closes the prior holder before a new claim and ignores stale holder release', () => {
    const slot = TestBed.inject(ToastSlot);
    const first = vi.fn();
    const second = vi.fn();
    const releaseFirst = slot.claim(first);
    slot.claim(second);
    expect(first).toHaveBeenCalledWith('replaced');
    releaseFirst();
    slot.close('write');
    expect(second).toHaveBeenCalledWith('write');
  });

  it('releases the held toast without closing it again', () => {
    const slot = TestBed.inject(ToastSlot);
    const close = vi.fn();
    slot.claim(close)();
    slot.close();
    expect(close).not.toHaveBeenCalled();
  });

  it('closes on NavigationStart, including same-root navigation', () => {
    const events = new Subject<NavigationStart>();
    TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: { events } }] });
    const close = vi.fn();
    TestBed.inject(ToastSlot).claim(close);
    events.next(new NavigationStart(1, '/projects/root/pages/work'));
    expect(close).toHaveBeenCalledWith('navigation');
  });

  it('suppresses without losing its holder until every suppression is released', () => {
    const slot = TestBed.inject(ToastSlot);
    const close = vi.fn();
    slot.claim(close);
    slot.suppress('phone');
    slot.suppress('dialog');
    expect(slot.suppressed()).toBe(true);
    slot.release('phone');
    expect(slot.suppressed()).toBe(true);
    slot.release('dialog');
    expect(slot.suppressed()).toBe(false);
    expect(close).not.toHaveBeenCalled();
    slot.close();
    expect(close).toHaveBeenCalledOnce();
  });
});
