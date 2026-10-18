import { TestBed } from '@angular/core/testing';
import type { ProjectId } from '@cwm/contracts';
import { expect, it } from 'vitest';
import { RECEIPT_UNDO } from './receipt-undo';

it('offers nothing outside a project workspace', async () => {
  const undo = TestBed.inject(RECEIPT_UNDO);
  const report = { projectId: 'project-1' as ProjectId, receipt: null };
  expect(undo.offer(report)).toBe('unavailable');
  expect(await undo.undo(report)).toBeNull();
  expect(undo.writeSequence()).toBe(0);
  expect(undo.generation()).toBe(0);
});
