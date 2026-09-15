import { TestBed } from '@angular/core/testing';
import type { SectionId, UndoReceipt, UndoRecordId } from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { FailedSectionRemoval, SectionUndoNoticeState } from './project-page-store';
import { SectionUndoNotice } from './section-undo-notice';

const receipt: UndoReceipt = {
  undoId: 'undo-section-a' as UndoRecordId,
  operation: 'section.remove',
  sequence: 1,
  label: 'Removed Notes',
  createdAt: '2026-09-14T09:00:00.000Z',
  expiresAt: '2026-09-15T09:00:00.000Z',
};

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

  it('renders typed conflict steps and current titles without interpreting the message', () => {
    const state: SectionUndoNoticeState = {
      kind: 'refusal',
      receipt,
      message: 'undo_conflict: server supplied this sentence',
      refusal: {
        reason: 'undo_conflict',
        undoId: receipt.undoId,
        conflicts: [{
          entityType: 'task',
          id: 'task-a',
          title: 'Ship launch',
          problem: 'moved',
          nextStep: 'move-back-and-retry',
        }],
      },
    };
    const fixture = render(state);

    expect(fixture.nativeElement.querySelector('[data-undo-conflict]')?.textContent).toContain('Ship launch [task-a]');
    expect(fixture.nativeElement.querySelector('[data-undo-next-step]')?.textContent).toContain('Move it back');
    expect(fixture.nativeElement.querySelector('[data-open-archive]')?.textContent).toContain('Archive');
    expect(fixture.nativeElement.textContent).toContain(state.message);
  });

  it('does not offer Archive for an edit receipt', () => {
    const editReceipt: UndoReceipt = {
      ...receipt,
      operation: 'section.update',
      label: 'Updated Notes',
    };
    const fixture = render({ kind: 'available', receipt: editReceipt, message: 'Section updated. Undo is available.' });

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
    const failed: FailedSectionRemoval = {
      sectionId: 'section-b' as SectionId,
      input: { policy: 'cascade' },
      message: 'Could not reach the host',
    };
    const fixture = render({ kind: 'available', receipt, message: 'Section removed.' }, failed);
    const retry = vi.fn();
    fixture.componentInstance.retryRemove.subscribe(retry);
    fixture.nativeElement.querySelector('[data-retry-remove]')!.click();

    expect(fixture.nativeElement.querySelector('[data-removal-error]')?.textContent).toContain(failed.message);
    expect(retry).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.querySelector('[data-undo-action]')).not.toBeNull();
  });

  it('emits separate dismiss actions for the Undo receipt and failed removal', () => {
    const failed: FailedSectionRemoval = {
      sectionId: 'section-b' as SectionId,
      input: { policy: 'cascade' },
      message: 'Could not reach the host',
    };
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

  it('shows one repair line when one section both changed and was superseded', () => {
    const fixture = TestBed.createComponent(SectionUndoNotice);
    const conflict = { entityType: 'section' as const, id: 'section-a', title: 'Notes', nextStep: 'use-later-receipt' as const };
    fixture.componentRef.setInput('state', {
      kind: 'refusal',
      receipt: null,
      message: 'undo_conflict: refused',
      refusal: {
        reason: 'undo_conflict',
        undoId: 'undo-a',
        conflicts: [{ ...conflict, problem: 'field-changed' }, { ...conflict, problem: 'superseded' }],
      },
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('[data-undo-conflict]')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('[data-undo-next-step]')?.textContent).toContain('make the change again by hand');
  });
});

