// Builds the Phase 1 reproduction ledger and Phase 2 theme map from the auditors' findings.
// Verdicts and theme membership are the orchestrator's own decisions, written out explicitly.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const all = [];
for (const f of readdirSync(`${ROOT}/findings`)) { const j = JSON.parse(readFileSync(`${ROOT}/findings/${f}`, 'utf8')); for (const x of (Array.isArray(j) ? j : j.findings)) all.push({ ...x, file: f }); }
const ids = new Set(all.map(x => x.id));
const list = s => s.trim().split(/\s+/);

// ── Reproduction verdicts. r1–r10 are orchestrator scripts run on a fresh seed on an isolated host. ──
const verdicts = {};
const mark = (status, method, idsText, note) => { for (const id of list(idsText)) { if (!ids.has(id)) throw new Error('unknown id ' + id); verdicts[id] = { status, method, ...(note ? { note } : {}) }; } };
// Live, by script fact or orchestrator screenshot.
mark('reproduced', 'live r1', 'L7-002 L7-004 W1-016 L7-019 W1-002 W3-008 W1-003 W1-004 W3-007 W2-001 W4-002 W1-006 W2-033 W3-009 L5-011 W4-026 W1-008 W2-004 W3-010 W4-029 W1-010 L1-020 L2-006 W4-015 W1-013 L6-015 W4-007 W1-014 W2-007 W3-006 L5-009 W3-005 W1-027 W2-017 W3-015 L6-004 W4-010 W1-032 W1-036 L6-016 L3-010 L4-026 W1-025 W2-013 L6-014 L4-025 W1-050 W1-053 W2-032 L7-010 L1-026 L5-010 L7-015 W1-052 W2-031 W3-020 W4-023 L7-013 L6-001 W1-005 W2-003 W4-003 L1-007 L7-003 L6-006 W4-005 L7-001 W1-015 L5-014 W3-001 L7-018 L6-017 W1-049 W4-004 W2-021 W2-026 W4-017 W1-044 L2-008');
mark('reproduced', 'live r2', 'L4-019 W1-046 W1-021 L6-009 W2-006 L5-002 W4-025 W1-017 L3-001 W1-007 L3-004 W4-014 L6-010 W1-028 W1-022 L5-003 L5-004 L5-016 L3-011 W1-019 L1-009 L2-001 L5-001 W4-033 L3-015 L6-005 L4-015 W1-031 W2-014 W3-013 L3-024 W4-012 L6-020 W4-006 W2-002 L7-007 L1-013 W1-055 L1-018 W2-028 L1-004 W2-015 L5-018 L5-017 L5-015 L1-010 L6-026 L6-021');
mark('reproduced', 'live r3', 'W3-003 L5-022 W3-002 W3-014 W1-018 W1-024 W2-008 W1-030 W2-010 W1-026 W3-012 W2-009 W4-008 W1-040 W2-024 L6-008 L6-011 L1-005 W3-016 W1-043 L4-023');
mark('reproduced', 'live r4', 'L3-012 L3-016 L3-023 L3-022 L4-013 L3-003 L4-012');
mark('reproduced', 'live r5', 'L3-007 L4-004 L3-017');
mark('reproduced', 'live r6', 'W4-020 W4-024 L4-014');
mark('reproduced', 'live r7', 'L4-001 L4-022 L4-003 L4-027 L4-002 L7-012 L6-002 L7-011 L4-021 W1-001 W4-001 L4-020 L4-024 L1-028 L7-008 L4-006');
mark('reproduced', 'live r8', 'L4-007 W4-034');
mark('reproduced', 'live r10', 'L5-008 W3-011 L5-005 W1-039 L3-005 L4-016 W1-042 W2-025 L3-018 W1-051 L6-019 W3-019 L3-020 L4-005 L7-017 L5-023 L7-022 L7-005 L7-006 W2-023 W2-022 W2-005 L5-021 L3-008 W2-018 L6-018 L5-006 W4-031');
mark('reproduced', 'live r1+r3', 'L7-021 L3-009 W1-047 W2-029 L3-021 W4-021 W3-004 L4-010 W2-030 W4-027', 'Focus loss and the absence of confirmation at the point of action reproduced. Claims that no message appears at all did not hold: a status line appears in the project header, out of view of the row.');
// Captures inspected at full resolution by the orchestrator, plus orchestrator screenshots.
mark('reproduced', 'capture kitchen-more-*', 'W1-045 W2-027 W4-018 L3-025 L1-021 L2-005 L6-024 W4-019 W1-033 W2-019 W4-013 L2-003 L6-013 L2-009');
mark('reproduced', 'capture kitchen-section-create-*', 'W1-041 W4-016');
mark('reproduced', 'capture todos-*', 'L1-016 L2-015 L3-019 L2-011');
mark('reproduced', 'capture settings-agents-*', 'L1-027 L6-027 W3-017');
mark('reproduced', 'capture prototype-design-*', 'L1-024 L7-014 L1-025');
mark('reproduced', 'capture kitchen-shortcut-picker-*', 'L1-022');
mark('reproduced', 'capture busy-week-dashboard-light-1440', 'L1-001 L1-002 L1-003 W4-028');
mark('reproduced', 'capture kitchen-task-drawer-dark-1440', 'L1-019 L2-010');
mark('reproduced', 'orchestrator screenshots r2', 'L1-030 L2-012 L2-013 L2-014 L2-002 L2-004 L2-007 L6-012 L6-007 L7-016 W1-035 W4-030 W1-012 W4-009 W4-035 L7-009 L7-020 W1-011 W1-038 W4-032 L1-006 W1-029 L3-002 L1-015 L1-011 L1-031 L1-008 L6-025 W1-020 L1-014');
// Source verification.
mark('reproduced', 'source', 'L2-016 L2-017 L2-018 L6-022 L6-023 W4-022 L6-003 L4-018 L4-017 L4-008', 'Confirmed against templates, token files or host responses; L4-008 also by its live confirmation copy and the host refusal text.');
// Partial reproductions admitted with their limit.
mark('reproduced-partly', 'live r7', 'W1-034 W4-011', 'Selection replaces the overdue/complete tint; the red border survives.');
mark('reproduced-partly', 'live r10', 'W2-016 W2-012 L1-023 W1-037', 'Reproduced the shape (details or controls low or small, notice placement); exact pixel figures differ with seed density.');
// Not reproduced or not reached: excluded from synthesis.
mark('not-reproduced', 'live r5', 'L3-013', 'The "body required" error cleared and the entry saved on a filled submit.');
mark('not-reproduced', 'live r10', 'L5-007', 'Placeholder measured 4.56:1 on the Task List input.');
mark('not-reproduced', 'live r10', 'L4-011', 'Injected restore failure did not disable the restore controls.');
mark('not-reached', 'live r9', 'L4-009', 'Seeds could not produce an archived root with Todos enabled; host refuses archiving a root with active workstreams.');
mark('unverified', 'none', 'W3-018 W1-054 L5-012 L5-013 W1-023 L5-019 L5-020 L1-012 L1-029 L1-017 W1-048 W1-009 L3-006 L3-014 L3-026 L2-017 W2-011 W2-020 W2-034 L6-024', 'Not reproduced by the orchestrator in this pass; excluded from synthesis.');
// Re-mark ids that were also in the unverified sweep but reproduced above (keep the reproduced verdict).
for (const id of ['L2-017', 'L6-024']) verdicts[id] = id === 'L2-017' ? { status: 'reproduced', method: 'source' } : { status: 'reproduced', method: 'capture kitchen-more-*' };

// ── Themes: root causes, in layer order. ──
const themes = [
  ['TH01', 'tokens', 'Surfaces, spacing and alignment have no system', 'Every block is a bordered rounded card at near-identical luminance, so grouping depends on hairlines and boxes nest inside boxes; gaps and edges are ad hoc.', 'L1-001 L1-002 L1-003 L1-005 L1-008 L1-022 L1-025 L1-030 L1-031 L2-011 L5-006 L1-019'],
  ['TH02', 'tokens', 'Colour alone carries state, and states collide', 'Active, selected, overdue, complete, disabled and pressed are tints of one palette with no second cue; selection overwrites status; forced colours erase them.', 'L5-008 L2-012 L5-016 L3-011 L5-017 W1-034 W4-011 L1-011 L4-006 W1-007 L3-004 W4-014 W1-053 W2-032 L4-013 L3-022 W1-020'],
  ['TH03', 'tokens', 'The token set stops short', 'No tokens for focus ring, z-index, breakpoints, font weight, opacity or motion; an undefined weight token; theme ignores the device preference and resets on reload.', 'L2-016 L2-017 L2-018 W2-002 L5-022 W3-002'],
  ['TH04', 'primitives', 'No shared control primitives', 'Browser-default buttons, selects and fields sit beside app-styled ones; six button heights, four field treatments, three icon families, unnamed controls and sub-24px targets.', 'L2-001 L2-002 L2-008 L2-009 L2-013 L1-009 W1-019 W4-033 L5-001 L3-015 W1-012 W4-009 W1-038 W4-032 L5-021 W2-005 W2-012 W1-002 W3-008 L2-007 L5-005 L5-003 L5-004 W1-022 W1-003 W2-001 W4-002'],
  ['TH05', 'primitives', 'No action hierarchy', 'Commit and Cancel look identical, only one form has a primary button, destructive and benign actions sit side by side, links look like text and text like links, and repeated labels are indistinguishable.', 'L1-020 L2-006 W1-010 W4-015 W4-019 L2-010 W1-050 L3-019 W3-017 W3-019'],
  ['TH06', 'primitives', 'Overlays and focus do not follow the user', 'The task drawer is an inline column below the fold, after every row in tab order, without focus or Escape; More is an inline form with four commit models; page settings and menus drop focus to the body.', 'W1-032 W2-016 W3-014 L5-010 W1-045 W2-027 W4-018 L3-025 L1-021 L5-009 W3-006 W3-005 W1-004 W3-007 W3-003'],
  ['TH07', 'patterns', 'Feedback is detached from the action', 'New items land off-screen with focus lost; confirmations appear elsewhere (or nowhere) and point to an unlabelled header icon; pending writes show nothing; edits save silently; one click destroys a draft or revokes access; "Open Archive" silently replaces the Undo step.', 'W1-024 W2-008 W3-016 W1-043 L4-023 W1-036 L6-016 L3-009 L4-026 W1-037 W2-021 L1-023 W1-047 W2-029 L3-021 W4-021 W3-004 L4-010 L3-007 L4-004 L3-008 W2-018 L3-005 L6-015 W1-013 W4-007 W1-030 W2-010 L3-016 L3-023 L3-010 L3-012 W4-020 L3-020 L4-005 L3-017 L4-024 W4-031'],
  ['TH08', 'patterns', 'Section chrome is hidden yet heavy', 'Insertion points appear only inside a 16px gap and only the top of the plus is clickable; grips leave an indent; six tab stops per section; touch shows all chrome at full strength; headings are announced as "Rename X"; default titles are format names.', 'W1-017 L3-001 W1-018 L3-002 W1-029 L1-006 L1-015 W3-011 L6-009 W1-021 W2-006 L5-002 W4-025 L3-003 L6-010 W1-028 L3-018'],
  ['TH09', 'patterns', 'The same object takes many shapes', 'A task is drawn differently in Task List, Todos, dashboard and Timeline; dashboard rows look clickable and are inert; archive and shortcut-source rows hide what distinguishes them.', 'L2-014 L2-015 L1-016 L1-010 L5-023 W2-023 W1-031 W2-014 W3-013 L3-024 W4-012 L1-027 W4-035 W1-040 W2-024 L7-017'],
  ['TH10', 'patterns', 'Empty, loading, error and archived states are accidental', 'Raw server strings fill red boxes, loading says "No projects yet", errors sit beside false empty states and never clear, archived work keeps live controls, and empty states offer no next step.', 'W1-001 W4-001 L4-020 L4-001 L4-002 L4-003 L4-018 L4-022 L4-027 L4-014 W4-024 L4-007 L4-008 L4-012 L4-017 L1-028 W4-034 L6-003 L4-016 W1-042 W2-025 W4-028'],
  ['TH11', 'shell', 'Two navigation trees and no single "you are here"', 'The work tree is drawn twice, the sidebar never marks the current project, "Home" means two places, breadcrumbs repeat the root, Settings children lose their place, every route has the same title, and there is no skip link.', 'L7-001 L7-002 L7-003 L7-004 L7-007 L7-008 L7-009 L7-010 L7-018 L7-019 L7-020 L7-021 L7-022 W1-015 W1-016 L1-013 W1-055 L1-026 L5-014 L5-015 L5-011 W3-001 W3-009 W1-006 W2-033 W4-026 W4-004 W4-005 L6-006 W1-011 W1-049 W2-030 W1-046'],
  ['TH12', 'shell', 'Prototype scaffolding inside the product', 'A dev-tooling banner tops every canvas, connecting an agent exists only in the dev panel (S1), Calendar and Search are placeholders citing slices, copy cites § numbers, seeds and the "prototype AI provider".', 'L7-011 L7-012 L7-013 L7-014 L7-015 L6-001 L6-002 L6-020 L6-022 L6-023 W1-005 W2-003 W4-003 W4-006 L1-007 W1-052 W2-031 W3-020 W4-023 W4-022 L4-021 L1-024'],
  ['TH13', 'shell', 'Narrow and touch layouts are squeezed desktop', 'At 375 the dashboard keeps double gutters, the header takes 40% of the screen, Save and details fall below the fold, archive rows break mid-word, and two navigations collapse two different ways; 320 scrolls sideways.', 'L1-004 L1-014 L1-018 W2-015 W2-022 W2-028 L5-018 L7-005 L7-006'],
  ['TH14', 'content', 'System vocabulary leaks into the interface', 'Internal ids, enum values, ISO instants, five date formats, three casings, Remove/Delete/Archive for one operation, project/workstream/root for one thing, and activity lines naming the wrong object.', 'L6-004 L6-005 L6-007 L6-008 L6-011 L6-012 L6-013 L6-014 L6-017 L6-018 L6-019 L6-021 L6-024 L6-025 L6-026 L6-027 L2-003 L2-004 L2-005 W1-025 W2-013 L4-025 W1-027 W2-017 W3-015 W4-010 W1-033 W2-019 W4-013 L4-015 L4-019 W1-035 W4-030 W1-051 W4-027 L7-016 W1-039'],
  ['TH15', 'page', 'Task-flow defaults work against the user', 'Add workstream defaults to the root even from inside Kitchen, new workstreams do not open, adding a task opens its drawer, shortcuts hide inside the section dialog and page settings behind a 10px gear.', 'W1-008 W2-004 W3-010 W4-029 W1-014 W2-007 W1-026 W3-012 W2-009 W4-008 W1-041 W4-016 W1-044 W2-026 W4-017'],
];
const themeOf = {};
for (const [id, , , , members] of themes) for (const m of list(members)) { if (!ids.has(m)) throw new Error(`theme ${id}: unknown ${m}`); if (themeOf[m]) throw new Error(`${m} in ${themeOf[m]} and ${id}`); themeOf[m] = id; }
const admitted = all.filter(x => ['reproduced', 'reproduced-partly'].includes(verdicts[x.id]?.status));
const problems = [];
for (const x of all) { if (!verdicts[x.id]) problems.push('no verdict ' + x.id); }
for (const x of admitted) if (!themeOf[x.id]) problems.push('admitted but unthemed ' + x.id);
for (const [m, t] of Object.entries(themeOf)) if (!['reproduced', 'reproduced-partly'].includes(verdicts[m]?.status)) problems.push(`themed but not admitted ${m} (${t})`);
if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
const sev = xs => xs.reduce((c, x) => (c[x.severity] = (c[x.severity] ?? 0) + 1, c), {});
const byId = Object.fromEntries(all.map(x => [x.id, x]));
const themeRows = themes.map(([id, layer, title, rootCause, members]) => { const ms = list(members).map(m => byId[m]); return { id, layer, title, rootCause, severity: sev(ms), findings: list(members), auditors: [...new Set(ms.map(m => m.file.replace('.json', '')))], decisionsReopened: [...new Set(ms.map(m => m.decisionReopened).filter(Boolean))] }; });
writeFileSync(`${ROOT}/reproduction.json`, JSON.stringify({ method: 'Orchestrator reproduction from fresh seeds on an isolated scratch host (127.0.0.1:4320) via a persistent headless page; scripts r1–r10 kept in the session scratchpad. Captures from apps/e2e/ux-output/c94f0f0e…. Unreproduced claims are excluded from synthesis.', totals: { filed: all.length, ...Object.fromEntries(['reproduced', 'reproduced-partly', 'not-reproduced', 'not-reached', 'unverified'].map(s => [s, all.filter(x => verdicts[x.id].status === s).length])) }, verdicts: Object.fromEntries(all.map(x => [x.id, { ...verdicts[x.id], severity: x.severity, auditor: x.file.replace('.json', '') }])) }, null, 1));
writeFileSync(`${ROOT}/themes.json`, JSON.stringify({ admitted: admitted.length, admittedBySeverity: sev(admitted), themes: themeRows }, null, 1));
console.log('filed', all.length, 'admitted', admitted.length, JSON.stringify(sev(admitted)));
for (const t of themeRows) console.log(t.id, t.layer, t.findings.length, JSON.stringify(t.severity), t.auditors.length + ' auditors', t.title);
