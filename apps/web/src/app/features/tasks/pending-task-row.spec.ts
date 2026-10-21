import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { PendingTaskRow } from './pending-task-row';

const render = async (title = 'Order tiles') => {
  TestBed.configureTestingModule({ imports: [PendingTaskRow] });
  const fixture = TestBed.createComponent(PendingTaskRow);
  fixture.componentRef.setInput('title', title);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
};

describe('PendingTaskRow', () => {
  it('shows the title being added as busy, in the task row shape', async () => {
    const element = await render();
    const row = element.querySelector<HTMLElement>('[data-task-pending]')!;
    expect(row.classList.contains('task-row')).toBe(true);
    expect(row.classList.contains('task-row--adding')).toBe(true);
    expect(row.getAttribute('aria-busy')).toBe('true');
    expect(row.textContent).toContain('Order tiles');
    expect(row.textContent).toContain('Adding…');
  });

  it('offers nothing to act on while the task does not exist yet', async () => {
    const element = await render();
    expect(element.querySelector('input, button, a, select, textarea')).toBeNull();
  });
});
