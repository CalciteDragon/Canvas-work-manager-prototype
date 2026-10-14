// Fills the Gate 1 template from the tracked ledgers and writes the page into the repository.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const REPO = fileURLToPath(new URL('../../../../', import.meta.url));
const UX = `${REPO}/docs/roadmap/70-ui-ux`;
const here = new URL('.', import.meta.url);
const read = p => JSON.parse(readFileSync(p, 'utf8'));
const themes = read(`${UX}/themes.json`);
const repro = read(`${UX}/reproduction.json`);
const baseline = read(`${UX}/baseline.json`);
const evidenceImgs = read(new URL('evidence.json', here));

const walk = {};
for (const f of readdirSync(`${UX}/walkthroughs`)) { const j = read(`${UX}/walkthroughs/${f}`); walk[j.auditor] = j; }
const row = t => t && { o: t.outcome, c: t.clicks, k: typeof t.keystrokes === 'number' ? t.keystrokes : 'n/m', d: t.deadEnds };
const find = (aud, task, persona) => walk[aud]?.tasks.find(t => t.task === task && (!persona || t.persona === persona));
const tasks = baseline.tasks.map(b => ({
  id: b.id, title: b.title,
  base: { status: b.status, clicks: b.clicks, keystrokes: b.keystrokes },
  mouse: row(find('w1-demo-mouse', b.id)), touch: row(find('w2-touch-375', b.id)), keyboard: row(find('w3-keyboard', b.id)),
  alex: row(find('w4-personas', b.id, 'user-alex')), alexEquiv: row(find('w4-personas', b.id + '-equiv', 'user-alex')),
  sam: row(find('w4-personas', b.id, 'user-sam')), samEquiv: row(find('w4-personas', b.id + '-equiv', 'user-sam')),
}));
const admitted = themes.admitted, filed = repro.totals.filed;
const G1 = {
  totals: { filed, admitted, excluded: filed - admitted, s1: themes.admittedBySeverity.S1 ?? 0 },
  themes: themes.themes,
  tasks,
  evidence: [
    { ...evidenceImgs.hover, title: 'Hidden chrome, two trees, a dev banner.', caption: 'The insertion line appears only with the pointer in a 16 px gap; the work tree is drawn twice; "Flow layout" tooling tops the canvas (TH08, TH11, TH12).', alt: 'Kitchen workspace with hover-revealed insertion line, two navigation trees and a development banner' },
    { ...evidenceImgs.native, title: 'Browser-default controls.', caption: 'Progress, Reflections and Timeline use unstyled native buttons and fields beside app-styled ones (TH04).', alt: 'Progress, Reflections and Timeline sections with unstyled grey native controls' },
    { ...evidenceImgs.error, title: 'Error beside a false empty state.', caption: 'A failed read shows the raw message and "No tasks yet. Add the first one above." together; it stays after the cause clears (TH10).', alt: 'Task List section showing an audit error and an empty-state sentence together' },
    { ...evidenceImgs.archive375, title: '375 px squeeze.', caption: 'The header takes about 40% of the screen; the archive row breaks words mid-way (TH13).', alt: 'Archive page at phone width with a tall header and a broken archive row' },
    { ...evidenceImgs.forced, title: 'Forced colours.', caption: 'The progress bar vanishes and active states become indistinguishable (TH02).', alt: 'Kitchen workspace in forced colours with the progress bar missing' },
  ],
  principles: [
    { title: 'Three planes, one job each', body: 'Ground is an ambient backdrop that never carries text. Panes (top bar, navigation) are frosted and recede. Sheets hold content and stay AA-legible over any backing. Lifts (drawer, dialog, menu, toast) are the only things that float.', evidence: 'Every block is a bordered card about 1.05:1 against the page, and the drawer is a box inside a box (L1-019, L1-031, L5-006).' },
    { title: 'Separate by plane and space, not by line', body: 'No hairline borders around cards inside sheets; group with the spacing scale and one surface step. Borders only where a control needs a 3:1 boundary.', evidence: 'Input borders 1.3–1.6:1; ragged edges and uneven 25/50/17 px gaps (L5-006, L1-005, L1-008).' },
    { title: 'One primary action per surface', body: 'Commit looks committed; destructive actions are separated and say what they destroy; links look like links.', evidence: 'Create equals Cancel; Archive Workstream sits under Open Archive; only Task List has a filled button (L1-020, L2-006, W4-019).' },
    { title: 'State in shape and words, colour as reinforcement', body: 'Selection is a ring so overdue and complete marks survive it; the current place has an indicator bar; every state survives forced colours.', evidence: 'Active nav differs by 1.26:1; selection replaces the overdue tint; progress vanishes in forced colours (L5-008, W1-034, L5-017).' },
    { title: 'Chrome is quiet at rest, never absent', body: 'Section tools sit at low emphasis and rise on hover or focus; touch gets the same, not more; adding a section is always visible; headings name the section.', evidence: 'Insertion only in a 16 px gap; only the top of the plus is clickable; headings read "Rename X" (W1-017, W1-018, L6-009).', reopens: '2026-09-canvas-chrome-is-revealed-not-moded (at-rest emphasis only; reserved space and no-mode rule stand)' },
    { title: 'Answer where the user acted', body: 'New things scroll into view and take focus; confirmation and Undo sit beside the change; pending shows within 100 ms; failures name the row.', evidence: 'New section lands at y=872 of 900 with focus on body; "Undo is in the header"; no pending state (W1-024, W1-036, L3-007).', reopens: '2026-09-task-delete-recovery-feedback, 2026-09-one-step-section-removal-and-task-delete (feedback placement only)' },
    { title: 'Motion explains change, then gets out of the way', body: '120–240 ms, transform and opacity only, ease-out in and ease-in out; no layout animation of long lists; reduced motion becomes instant.', evidence: 'Nothing animates today, so content jumps 52 px as activity grows and collapse waits on the server (W1-030, L3-016).' },
    { title: 'One "you are here", in product words', body: 'One navigation hierarchy marks the current place; heading and document title agree; no ids, enums, slice or § numbers, or prototype tooling in product surfaces.', evidence: 'Tree drawn twice, sidebar never marks current, every route titled "Canvas Work Manager"; raw ids and § citations (L7-001, L7-002, L7-019, L6-004, L6-002).', reopens: '2026-09-where-the-project-navigation-column-lives' },
  ],
  altNotes: {
    a: 'Lowest risk. Frosted panes give the glass identity at the edges; sheets stay near-opaque so long canvases are cheap and AA holds over busy backing. Chrome sits at 45% at rest.',
    b: 'Most expressive. Ambient colour shows through translucent sheets, with larger radii and depth. At these tints it fails worst-case AA for muted text on every glass surface, and for body text on panes; reaching AA needs tints of 0.82 or more, which removes most of its look. It also costs one blur per visible section on long canvases, and its chrome hides until hover, which keeps today’s discoverability problem.',
    c: 'Calmest and cheapest. Opaque shell and sheets without card borders, separated by space; glass appears only on drawer, dialog, menu, toast and the header once scrolled. Least glass at rest.',
  },
  map: [
    ['TH01', 'Surfaces, spacing, alignment', ['Frosted panes, near-opaque borderless sheets, one surface step', 'Translucent sheets over tinted ground, depth by blur and shadow', 'Opaque borderless sheets separated by 28 px of space']],
    ['TH02', 'Colour alone carries state', ['Selection ring, indicator bar, pills with glyphs', 'Same cues; tints thinner over colour, so check contrast', 'Same cues on solid surfaces (simplest contrast)']],
    ['TH04', 'No shared control primitives', ['One button/field/tool set at 32 px, 36 px on touch', 'Same set with glass-tinted controls', 'Same set, solid controls']],
    ['TH05', 'No action hierarchy', ['Filled primary "Add section", ghost Undo, named Cancel/Create', 'Same', 'Same']],
    ['TH06', 'Overlays and focus', ['Drawer and dialog as frosted lifts over a light scrim', 'Same, stronger blur and shadow', 'The only frosted surfaces in the app']],
    ['TH08', 'Section chrome hidden yet heavy', ['Tools at 45% at rest, persistent "Add a section"', 'Tools hidden until hover (would keep today\u2019s problem)', 'Tools at 45% at rest, persistent "Add a section"']],
    ['TH11', 'Navigation and "you are here" (visual part)', ['One sidebar tree with an indicator bar; illustrative only, IA decided separately', 'Same', 'Same']],
    ['TH13', 'Narrow and touch layouts', ['Phone toggle: drawer becomes a bottom sheet, menu a lift', 'Same', 'Same']],
    ['TH07', 'Feedback detached from action', ['Motion study: inline undo toast, FLIP reflow, pending row, saved tick (shared by all three)', 'Same', 'Same']],
    ['TH03', 'Token set stops short', ['Tokens: plane tints and alphas, blur radii, lift elevation, durations, easings, focus ring, z-index, breakpoints (shared)', 'Same', 'Same']],
    ['TH09 · TH10 · TH12 · TH14 · TH15', 'Behaviour, copy and IA themes', ['No visual alternative: governed by principles 6 and 8 and the questions below', '—', '—']],
  ].map(([theme, title, cells]) => ({ theme, title, cells })),
  questions: [
    { q: 'Should connecting an agent become a product surface (Settings › AI & Agents) instead of the dev panel?', evidence: 'All 5 S1 findings: W1-052, W2-031, W3-020, W4-023, L7-015; T10 blocked for every persona and input mode.', reopens: '2026-08-agent-tokens-are-fixtures-not-records' },
    { q: 'Remove prototype scaffolding from product surfaces (Flow layout banner, § and slice citations, Calendar/Search placeholders in primary navigation)?', evidence: 'TH12: 22 findings across 8 auditors.', reopens: '—' },
    { q: 'One accent across both themes, or keep orange in dark and blue in light?', evidence: 'L2-012 and the mockups keep today\u2019s per-theme accents to isolate the glass change.', reopens: '§22 theme definition' },
    { q: 'Should the theme follow the device preference and persist across reloads?', evidence: 'W2-002: light-preference phone opens dark and resets on every reload.', reopens: '2026-08-theme-selection-is-session-only' },
    { q: 'One navigation tree instead of the global sidebar plus project column?', evidence: 'TH11: 33 findings; 45% of width at 1024 px; two phone navigation patterns.', reopens: '2026-09-where-the-project-navigation-column-lives, 2026-09-phone-navigation-drawer' },
    { q: 'Should Add workstream default to the open workstream, and should adding a task stop opening its drawer?', evidence: 'TH15: W1-008, W2-004, W3-010, W4-029; W1-026, W3-012, W2-009, W4-008.', reopens: '2026-09-project-navigation-gear-and-work-create' },
  ],
  limits: [
    `Reproduction: ${repro.totals.reproduced} reproduced and ${repro.totals['reproduced-partly']} partly reproduced (admitted with their limit); ${repro.totals['not-reproduced']} not reproduced, ${repro.totals['not-reached']} not reached, ${repro.totals.unverified} unverified, all excluded. Per-finding verdicts and methods are in reproduction.json.`,
    'Auditors and the orchestrator used isolated scratch hosts (ports 4320–4327) with their own data files and a static production build on 4201; the developer\u2019s live workspace and ports 4200/4310 were never used.',
    'Touch was emulated (hasTouch, isMobile) in headless Chromium; no real on-screen keyboard, so W2-034 stays unverified. Native date keystrokes are unmeasured.',
    'A rig defect meant delayed writes in pending-state probes went to an unused port after the delay; observations were taken during the delay, before any response, and are unaffected.',
    'Storybook variants, drag-in-progress frames and rare race or fault fixtures remain uncaptured, as recorded at Gate 0.',
    'Mockup contrast is a worst-case composite (surface over the darkest or lightest colour that can sit beneath it, including busy text), not a measurement of a built UI. Blur performance on long canvases and phones is reasoned from the layer budget, not profiled.',
    'The production build used for auditing exceeds its 850 kB initial-bundle warning budget by 171 kB (1.02 MB). This is the existing baseline; nothing in this slice changes product code.',
  ],
};
const tpl = readFileSync(new URL('gate1.template.html', here), 'utf8');
const html = tpl.replace('<!--DATA-->', `<script>window.G1 = ${JSON.stringify(G1).replace(/</g, '\\u003c')};</script>`);
mkdirSync(`${UX}/alternatives`, { recursive: true });
writeFileSync(`${UX}/alternatives/gate1.html`, html);
console.log('wrote', `${UX}/alternatives/gate1.html`, Math.round(html.length / 1024) + 'KB', JSON.stringify(G1.totals));
