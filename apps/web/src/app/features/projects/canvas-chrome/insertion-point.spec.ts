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

    expect(end.nativeElement.querySelector('[data-insertion-point="end"]')).not.toBeNull();
    expect(before.nativeElement.querySelector('[data-insertion-point="before"]')).not.toBeNull();
    const seen: unknown[] = [];
    end.componentInstance.selected.subscribe((intent) => seen.push(intent));
    end.nativeElement.querySelector('button')?.click();
    expect(seen).toEqual([{ kind: 'end', beforeId: null, columnSpan: 12 }]);
  });
});
