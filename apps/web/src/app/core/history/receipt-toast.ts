import { DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, untracked } from '@angular/core';
import { ToastSlot, type ToastCloseReason } from '../../shared/feedback/toast-slot';
import type { OperationWriteReport } from './operation-history-reporter';
import { RECEIPT_UNDO, type ReceiptUndoResult } from './receipt-undo';

/** A component's receipt feedback; its own template renders the presentational Toast. */
export class ReceiptToast {
  readonly slot = inject(ToastSlot);
  private readonly receiptUndo = inject(RECEIPT_UNDO);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef, { optional: true });
  private readonly injector = inject(Injector);
  readonly state = signal<ReceiptUndoResult | null>(null);
  readonly report = signal<OperationWriteReport | null>(null);
  readonly pendingUndo = signal(false);
  readonly offer = computed(() => {
    const report = this.report();
    return report === null ? 'unavailable' : this.receiptUndo.offer(report);
  });
  private release: (() => void) | null = null;
  private sequence = 0;
  private generation = 0;
  private version = 0;
  private fallback: (() => HTMLElement | null) | undefined;

  constructor() {
    effect(() => {
      const sequence = this.receiptUndo.writeSequence();
      const generation = this.receiptUndo.generation();
      if (this.state() !== null && (sequence !== this.sequence || generation !== this.generation)) {
        untracked(() => this.close('write'));
      }
    });
    inject(DestroyRef).onDestroy(() => { this.version++; this.release?.(); });
  }

  show(feedback: ReceiptUndoResult, report?: OperationWriteReport, fallback?: () => HTMLElement | null): void {
    this.release?.();
    this.release = this.slot.claim(reason => this.close(reason));
    this.version++;
    this.sequence = this.receiptUndo.writeSequence();
    this.generation = this.receiptUndo.generation();
    this.fallback = fallback;
    this.report.set(report ?? null);
    this.pendingUndo.set(false);
    this.state.set(feedback);
  }

  close(reason: ToastCloseReason = 'dismissed'): void {
    const focused = this.element()?.contains(document.activeElement) === true;
    this.version++;
    this.release?.(); this.release = null;
    this.state.set(null);
    this.report.set(null);
    this.pendingUndo.set(false);
    if (focused && reason !== 'navigation') {
      const fallback = this.fallback;
      afterNextRender(() => fallback?.()?.focus(), { injector: this.injector });
    }
  }

  /** Caller invokes this only after its vanished control's focus guard succeeds. */
  focusFirst(): void {
    this.element()?.querySelector<HTMLElement>('button:not([disabled]), a[href]')?.focus();
  }

  private element(): HTMLElement | null {
    return this.host?.nativeElement.querySelector<HTMLElement>(':scope > app-toast [data-toast]') ?? null;
  }

  async undo(afterUndo?: () => void): Promise<void> {
    const report = this.report();
    if (report === null || this.offer() !== 'ready' || this.pendingUndo()) return;
    const version = this.version;
    const originalFocus = document.activeElement;
    const startedInside = this.element()?.contains(originalFocus) === true;
    this.pendingUndo.set(true);
    const result = await this.receiptUndo.undo(report);
    if (version !== this.version) return;
    this.pendingUndo.set(false);
    if (result === null) return;
    const focused = startedInside && (document.activeElement === document.body || document.activeElement === originalFocus || this.element()?.contains(document.activeElement) === true);
    this.report.set(null);
    this.state.set(result);
    afterNextRender(() => {
      if (version !== this.version) return;
      if (focused && (document.activeElement === document.body || this.element()?.contains(document.activeElement))) {
        this.element()?.querySelector<HTMLElement>('[data-toast-dismiss]')?.focus();
        if (result.tone === 'status') afterUndo?.();
      }
    }, { injector: this.injector });
  }
}
