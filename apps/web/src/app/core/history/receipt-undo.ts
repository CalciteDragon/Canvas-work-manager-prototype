import { InjectionToken, signal, type Signal } from '@angular/core';
import type { ProjectId } from '@cwm/contracts';
import type { OperationWriteReport } from './operation-history-reporter';

/** Whether a committed receipt can currently be undone by its toast. */
export type ReceiptUndoOffer = 'saving' | 'ready' | 'unavailable';

/** Feedback returned to the acting toast, without announcing a second toast. */
export interface ReceiptUndoResult {
  tone: 'status' | 'alert';
  message: string;
  lines?: readonly string[];
  link?: { projectId: ProjectId; label: string };
}

/** The workspace's receipt-specific Undo port; features never import its implementation. */
export interface ReceiptUndo {
  readonly writeSequence: Signal<number>;
  readonly generation: Signal<number>;
  offer(report: OperationWriteReport): ReceiptUndoOffer;
  undo(report: OperationWriteReport): Promise<ReceiptUndoResult | null>;
}

/** Outside a workspace there is no receipt Undo, including isolated stories and the Lab. */
export const inertReceiptUndo = (): ReceiptUndo => ({
  writeSequence: signal(0).asReadonly(),
  generation: signal(0).asReadonly(),
  offer: () => 'unavailable',
  undo: async () => null,
});

export const RECEIPT_UNDO = new InjectionToken<ReceiptUndo>('RECEIPT_UNDO', {
  providedIn: 'root', factory: inertReceiptUndo,
});
