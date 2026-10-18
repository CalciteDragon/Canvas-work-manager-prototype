import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { HistoryControlView } from './history-feedback';
import { ProjectHistoryControls } from './project-history-controls';

const render = async (undo: HistoryControlView, redo: HistoryControlView, retryAvailable = false) => {
  const fixture = TestBed.createComponent(ProjectHistoryControls);
  fixture.componentRef.setInput('undo', undo);
  fixture.componentRef.setInput('redo', redo);
  fixture.componentRef.setInput('retryAvailable', retryAvailable);
  fixture.detectChanges();
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    undoButton: element.querySelector<HTMLButtonElement>('[data-history-undo]')!,
    redoButton: element.querySelector<HTMLButtonElement>('[data-history-redo]')!,
    retry: element.querySelector<HTMLButtonElement>('[data-history-retry]'),
  };
};

describe('ProjectHistoryControls (Slice 41)', () => {
  it('names each state in the accessible name and the title alike', async () => {
    for (const name of [
      'Undo: Collapsed the Tasks shortcut', 'Nothing to undo', 'Loading history…', 'History unavailable', 'Undoing…',
      'Saving a change…', 'Undo unavailable while Legacy attic is archived',
    ]) {
      const { undoButton } = await render({ name, enabled: name.startsWith('Undo:') }, { name: 'Nothing to redo', enabled: false });
      expect(undoButton.getAttribute('aria-label')).toBe(name);
      expect(undoButton.getAttribute('title')).toBe(name);
    }
    for (const name of ['Redo: Renamed "A" to "B"', 'Nothing to redo', 'Redo unavailable while Legacy attic is archived']) {
      const { redoButton } = await render({ name: 'Nothing to undo', enabled: false }, { name, enabled: name.startsWith('Redo:') });
      expect(redoButton.getAttribute('aria-label')).toBe(name);
    }
  });

  it('marks an unavailable control aria-disabled, never disabled, keeps it in tab order, and swallows its click', async () => {
    const { fixture, undoButton, redoButton } = await render({ name: 'Nothing to undo', enabled: false }, { name: 'Redo: x', enabled: true });
    let undos = 0;
    let redos = 0;
    fixture.componentInstance.undoRequested.subscribe(() => (undos += 1));
    fixture.componentInstance.redoRequested.subscribe(() => (redos += 1));
    expect(undoButton.getAttribute('aria-disabled')).toBe('true');
    expect(undoButton.hasAttribute('disabled')).toBe(false);
    expect(undoButton.tabIndex).toBe(0);
    expect(redoButton.hasAttribute('aria-disabled')).toBe(false);
    undoButton.click();
    redoButton.click();
    expect(undos).toBe(0);
    expect(redos).toBe(1);
  });

  it('offers Retry only when the history could not be read', async () => {
    expect((await render({ name: 'Loading history…', enabled: false }, { name: 'Loading history…', enabled: false })).retry).toBeNull();
    const { fixture, retry } = await render({ name: 'History unavailable', enabled: false }, { name: 'History unavailable', enabled: false }, true);
    let retried = 0;
    fixture.componentInstance.retryRequested.subscribe(() => (retried += 1));
    retry!.click();
    expect(retried).toBe(1);
  });
});
