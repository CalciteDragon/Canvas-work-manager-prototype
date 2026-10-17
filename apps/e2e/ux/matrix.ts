/** Slice 70's selected matrix: axes are complete, combinations are deliberate. */
export const SEED_NOW = '2026-08-24T16:00:00.000Z';
export const THEMES = ['dark', 'light'] as const;
export const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 375, height: 812 }] as const;
export const SEEDS = ['empty', 'personal-workspace', 'busy-week', 'nested-projects', 'overdue-chaos', 'agent-heavy'] as const;
export interface CaptureCell { id: string; seed: string; route: string; state: string; theme: 'dark' | 'light'; viewport: { width: number; height: number }; persona: string; }
const roots = ['','project-personal','project-launch','project-renovation','project-client-migration','project-work-manager'];
const surfaces: { id: string; seed: string; route: string; state: string; allWidths?: boolean }[] = SEEDS.flatMap((seed, i) => [
  { id: `${seed}-dashboard`, seed, route: '/app', state: seed === 'empty' ? 'empty' : 'populated', allWidths: true },
  ...(roots[i] ? [{ id: `${seed}-project`, seed, route: `/projects/${roots[i]}`, state: 'populated', allWidths: true }] : []),
]);
for (const kind of ['todos','reflections','archive']) surfaces.push({ id: kind, seed: 'nested-projects', route: `/projects/project-renovation/pages/${kind}`, state: 'populated', allWidths: true });
for (const route of ['/calendar','/search','/settings','/settings/agents','/settings/archived-projects','/prototype/design','/prototype/state','/not-a-route']) surfaces.push({ id: route.slice(1).replaceAll('/','-'), seed: 'agent-heavy', route, state: 'default' });
for (const state of ['more','page-settings','work-create','section-create','shortcut-picker','markdown-edit','task-drawer','collapsed','remove-feedback','refused','loading','error','archived','grid']) surfaces.push({ id: `kitchen-${state}`, seed: 'nested-projects', route: state === 'archived' ? '/projects/project-legacy' : '/projects/project-kitchen', state });
for (const state of ['dev-panel','new-project','phone-menu']) surfaces.push({ id: state, seed: 'nested-projects', route: '/app', state });
for (const state of ['project-details', 'archive-confirm']) surfaces.push({ id: `kitchen-${state}`, seed: 'nested-projects', route: '/projects/project-kitchen', state });
surfaces.push({ id: 'overdue-chaos-task-drawer', seed: 'overdue-chaos', route: '/projects/project-client-migration', state: 'task-drawer-scrolled' });
export const MATRIX: CaptureCell[] = surfaces.flatMap(s => THEMES.flatMap(theme =>
  (s.allWidths ? VIEWPORTS : s.state === 'phone-menu' ? [VIEWPORTS[2]] : [VIEWPORTS[0], VIEWPORTS[2]]).map(viewport => ({ ...s, id: `${s.id}-${theme}-${viewport.width}`, theme, viewport, persona: 'user-demo' }))));

/** These states require explicit targeted fixtures or a Storybook pass; never count as captured. */
export const COVERAGE_GAPS = [
  { surface: 'Storybook: 19 files', status: 'not-captured', reason: 'Component-state capture pending separate Storybook server; Design Lab is captured.' },
  { surface: 'rare races / lazy-import failure / stale-anchor / source permission / unsupported registry', status: 'not-captured', reason: 'Need controlled story or fault fixtures; ordinary seed routes do not establish these states.' },
  { surface: 'dragging and keyboard resize/move', status: 'not-captured', reason: 'Transient gesture frames need a dedicated action capture; ordinary screenshots are insufficient.' },
];
