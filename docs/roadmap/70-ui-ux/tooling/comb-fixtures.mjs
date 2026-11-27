// Small fixtures for comb.test.mjs (Slice 82, step 0a). `goodFiles()` is one complete, consistent
// comb-82 folder in miniature; `badFiles[check]` breaks exactly one file of it so that one check
// is seen rejecting it. Paths are relative to the comb folder; `gate1/reproduction.json` stands in
// for the Gate 1 verdicts (`docs/roadmap/70-ui-ux/reproduction.json`) and `briefs/decisions.md`
// for the stripped decision list. Disposable, like the rest of the comb tooling.

const TASKS = Array.from({ length: 12 }, (_, i) => `T${String(i + 1).padStart(2, '0')}`);

const finding = (id, auditor, extra = {}) => ({
  id, auditor, surface: 'Project page › section frame', inventoryRow: 'Project workspace', seed: 'busy-week',
  theme: 'light', viewport: '375x812', state: 'populated', persona: 'user-demo',
  evidence: ['ux-output/walk/w2/001-kitchen.png'], repro: ['1. seed busy-week', '2. open /projects/project-launch'],
  expected: 'The section title reads at a glance.', actual: 'The title wraps under the menu.',
  lens: 'task:T03', heuristic: 'Nielsen #4 Consistency and standards', severity: 'S2', confidence: 'observed',
  decisionReopened: null, ...extra,
});

const task = (id, persona) => ({
  task: id, persona, outcome: 'completed', clicks: 3, keystrokes: 0, surfaces: ['Dashboard'], deadEnds: 0,
  firstCorrectActionFoundImmediately: true, discoverability: 'The action is the first thing in view.', steps: [],
});

const walkthrough = (auditor, inputMode, viewport, personas, equiv = false) => ({
  auditor, inputMode, viewport, theme: 'light', personas, notes: '',
  tasks: personas.flatMap(p => TASKS.map(t => task(equiv ? `${t}-equiv` : t, p))),
});

const combItem = n => ({ item: n, status: n === 2 ? 'open' : 'closed', note: `item ${n} at C82`, record: n === 2 ? 'C82-CL-02' : null });

export function goodFiles() {
  return {
    'briefs/decisions.md': '# Decisions\n\n- Section chrome is quiet at rest on every device — `docs/decisions/2026-10-section-chrome-is-quiet-at-rest.md`\n',
    'gate1/reproduction.json': {
      method: 'fixture', verdicts: {
        'W1-001': { status: 'reproduced', severity: 'S1' },
        'L2-003': { status: 'reproduced-partly', severity: 'S2' },
        'L3-004': { status: 'not-reproduced', severity: 'S3' },
      },
    },
    'findings/w2.json': {
      auditor: 'w2', attestation: 'I read only my brief files, the shared brief files and the permitted rig files.',
      findings: [finding('C82-W2-001', 'w2'), finding('C82-W2-002', 'w2', { severity: 'S3', lens: 'copy', decisionReopened: 'Section chrome is quiet at rest on every device' })],
    },
    'findings/l5.json': {
      auditor: 'l5', attestation: 'I read only my brief files and the C82 captures.',
      contrastTable: [
        { element: 'Body text', theme: 'light', fg: '#111111', bg: '#ffffff', ratio: 18.9, required: '4.5:1' },
        { element: 'Muted text', theme: 'dark', fg: '#777777', bg: '#222222', ratio: 3.1, required: '4.5:1' },
      ],
      findings: [finding('C82-L5-001', 'l5', { lens: 'accessibility', severity: 'S1', viewport: '1440x900' })],
    },
    'walkthroughs/w2.json': walkthrough('w2', 'touch', '375x812', ['user-demo']),
    'walkthroughs/w4.json': walkthrough('w4', 'mouse', '1440x900', ['user-alex'], true),
    'reproduction.json': {
      method: 'fixture', verdicts: {
        'C82-W2-001': { status: 'reproduced', severity: 'S2', classification: 'still-open', matches: 'L2-003' },
        'C82-W2-002': { status: 'not-reproduced', severity: 'S3' },
        'C82-L5-001': { status: 'reproduced-partly', severity: 'S1', note: 'only in dark', classification: 'regression', matches: 'W1-001' },
      },
    },
    'ledger.json': {
      entries: [
        { id: 'W1-001', status: 'closed', basis: 'outcome', source: 'docs/roadmap/completed/81-one-navigation-tree.md:1870' },
        { id: 'L2-003', status: 'open-unrouted', theme: 'TH03', source: 'docs/roadmap/70-ui-ux/themes.json (TH03; no record names it)' },
      ],
    },
    'comb-list.json': {
      items: Array.from({ length: 22 }, (_, i) => combItem(i + 1)),
      records: [finding('C82-CL-02', 'orchestrator', { lens: 'copy', severity: 'S3' })],
    },
    'themes.json': {
      themes: Array.from({ length: 15 }, (_, i) => {
        const id = `TH${String(i + 1).padStart(2, '0')}`;
        return { id, title: `Theme ${i + 1}`, status: 'open', priority: i + 1, openGate1Ids: id === 'TH03' ? ['L2-003'] : [], combIds: id === 'TH03' ? ['C82-W2-001'] : id === 'TH05' ? ['C82-L5-001'] : [] };
      }),
    },
    'core-tasks.json': {
      tasks: TASKS.map(id => ({ id, clicks: id === 'T08' ? 4 : 2, keystrokes: 0, deadEnds: id === 'T10' ? 1 : 0, baselineClicks: id === 'T11' || id === 'T12' ? null : 3, slice81Clicks: id === 'T08' ? 4 : 2 })),
    },
    'axe.json': {
      cells: 2, perTheme: {
        light: { cells: 1, serious: 0, critical: 0, colorContrastIncomplete: 1 },
        dark: { cells: 1, serious: 1, critical: 0, colorContrastIncomplete: 1 },
      },
      cellsWithSeriousOrCritical: ['busy-week-dashboard-dark-1440'], colorContrastIncomplete: 2,
    },
    // tally.json is added by the test from computeTally(), so the good set stays consistent by construction.
  };
}

/**
 * Each check's bad files: one change each, and the error message that change must produce, so a
 * check is seen rejecting a file for its own reason and every sub-rule is exercised.
 */
export const badFiles = {
  'findings-format': [
    { break: f => { delete f['findings/w2.json'].findings[0].heuristic; }, expect: /missing heuristic/ },
    { break: f => { f['findings/w2.json'].findings[0].evidence = []; }, expect: /evidence must be a non-empty list/ },
    { break: f => { f['findings/l5.json'].auditor = 'l4'; }, expect: /file auditor l4 is not l5/ },
  ],
  'findings-id': [{ break: f => { f['findings/w2.json'].findings[0].id = 'W2-001'; }, expect: /id should match/ }],
  'findings-severity': [{ break: f => { f['findings/w2.json'].findings[0].severity = 'S4'; }, expect: /severity S4/ }],
  'findings-lens': [
    { break: f => { f['findings/w2.json'].findings[0].lens = 'vibes'; }, expect: /lens vibes/ },
    { break: f => { f['findings/w2.json'].findings[0].lens = 'task:T13'; }, expect: /lens task:T13/ },
  ],
  'findings-no-fix': [{ break: f => { f['findings/l5.json'].findings[0].suggestion = 'Make the text darker.'; }, expect: /suggestion proposes a fix/ }],
  'decision-reopened': [
    { break: f => { f['findings/w2.json'].findings[1].decisionReopened = 'A decision nobody wrote'; }, expect: /is not a title or path/ },
    { break: f => { f['findings/w2.json'].findings[1].decisionReopened = 'Section chrome'; }, expect: /is not a title or path/ },
  ],
  'attestation': [{ break: f => { f['findings/l5.json'].attestation = ' '; }, expect: /empty attestation/ }],
  'contrast-table': [{ break: f => { f['findings/l5.json'].contrastTable = f['findings/l5.json'].contrastTable.filter(r => r.theme === 'light'); }, expect: /no dark rows/ }],
  'unique-ids': [{ break: f => { f['findings/w2.json'].findings[1].id = 'C82-W2-001'; }, expect: /C82-W2-001: filed in w2 and w2/ }],
  'verdicts': [
    { break: f => { delete f['reproduction.json'].verdicts['C82-W2-002']; }, expect: /C82-W2-002: filed but has no verdict/ },
    { break: f => { f['reproduction.json'].verdicts['C82-W9-001'] = { status: 'reproduced', severity: 'S3' }; }, expect: /C82-W9-001: has a verdict but was never filed/ },
  ],
  'verdict-status': [
    { break: f => { f['reproduction.json'].verdicts['C82-W2-002'].status = 'maybe'; }, expect: /status maybe/ },
    { break: f => { delete f['reproduction.json'].verdicts['C82-L5-001'].note; }, expect: /reproduced-partly needs a note/ },
    { break: f => { f['reproduction.json'].verdicts['C82-W2-002'].severity = 's2'; }, expect: /verdict severity s2/ },
  ],
  'classification': [
    { break: f => { delete f['reproduction.json'].verdicts['C82-W2-001'].matches; }, expect: /must name a Gate 1 id/ },
    { break: f => { f['reproduction.json'].verdicts['C82-W2-001'].classification = 'old'; }, expect: /classification old/ },
  ],
  'classification-ledger': [{ break: f => { f['reproduction.json'].verdicts['C82-L5-001'].classification = 'still-open'; }, expect: /still-open matches W1-001, which the ledger marks closed/ }],
  'ledger-vocabulary': [
    { break: f => { f['ledger.json'].entries[1].status = 'kinda-open'; }, expect: /ledger status kinda-open/ },
    { break: f => { f['ledger.json'].entries[0].basis = 'table'; }, expect: /must rest on a record's Outcome/ },
    { break: f => { f['ledger.json'].entries[0].source = 'docs/roadmap/completed/81-one-navigation-tree.md:10'; }, expect: /is not inside the record's Outcome/ },
    { break: f => { Object.assign(f['ledger.json'].entries[0], { basis: 'answer', source: 'docs/roadmap/completed/81-one-navigation-tree.md:1870' }); }, expect: /is not an answer line/ },
  ],
  'ledger-complete': [{ break: f => { f['ledger.json'].entries.pop(); }, expect: /L2-003: appears 0 times/ }],
  'themes': [
    { break: f => { f['themes.json'].themes[2].combIds.push('C82-W2-002'); }, expect: /C82-W2-002 is not an admitted comb id/ },
    { break: f => { f['themes.json'].themes[4].combIds.push('C82-W2-001'); }, expect: /C82-W2-001: in 2 themes/ },
    { break: f => { f['themes.json'].themes[2].openGate1Ids = []; }, expect: /L2-003: open in the ledger but in 0 themes/ },
  ],
  'comb-list': [
    { break: f => { f['comb-list.json'].items.pop(); }, expect: /comb item 22: 0 entries/ },
    { break: f => { f['comb-list.json'].records = []; }, expect: /comb item 2: open but no C82-CL-02 record/ },
  ],
  'tally': [
    { break: f => { f['tally.json'].openS1.comb = []; }, expect: /openS1 differs/ },
    { break: f => { delete f['tally.json']; }, expect: /tally.json does not/ },
  ],
  'walkthroughs': [
    { break: f => { f['walkthroughs/w2.json'].inputMode = 'mouse'; }, expect: /w2: must be viewport 375x812 with inputMode touch/ },
    { break: f => { f['walkthroughs/w4.json'].tasks.pop(); }, expect: /user-alex has 0 runs of T12/ },
    { break: f => { f['walkthroughs/w3.json'] = { ...f['walkthroughs/w2.json'], auditor: 'w3', viewport: '1440x900', inputMode: 'mouse' }; }, expect: /w3: must be inputMode keyboard/ },
  ],
  'tally-criteria': [
    { break: f => { delete f['tally.json'].contrastIncomplete; }, expect: /no contrastIncomplete line/ },
    { break: f => { f['tally.json'].axe = null; }, expect: /no axe line/ },
  ],
};
