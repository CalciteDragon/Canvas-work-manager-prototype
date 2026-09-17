import { TestBed } from '@angular/core/testing';
import type { OperationActionId, OperationHistoryId, OperationHistorySummary, OperationReceipt, ProjectId, SectionId } from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { FailedSectionRemoval, SectionUndoNoticeState } from './project-page-store';
import { SectionUndoNotice } from './section-undo-notice';

const receipt: OperationReceipt = {
  historyId: 'history-a' as OperationHistoryId,
  actionId: 'operation-section-a' as OperationActionId,
  operation: 'section.remove',
  revision: 1,
  label: 'Removed Notes',
  createdAt: '2026-09-14T09:00:00.000Z',
  expiresAt: '2026-09-15T09:00:00.000Z',
};

const summary: OperationHistorySummary = {
  projectId: 'project-a' as ProjectId,
  historyId: receipt.historyId,
  revision: 1,
  undo: { actionId: receipt.actionId, operation: 'section.remove', label: receipt.label, expiresAt: receipt.expiresAt },
  redo: null,
  blockedBy: null,
};

const refusalBase = { historyId: receipt.historyId, actionId: receipt.actionId, summary };

const render = (state: SectionUndoNoticeState, failedRemoval: FailedSectionRemoval | null = null, busy = false) => {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(SectionUndoNotice);
  fixture.componentRef.setInput('state', state);
  fixture.componentRef.setInput('failedRemoval', failedRemoval);
  fixture.componentRef.setInput('busy', busy);
  fixture.detectChanges();
  return fixture;
};

describe('SectionUndoNotice', () => {
  it('announces the receipt lifetime as server data and offers Undo and Archive', () => {
    const state: SectionUndoNoticeState = {
      kind: 'available',
      receipt,
      message: 'Section removed. Undo is available on this page.',
    };
    const fixture = render(state);
    const undo = vi.fn();
    const archive = vi.fn();
    fixture.componentInstance.undo.subscribe(undo);
    fixture.componentInstance.openArchive.subscribe(archive);

    expect(fixture.nativeElement.querySelector('[role="status"]')?.textContent).toContain(state.message);
    expect(fixture.nativeElement.textContent).toContain(receipt.expiresAt);
    fixture.nativeElement.querySelector('[data-undo-action]')!.click();
    fixture.nativeElement.querySelector('[data-open-archive]')!.click();

    expect(undo).toHaveBeenCalledOnce();
    expect(archive).toHaveBeenCalledOnce();
  });

  it('withdraws Archive when the removal said it listed nothing there', () => {
    // note-2026-09-15-006: a section kept only because a Home shortcut names it is stored but
    // not listed, so the route would land on a page with no entry for it.
    const unlisted = render({
      kind: 'available',
      receipt,
      message: 'Section removed. Undo is available on this page.',
      archiveListed: false,
    });
    expect(unlisted.nativeElement.querySelector('[data-open-archive]')).toBeNull();
    expect(unlisted.nativeElement.querySelector('[data-undo-action]')).not.toBeNull();

    // An unknown verdict is not a `false` one: a receipt recovered from a repeat removal has none.
    const unknown = render({ kind: 'available', receipt, message: 'Already removed. Undo is available.' });
    expect(unknown.nativeElement.querySelector('[data-open-archive]')).not.toBeNull();
  });

  it('tells the person to make a change someone else overwrote again by hand, never to hunt for a receipt', () => {
    const fixture = render({
      kind: 'refusal',
      receipt: { ...receipt, operation: 'section.update' },
      message: 'history_conflict: server supplied this sentence',
      refusal: {
        reason: 'history_conflict',
        ...refusalBase,
        conflicts: [{ entityType: 'section', id: 'section-tasks' as SectionId, title: 'Task List', problem: 'field-changed', nextStep: 'change-by-hand' }],
      },
    });

    expect(fixture.nativeElement.querySelector('[data-undo-next-step]')?.textContent).toContain('Make the change again by hand');
    expect(fixture.nativeElement.textContent).not.toContain('receipt');
    expect(fixture.nativeElement.querySelector('[data-undo-superseded-by]')).toBeNull();
  });

  it('renders typed conflict steps and current titles without interpreting the message', () => {
    const state: SectionUndoNoticeState = {
      kind: 'refusal',
      receipt,
      message: 'history_conflict: server supplied this sentence',
      refusal: {
        reason: 'history_conflict',
        ...refusalBase,
        conflicts: [{ entityType: 'task', id: 'task-a', title: 'Ship launch', problem: 'moved', nextStep: 'move-back-and-retry' }],
      },
    };
    const fixture = render(state);

    expect(fixture.nativeElement.querySelector('[data-undo-conflict]')?.textContent).toContain('Ship launch [task-a]');
    expect(fixture.nativeElement.querySelector('[data-undo-next-step]')?.textContent).toContain('Move it back');
    expect(fixture.nativeElement.querySelector('[data-open-archive]')?.textContent).toContain('Archive');
    expect(fixture.nativeElement.textContent).toContain(state.message);
  });

  it('shows one repair line when one entity conflicts twice on the same repair', () => {
    const conflict = { entityType: 'section' as const, id: 'section-a', title: 'Notes', nextStep: 'change-by-hand-or-archive' as const };
    const fixture = render({
      kind: 'refusal',
      receipt,
      message: 'history_conflict: refused',
      refusal: { reason: 'history_conflict', ...refusalBase, conflicts: [{ ...conflict, problem: 'field-changed' }, { ...conflict, problem: 'archived-subject' }] },
    });

    expect(fixture.nativeElement.querySelectorAll('[data-undo-conflict]')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('[data-undo-next-step]')?.textContent).toContain('check Archive');
  });

  it.each([
    ['history_not_next', { reason: 'history_not_next' as const, ...refusalBase }, 'A newer change has to be undone first'],
    ['history_blocked', { reason: 'history_blocked' as const, ...refusalBase, blockingProjectId: 'project-kitchen' as ProjectId, blockingProjectTitle: 'Kitchen' }, 'while Kitchen is archived'],
    ['history_unavailable', { reason: 'history_unavailable' as const, ...refusalBase, problem: 'no-compatible-page' as const }, 'No page can currently receive this section'],
  ])('gives typed guidance for a repairable %s refusal and keeps Undo available', (_, refusal, guidance) => {
    const fixture = render({ kind: 'refusal', receipt, message: `${refusal.reason}: refused`, refusal });
    const undo = vi.fn();
    fixture.componentInstance.undo.subscribe(undo);

    expect(fixture.nativeElement.querySelector('[data-undo-typed-guidance]')?.textContent).toContain(guidance);
    const button = fixture.nativeElement.querySelector('[data-undo-action]') as HTMLButtonElement;
    expect(button.getAttribute('aria-disabled')).toBe('false');
    button.click();
    expect(undo).toHaveBeenCalledOnce();
  });

  it('does not offer Archive for an edit receipt', () => {
    const fixture = render({ kind: 'available', receipt: { ...receipt, operation: 'section.update', label: 'Updated Notes' }, message: 'Section updated. Undo is available.' });

    expect(fixture.nativeElement.querySelector('[data-undo-action]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-open-archive]')).toBeNull();
  });

  it('keeps pending actions focusable and guards duplicate activation', () => {
    const fixture = render({ kind: 'available', receipt, message: 'Section removed.' }, null, true);
    const undo = vi.fn();
    fixture.componentInstance.undo.subscribe(undo);
    const button = fixture.nativeElement.querySelector('[data-undo-action]') as HTMLButtonElement;

    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    button.click();
    expect(undo).not.toHaveBeenCalled();
  });

  it('shows a failed removal retry separately from an earlier Undo receipt', () => {
    const failed: FailedSectionRemoval = { sectionId: 'section-b' as SectionId, input: { policy: 'cascade' }, message: 'Could not reach the host' };
    const fixture = render({ kind: 'available', receipt, message: 'Section removed.' }, failed);
    const retry = vi.fn();
    fixture.componentInstance.retryRemove.subscribe(retry);
    fixture.nativeElement.querySelector('[data-retry-remove]')!.click();

    expect(fixture.nativeElement.querySelector('[data-removal-error]')?.textContent).toContain(failed.message);
    expect(retry).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.querySelector('[data-undo-action]')).not.toBeNull();
  });

  it('emits separate dismiss actions for the Undo receipt and failed removal', () => {
    const failed: FailedSectionRemoval = { sectionId: 'section-b' as SectionId, input: { policy: 'cascade' }, message: 'Could not reach the host' };
    const fixture = render({ kind: 'available', receipt, message: 'Section removed.' }, failed);
    const dismissUndo = vi.fn();
    const dismissFailure = vi.fn();
    fixture.componentInstance.dismissUndo.subscribe(dismissUndo);
    fixture.componentInstance.dismissFailure.subscribe(dismissFailure);

    fixture.nativeElement.querySelector('[data-dismiss-undo-notice]')!.click();
    fixture.nativeElement.querySelector('[data-dismiss-removal-error]')!.click();

    expect(dismissUndo).toHaveBeenCalledOnce();
    expect(dismissFailure).toHaveBeenCalledOnce();
  });

  it('keeps Undo enabled after a conflict over something missing, because the server retires what can never succeed', () => {
    const fixture = render({
      kind: 'refusal',
      receipt: { ...receipt, operation: 'section.update' },
      message: 'history_conflict: refused',
      refusal: { reason: 'history_conflict', ...refusalBase, conflicts: [{ entityType: 'section', id: 'section-a', problem: 'missing', nextStep: 'nothing-to-undo' }] },
    });
    const undo = vi.fn();
    fixture.componentInstance.undo.subscribe(undo);

    const button = fixture.nativeElement.querySelector('[data-undo-action]') as HTMLButtonElement;
    expect(button.getAttribute('aria-disabled')).toBe('false');
    expect(button.hasAttribute('aria-describedby')).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-undo-refused-for-good]')).toBeNull();
    button.click();
    expect(undo).toHaveBeenCalledOnce();
  });
});
