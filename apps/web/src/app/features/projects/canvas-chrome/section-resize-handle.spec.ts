import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { SectionResizeHandle, type ResizeMeasurement } from './section-resize-handle';

const measurement: ResizeMeasurement = { trackWidth: 1200, columnGap: 12 };

const render = (edge: 'start' | 'end' = 'end') => {
  const fixture = TestBed.createComponent(SectionResizeHandle);
  fixture.componentRef.setInput('edge', edge);
  fixture.componentRef.setInput('mode', 'grid');
  fixture.componentRef.setInput('name', 'Notes');
  fixture.componentRef.setInput('columnSpan', 6);
  fixture.componentRef.setInput('measure', () => measurement);
  fixture.detectChanges();
  const button = fixture.nativeElement.querySelector('[data-resize-handle]') as HTMLButtonElement;
  Object.assign(button, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => true),
    releasePointerCapture: vi.fn(),
  });
  return { fixture, button, handle: fixture.componentInstance };
};

const pointer = (type: string, clientX: number, pointerId = 7): Event => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { clientX, pointerId, button: 0 });
  return event;
};

describe('SectionResizeHandle (§27)', () => {
  it('previews during a captured pointer drag and commits on release', () => {
    const { button, handle } = render();
    const previews: number[] = [];
    const commits: number[] = [];
    handle.preview.subscribe((span) => previews.push(span));
    handle.commit.subscribe((span) => commits.push(span));

    button.dispatchEvent(pointer('pointerdown', 300));
    button.dispatchEvent(pointer('pointermove', 520));
    button.dispatchEvent(pointer('pointerup', 520));

    expect(button.setPointerCapture).toHaveBeenCalledWith(7);
    expect(previews).toEqual([8]);
    expect(commits).toEqual([8]);
    expect(button.releasePointerCapture).toHaveBeenCalledWith(7);
  });

  it('Escape during a pointer drag cancels and commits nothing', () => {
    const { button, handle } = render('start');
    const commits: number[] = [];
    const cancelled = vi.fn();
    handle.commit.subscribe((span) => commits.push(span));
    handle.cancel.subscribe(cancelled);

    button.dispatchEvent(pointer('pointerdown', 300));
    button.dispatchEvent(pointer('pointermove', 520));
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(commits).toEqual([]);
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it('arrows and Home/End preview supported spans, while Enter and blur commit', () => {
    const { fixture, button, handle } = render();
    const previews: number[] = [];
    const commits: number[] = [];
    handle.preview.subscribe((span) => {
      previews.push(span);
      fixture.componentRef.setInput('columnSpan', span);
    });
    handle.commit.subscribe((span) => commits.push(span));

    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    button.dispatchEvent(new FocusEvent('blur', { bubbles: false }));

    expect(previews).toEqual([8, 4, 12, 8]);
    expect(commits).toEqual([12, 8]);
  });

  it('Escape cancels a keyboard preview without committing it', () => {
    const { button, handle } = render();
    const commits: number[] = [];
    const cancelled = vi.fn();
    handle.commit.subscribe((span) => commits.push(span));
    handle.cancel.subscribe(cancelled);

    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(commits).toEqual([]);
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it('keeps the start edge pointer-only and labels the keyboard end edge', () => {
    const start = render('start');
    const end = render('end');

    expect(start.button.tabIndex).toBe(-1);
    expect(start.button.getAttribute('aria-hidden')).toBe('true');
    expect(end.button.getAttribute('aria-label')).toBe('Resize Notes, 6 of 12 columns');
  });
});
