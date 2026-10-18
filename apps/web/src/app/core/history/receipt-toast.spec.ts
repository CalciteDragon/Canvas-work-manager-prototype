import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { ToastSlot } from '../../shared/feedback/toast-slot';
import { RECEIPT_UNDO, type ReceiptUndo } from './receipt-undo';
import type { OperationWriteReport } from './operation-history-reporter';
import { ReceiptToast } from './receipt-toast';

const report = { projectId: 'kitchen', receipt: { actionId: 'step' } } as OperationWriteReport;
const setup = () => {
  const ready = signal<'saving' | 'ready' | 'unavailable'>('saving');
  const undo = { offer: () => ready(), undo: vi.fn(async () => ({ tone: 'status' as const, message: 'Undone: Removed Notes.' })), writeSequence: signal(0), generation: signal(0) } satisfies ReceiptUndo;
  TestBed.configureTestingModule({ providers: [{ provide: RECEIPT_UNDO, useValue: undo }] });
  const toast = TestBed.runInInjectionContext(() => new ReceiptToast());
  return { toast, undo, ready, slot: TestBed.inject(ToastSlot) };
};

describe('ReceiptToast (Slice 74)', () => {
  it('retains the receipt while the owed read settles and closes on a newer write', () => {
    const { toast, undo, ready } = setup();
    toast.show({ tone: 'status', message: 'Removed Notes.' }, report);
    expect(toast.offer()).toBe('saving');
    ready.set('ready');
    expect(toast.offer()).toBe('ready');
    undo.writeSequence.set(1);
    TestBed.tick();
    expect(toast.state()).toBeNull();
  });

  it('morphs the acting toast after Undo, preserves result lines and removes Undo', async () => {
    const { toast, undo, ready } = setup();
    ready.set('ready');
    toast.show({ tone: 'status', message: 'Removed Notes.' }, report);
    await toast.undo();
    expect(undo.undo).toHaveBeenCalledExactlyOnceWith(report);
    expect(toast.state()?.message).toBe('Undone: Removed Notes.');
    expect(toast.offer()).toBe('unavailable');
  });

  it('does not let a late Undo morph a newer toast', async () => {
    const { toast, undo, ready } = setup();
    ready.set('ready');
    let resolve!: (value: { tone: 'status'; message: string }) => void;
    undo.undo.mockImplementation(() => new Promise(done => { resolve = done; }));
    toast.show({ tone: 'status', message: 'Removed Notes.' }, report);
    const pending = toast.undo();
    toast.show({ tone: 'status', message: 'A newer confirmation.' });
    resolve({ tone: 'status', message: 'Undone.' });
    await pending;
    expect(toast.state()?.message).toBe('A newer confirmation.');
  });

  it('closes on reload and releases its slot without closing a replacement', () => {
    const { toast, undo, slot } = setup();
    toast.show({ tone: 'status', message: 'Removed Notes.' }, report);
    undo.generation.set(1);
    TestBed.tick();
    expect(toast.state()).toBeNull();
    const close = vi.fn();
    slot.claim(close);
    toast.close();
    expect(close).not.toHaveBeenCalled();
  });
});
