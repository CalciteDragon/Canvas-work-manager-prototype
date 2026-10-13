import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MATRIX } from './matrix';
import { inventoryCoverage, validateMatrix } from './coverage';

test('matrix validation rejects omissions and overwritten evidence', () => {
  assert.doesNotThrow(()=>validateMatrix());
  assert.throws(()=>validateMatrix(MATRIX.filter(c=>c.seed!=='empty')),/Missing seed/);
  assert.throws(()=>validateMatrix([...MATRIX,MATRIX[0]!] ),/Duplicate/);
});
test('coverage ledger retains every inventoried surface and all stated targets',async()=>{
  const rows=await inventoryCoverage();
  assert.ok(rows.length>=35);
  assert.ok(rows.every(r=>r.targetStates && r.source && r.status==='not-individually-verified'));
  assert.ok(rows.some(r=>r.surface?.includes('Storybook')));
});
