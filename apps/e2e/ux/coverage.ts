import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { MATRIX } from './matrix';

/** Every inventory row remains visible, even where selected screenshots are only a partial view. */
export async function inventoryCoverage() {
  const text = await readFile(fileURLToPath(new URL('../../../docs/roadmap/active/70-ui-ux-overhaul.md', import.meta.url)), 'utf8');
  return text.split('\n').filter(line => /^\|\s*\[ \]/.test(line)).map((line,index)=>{
    const columns=line.split('|').slice(1,-1).map(v=>v.trim());
    return { id:`S${String(index+1).padStart(2,'0')}`, surface:columns[1], source:columns[2], targetStates:columns[3],
      status:'not-individually-verified',
      states: columns[3]?.split(';').map((target,n)=>({ id:`S${String(index+1).padStart(2,'0')}.${n+1}`, target:target.trim(), status:'not-individually-verified' })),
      evidenceScope:'Selected matrix cells capture composite pages. A route screenshot does not prove every contained state is visible; state-by-state audit still required.',
      selectedMatrixIndex:'index.json',
    };
  });
}
/** Axis omissions and duplicate names would silently lose baseline evidence. */
export function validateMatrix(cells = MATRIX): void {
  if(new Set(cells.map(c=>c.id)).size!==cells.length)throw new Error('Duplicate capture id');
  for(const seed of ['empty','personal-workspace','busy-week','nested-projects','overdue-chaos','agent-heavy']) if(!cells.some(c=>c.seed===seed))throw new Error(`Missing seed ${seed}`);
  for(const theme of ['dark','light']) if(!cells.some(c=>c.theme===theme))throw new Error(`Missing theme ${theme}`);
  for(const width of [1440,1024,375]) if(!cells.some(c=>c.viewport.width===width))throw new Error(`Missing viewport ${width}`);
}

