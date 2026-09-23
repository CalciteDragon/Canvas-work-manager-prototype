import { TestBed } from '@angular/core/testing';
import type { SectionId } from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { FailedSectionRemoval, SectionRecoveryNoticeState } from './project-page-store';
import { SectionRecoveryNotice } from './section-recovery-notice';

const render = (state: SectionRecoveryNoticeState | null, failedRemoval: FailedSectionRemoval | null = null, busy = false) => {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(SectionRecoveryNotice);
  fixture.componentRef.setInput('state', state);
  fixture.componentRef.setInput('failedRemoval', failedRemoval);
  fixture.componentRef.setInput('busy', busy);
  fixture.detectChanges();
  return fixture;
};

const removed: SectionRecoveryNoticeState = {
  message: 'Removed the Notes section. Undo is in the header.',
  removal: { archiveListed: true },
};

describe('SectionRecoveryNotice (Slice 41)', () => {
  it('points to the header for Undo and offers Open Archive, with no Undo control in any state', () => {
    const states: SectionRecoveryNoticeState[] = [
      removed,
      { ...removed, refreshFailed: true },
      { message: 'This section was already removed. Undo is in the header.', removal: {} },
      { message: 'Saved. Undo is in the header.', refreshFailed: true },
    ];
    for (const state of states) {
      const fixture = render(state, { sectionId: 'section-a' as SectionId, input: {}, message: 'Host unreachable' });
      expect(fixture.nativeElement.querySelector('[data-undo-action]')).toBeNull();
      expect(fixture.nativeElement.textContent).not.toMatch(/\bUndo\b(?! is in the header)/);
    }

    const fixture = render(removed);
    const archive = vi.fn();
    fixture.componentInstance.openArchive.subscribe(archive);
    expect(fixture.nativeElement.querySelector('[role="status"]')?.textContent).toBe(removed.message);
    fixture.nativeElement.querySelector('[data-open-archive]')!.click();
    expect(archive).toHaveBeenCalledOnce();
  });

  it('withdraws Archive when the removal said it listed nothing there, and keeps it for an unknown verdict', () => {
    // note-2026-09-15-006: a section kept only because a Home shortcut names it is stored but
    // not listed, so the route would land on a page with no entry for it.
    const unlisted = render({ message: 'Saved. Undo is in the header.', removal: { archiveListed: false }, refreshFailed: true });
    expect(unlisted.nativeElement.querySelector('[data-open-archive]')).toBeNull();
    // An unknown verdict is not a `false` one: a receipt recovered from a repeat removal has none.
    const unknown = render({ message: 'This section was already removed. Undo is in the header.', removal: {} });
    expect(unknown.nativeElement.querySelector('[data-open-archive]')).not.toBeNull();
    // A refresh-only notice is not about a removal at all.
    expect(render({ message: 'Saved. Undo is in the header.', refreshFailed: true }).nativeElement.querySelector('[data-open-archive]')).toBeNull();
  });

  it('offers a read-only Retry refresh after a committed write whose read failed', () => {
    const fixture = render({ message: 'Saved. Undo is in the header.', refreshFailed: true });
    const retry = vi.fn();
    fixture.componentInstance.retryRefresh.subscribe(retry);
    expect(fixture.nativeElement.querySelector('[data-recovery-refresh-error]')).not.toBeNull();
    fixture.nativeElement.querySelector('[data-retry-refresh]')!.click();
    expect(retry).toHaveBeenCalledOnce();
  });

  it('offers Retry remove after an uncertain removal, and swallows actions while busy', () => {
    const failure: FailedSectionRemoval = { sectionId: 'section-a' as SectionId, input: { policy: 'cascade' }, message: 'Host unreachable' };
    const fixture = render(null, failure, true);
    const retry = vi.fn();
    fixture.componentInstance.retryRemove.subscribe(retry);
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('Host unreachable');
    fixture.nativeElement.querySelector('[data-retry-remove]')!.click();
    expect(retry).not.toHaveBeenCalled();

    const idle = render(null, failure, false);
    idle.componentInstance.retryRemove.subscribe(retry);
    idle.nativeElement.querySelector('[data-retry-remove]')!.click();
    expect(retry).toHaveBeenCalledOnce();
  });
});
