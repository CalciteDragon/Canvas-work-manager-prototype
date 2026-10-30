import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { PinnedFailures } from './pinned-failures';

const failure = (subject: string, reveal = vi.fn()) => ({ subject, sentence: `Couldn’t complete “${subject}”. Try again.`, reveal });

describe('PinnedFailures', () => {
  it('shows nothing until a registration is placed off an edge', () => {
    const pins = TestBed.inject(PinnedFailures);
    const root = document.createElement('div');
    const registration = pins.register(root, failure('Order tiles'));
    expect(pins.pinsFor(root)).toEqual({ top: null, bottom: null });
    registration.place('bottom');
    expect(pins.pinsFor(root).bottom).toMatchObject({ subject: 'Order tiles', sentence: 'Couldn’t complete “Order tiles”.', more: 0 });
    expect(pins.pinsFor(root).top).toBeNull();
    registration.place(null);
    expect(pins.pinsFor(root).bottom).toBeNull();
  });

  it('shows the most recent failure per edge with a count of the rest', () => {
    const pins = TestBed.inject(PinnedFailures);
    const root = document.createElement('div');
    pins.register(root, failure('First')).place('bottom');
    pins.register(root, failure('Second')).place('bottom');
    pins.register(root, failure('Above')).place('top');
    expect(pins.pinsFor(root).bottom).toMatchObject({ subject: 'Second', more: 1 });
    expect(pins.pinsFor(root).top).toMatchObject({ subject: 'Above', more: 0 });
  });

  it('filters registrations by scroll root', () => {
    const pins = TestBed.inject(PinnedFailures);
    const root = document.createElement('div');
    pins.register(document.createElement('div'), failure('Elsewhere')).place('top');
    expect(pins.pinsFor(root).top).toBeNull();
  });

  it('reveals the most recent through its own callback', () => {
    const pins = TestBed.inject(PinnedFailures);
    const root = document.createElement('div');
    const first = vi.fn(), second = vi.fn();
    pins.register(root, failure('First', first)).place('bottom');
    pins.register(root, failure('Second', second)).place('bottom');
    pins.reveal(pins.pinsFor(root).bottom!.id);
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
  });

  it('dismisses one occurrence: it does not re-pin when placed again, and the next one shows', () => {
    const pins = TestBed.inject(PinnedFailures);
    const root = document.createElement('div');
    pins.register(root, failure('First')).place('bottom');
    const second = pins.register(root, failure('Second'));
    second.place('bottom');
    pins.dismiss(pins.pinsFor(root).bottom!.id);
    expect(pins.pinsFor(root).bottom).toMatchObject({ subject: 'First', more: 0 });
    second.place(null);
    second.place('bottom');
    expect(pins.pinsFor(root).bottom).toMatchObject({ subject: 'First' });
  });

  it('re-arms on a new registration and ignores a superseded one', () => {
    const pins = TestBed.inject(PinnedFailures);
    const root = document.createElement('div');
    const old = pins.register(root, failure('Task'));
    old.place('top');
    pins.dismiss(pins.pinsFor(root).top!.id);
    old.unregister();
    const replacement = pins.register(root, failure('Task'));
    replacement.place('top');
    expect(pins.pinsFor(root).top).toMatchObject({ subject: 'Task' });
    old.place('bottom');
    expect(pins.pinsFor(root).bottom).toBeNull();
    replacement.unregister();
    expect(pins.pinsFor(root).top).toBeNull();
  });

  it('keeps measured edge clearance per root, as a signal read', () => {
    const pins = TestBed.inject(PinnedFailures);
    const root = document.createElement('div');
    expect(pins.clearanceOf(root)).toEqual({ top: 0, bottom: 0 });
    pins.setClearance(root, { top: 48, bottom: 0 });
    expect(pins.clearanceOf(root)).toEqual({ top: 48, bottom: 0 });
  });
});
