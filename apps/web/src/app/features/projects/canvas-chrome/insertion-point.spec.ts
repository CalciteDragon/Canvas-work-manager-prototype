import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { InsertionPoint } from './insertion-point';

const render = (
  kind: 'before' | 'end' | 'gap',
  beforeId: string | null,
  columnSpan = 12,
  label = 'Add section',
) => {
  const fixture = TestBed.createComponent(InsertionPoint);
  fixture.componentRef.setInput('kind', kind);
  fixture.componentRef.setInput('beforeId', beforeId);
  fixture.componentRef.setInput('columnSpan', columnSpan);
  fixture.componentRef.setInput('label', label);
  fixture.detectChanges();
  return fixture;
};

describe('InsertionPoint (§27)', () => {
  it('makes the entire painted mark a descendant of its button', () => {
    const fixture = render('before', 'section-a');
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.contains(fixture.nativeElement.querySelector('app-icon'))).toBe(true);
    // Actual rest/active boxes and all nine hit points are proved in section-chrome.spec.ts;
    // jsdom has no layout engine.
  });

  it('refuses selection while sorting even when called programmatically', () => {
    const fixture = render('before', 'section-a');
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    const seen: unknown[] = [];
    fixture.componentInstance.selected.subscribe(intent => seen.push(intent));
    fixture.componentInstance.select();
    expect(seen).toEqual([]);
    expect(fixture.nativeElement.querySelector('button').disabled).toBe(true);
  });

  it('labels before, end, and grid-gap targets and emits the stable anchor intent', () => {
    const before = render('before', 'shortcut-a', 12, 'Add section before Weekly notes');
    const end = render('end', null, 12, 'Add section at the end');
    const gap = render('gap', 'section-a', 4, 'Add section in the grid gap');
    const seen: unknown[] = [];
    gap.componentInstance.selected.subscribe((intent) => seen.push(intent));

    expect(before.nativeElement.querySelector('button')?.getAttribute('aria-label')).toBe(
      'Add section before Weekly notes',
    );
    expect(end.nativeElement.querySelector('button')?.getAttribute('aria-label')).toBe(
      'Add section at the end',
    );
    expect(gap.nativeElement.querySelector('button')?.getAttribute('aria-label')).toBe(
      'Add section in the grid gap',
    );
    gap.nativeElement.querySelector('button')?.click();

    expect(seen).toEqual([{ kind: 'gap', beforeId: 'section-a', columnSpan: 4 }]);
  });

  it('uses a null anchor for end insertion and marks each visual variant', () => {
    const end = render('end', null, 12, 'Add section at the end');
    const before = render('before', 'section-b', 8, 'Add section before Backlog');

    expect(end.nativeElement.matches('[data-insertion-point="end"]')).toBe(true);
    expect(before.nativeElement.matches('[data-insertion-point="before"]')).toBe(true);
    const seen: unknown[] = [];
    end.componentInstance.selected.subscribe((intent) => seen.push(intent));
    end.nativeElement.querySelector('button')?.click();
    expect(seen).toEqual([{ kind: 'end', beforeId: null, columnSpan: 12 }]);
  });
});
