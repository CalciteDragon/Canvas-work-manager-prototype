// Validates the Slice 82 comb files and generates the stop-rule tally (docs/roadmap/70-ui-ux/comb-82/).
// Disposable comb tooling (plan § File-level change list); comb.test.mjs runs every check below
// against fixtures and against the real folder, by hand (plan Q7 (a)).
//
//   node docs/roadmap/70-ui-ux/tooling/build-comb.mjs           validate; write tally.json once themes.json exists
//   node docs/roadmap/70-ui-ux/tooling/build-comb.mjs --check   validate only
//   node docs/roadmap/70-ui-ux/tooling/build-comb.mjs --evidence  list evidence paths that do not resolve on this
//                                                                 machine (ux-output/ is git-ignored; step 4a, not the test)
//
// Files it reads (each optional until the step that writes it):
//   findings/{w1..w4,l1..l7}.json  { auditor, attestation, findings: [record], contrastTable? (l5) }
//   walkthroughs/{w1..w4}.json     Gate 1 walkthrough shape: { auditor, inputMode, viewport, theme, personas, tasks }
//   reproduction.json              { method, verdicts: { <id>: { status, severity, note?, classification?, matches? } } }
//   ledger.json                    { entries: [{ id, status, source, basis? }] }  (basis: outcome | answer)
//   comb-list.json                 { items: [{ item, status, note, record }], records: [record] }
//   themes.json                    { themes: [{ id, title, status, priority, openGate1Ids, combIds }] }
//   core-tasks.json                { tasks: [{ id, clicks, keystrokes, deadEnds, baselineClicks, slice81Clicks }] }
//   axe.json                       { cells, perTheme: { light|dark: { serious, critical } }, cellsWithSeriousOrCritical, colorContrastIncomplete }
//   briefs/decisions.md            the stripped decision list; one decision per line, `- <title> — `<path>``.
//                                  A `decisionReopened` must equal one title or one path exactly.
// and the Gate 1 verdicts (`../reproduction.json`) for the ledger and the classification. Extra keys are allowed and
// not checked (the ledger's severity, theme, slice, route and note; the comb list's noteId, evidence, verifiedAt, method).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GATE1_FIELDS = ['id', 'surface', 'inventoryRow', 'seed', 'theme', 'viewport', 'state', 'persona', 'evidence', 'repro', 'expected', 'actual', 'lens', 'heuristic', 'severity', 'confidence', 'decisionReopened'];
export const LENSES = ['hierarchy', 'consistency', 'affordance', 'states', 'accessibility', 'copy', 'ia'];
export const VERDICTS = ['reproduced', 'reproduced-partly', 'not-reproduced', 'not-reached', 'unverified'];
export const ADMITTED = ['reproduced', 'reproduced-partly'];
export const CLASSIFICATIONS = ['new', 'still-open', 'regression', 'introduced'];
export const LEDGER_STATUSES = ['closed', 'partly-closed', 'advanced', 'open-routed', 'open-by-decision', 'open-unrouted'];
/** Ledger statuses a *still open* finding may match; *regression* matches closed or partly-closed. */
export const LEDGER_OPEN = ['advanced', 'open-routed', 'open-by-decision', 'open-unrouted'];
export const COMB_LIST_STATUSES = ['closed', 'partly-closed', 'open'];
export const TALLY_CRITERIA = ['openS1', 'openS2ByTheme', 'coreTasks', 'axe', 'contrastIncomplete', 'measuredContrast', 'combSeverity'];
const TASKS = Array.from({ length: 12 }, (_, i) => `T${String(i + 1).padStart(2, '0')}`);
const FIX_KEY = /^(fix|fixes|proposedFix|suggestion|suggestions|recommendation|recommendations)$/i;

const readJson = path => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null);
const readFolder = dir => (existsSync(dir) ? Object.fromEntries(readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(f => [f.replace(/\.json$/, ''), readJson(join(dir, f))])) : {});

/** Reads a comb folder. `gate1` is the Gate 1 reproduction file; `repo` resolves ledger sources. */
export function loadComb(dir, { gate1, repo }) {
  const decisions = join(dir, 'briefs', 'decisions.md');
  return {
    dir, repo,
    findings: readFolder(join(dir, 'findings')),
    walkthroughs: readFolder(join(dir, 'walkthroughs')),
    reproduction: readJson(join(dir, 'reproduction.json')),
    ledger: readJson(join(dir, 'ledger.json')),
    combList: readJson(join(dir, 'comb-list.json')),
    themes: readJson(join(dir, 'themes.json')),
    tally: readJson(join(dir, 'tally.json')),
    coreTasks: readJson(join(dir, 'core-tasks.json')),
    axe: readJson(join(dir, 'axe.json')),
    decisions: existsSync(decisions) ? parseDecisions(readFileSync(decisions, 'utf8')) : null,
    gate1: readJson(gate1),
  };
}

/** Titles and paths from `- <title> — \`<path>\`` lines. */
export function parseDecisions(text) {
  const names = new Set();
  for (const line of text.split('\n')) {
    const match = /^- (.+?) — `([^`]+)`\s*$/.exec(line.trim());
    if (match) { names.add(match[1].trim()); names.add(match[2].trim()); names.add(match[2].trim().replace(/^docs\/decisions\//, '')); }
  }
  return names;
}

const hasFindings = c => Object.keys(c.findings).length > 0;
/** Every filed record with the findings file it came from (comb-list records under `comb-list`). */
function records(c, { combList = true } = {}) {
  const out = Object.entries(c.findings).flatMap(([file, body]) => (body?.findings ?? []).map(record => ({ file, record })));
  if (combList && c.combList) out.push(...(c.combList.records ?? []).map(record => ({ file: 'comb-list', record })));
  return out;
}
const filedIds = c => records(c, { combList: false }).map(({ record }) => record.id);
const admittedIds = c => Object.entries(c.reproduction?.verdicts ?? {}).filter(([, v]) => ADMITTED.includes(v.status)).map(([id]) => id);
const where = (file, record) => `${file}:${record?.id ?? '(no id)'}`;

function collect(fn) { const errors = []; fn(message => errors.push(message)); return errors; }

/** Each check returns null (inputs not written yet, skipped) or a list of errors. */
export const CHECKS = {
  'findings-format': c => (!hasFindings(c) && !c.combList ? null : collect(err => {
    for (const [file, body] of Object.entries(c.findings)) if (!Array.isArray(body?.findings)) err(`${file}: no findings array`);
    for (const { file, record } of records(c)) {
      for (const field of [...GATE1_FIELDS, 'auditor']) if (!(field in record)) err(`${where(file, record)}: missing ${field}`);
      for (const field of ['evidence', 'repro']) if (field in record && (!Array.isArray(record[field]) || record[field].length === 0)) err(`${where(file, record)}: ${field} must be a non-empty list`);
      for (const field of GATE1_FIELDS.filter(f => !['evidence', 'repro', 'decisionReopened'].includes(f))) if (field in record && (typeof record[field] !== 'string' || !record[field].trim())) err(`${where(file, record)}: ${field} must be a non-empty string`);
      if (file !== 'comb-list' && c.findings[file].auditor !== file) err(`${file}: file auditor ${c.findings[file].auditor} is not ${file}`);
      if (file !== 'comb-list' && record.auditor !== c.findings[file].auditor) err(`${where(file, record)}: auditor ${record.auditor} is not the file's ${c.findings[file].auditor}`);
    }
  })),
  'findings-id': c => (!hasFindings(c) && !c.combList ? null : collect(err => {
    for (const { file, record } of records(c)) {
      const want = file === 'comb-list' ? /^C82-CL-\d{2}$/ : new RegExp(`^C82-${file.toUpperCase()}-\\d{3}$`);
      if (!want.test(String(record.id))) err(`${where(file, record)}: id should match ${want}`);
    }
  })),
  'findings-severity': c => (!hasFindings(c) && !c.combList ? null : collect(err => {
    for (const { file, record } of records(c)) if (!['S1', 'S2', 'S3'].includes(record.severity)) err(`${where(file, record)}: severity ${record.severity}`);
  })),
  'findings-lens': c => (!hasFindings(c) && !c.combList ? null : collect(err => {
    for (const { file, record } of records(c)) if (!LENSES.includes(record.lens) && !/^task:T(0[1-9]|1[0-2])(-equiv)?$/.test(String(record.lens))) err(`${where(file, record)}: lens ${record.lens}`);
  })),
  'findings-no-fix': c => (!hasFindings(c) && !c.combList ? null : collect(err => {
    const walk = (value, path, file, record) => {
      if (value && typeof value === 'object') for (const [key, inner] of Object.entries(value)) {
        if (FIX_KEY.test(key)) err(`${where(file, record)}: ${path}${key} proposes a fix (protocol §4.3)`);
        walk(inner, `${path}${key}.`, file, record);
      }
    };
    for (const { file, record } of records(c)) walk(record, '', file, record);
  })),
  'decision-reopened': c => (!hasFindings(c) && !c.combList ? null : collect(err => {
    for (const { file, record } of records(c)) {
      const value = record.decisionReopened;
      if (value === null) continue;
      if (typeof value !== 'string' || !value.trim()) err(`${where(file, record)}: decisionReopened must be null or a decision title or path`);
      else if (c.decisions === null) err(`${where(file, record)}: briefs/decisions.md is missing, so "${value}" cannot be checked`);
      else if (!c.decisions.has(value.trim())) err(`${where(file, record)}: "${value}" is not a title or path in briefs/decisions.md`);
    }
  })),
  'attestation': c => (!hasFindings(c) ? null : collect(err => {
    for (const [file, body] of Object.entries(c.findings)) if (typeof body?.attestation !== 'string' || !body.attestation.trim()) err(`${file}: empty attestation`);
  })),
  'contrast-table': c => (!c.findings.l5 ? null : collect(err => {
    const table = c.findings.l5.contrastTable;
    if (!Array.isArray(table) || table.length === 0) return err('l5: no contrastTable');
    for (const [i, row] of table.entries()) {
      for (const field of ['element', 'theme', 'fg', 'bg', 'required']) if (typeof row[field] !== 'string' || !row[field]) err(`l5 contrastTable[${i}]: missing ${field}`);
      if (typeof row.ratio !== 'number') err(`l5 contrastTable[${i}]: ratio must be a number`);
    }
    for (const theme of ['light', 'dark']) if (!table.some(row => row.theme === theme)) err(`l5 contrastTable: no ${theme} rows (both themes are measured)`);
  })),
  'unique-ids': c => (!hasFindings(c) && !c.combList ? null : collect(err => {
    const seen = new Map();
    for (const { file, record } of records(c)) {
      if (seen.has(record.id)) err(`${record.id}: filed in ${seen.get(record.id)} and ${file}`);
      else seen.set(record.id, file);
    }
  })),
  'verdicts': c => (!c.reproduction ? null : collect(err => {
    const verdicts = c.reproduction.verdicts;
    if (!verdicts || typeof verdicts !== 'object' || Array.isArray(verdicts)) return err('reproduction.json: verdicts must be an object keyed by id');
    const filed = new Set(filedIds(c));
    for (const id of filed) if (!(id in verdicts)) err(`${id}: filed but has no verdict`);
    for (const id of Object.keys(verdicts)) if (!filed.has(id)) err(`${id}: has a verdict but was never filed`);
  })),
  'verdict-status': c => (!c.reproduction ? null : collect(err => {
    for (const [id, verdict] of Object.entries(c.reproduction.verdicts ?? {})) {
      if (!VERDICTS.includes(verdict?.status)) err(`${id}: status ${verdict?.status} is not one of ${VERDICTS.join(', ')}`);
      if (verdict?.status === 'reproduced-partly' && !String(verdict.note ?? '').trim()) err(`${id}: reproduced-partly needs a note`);
      if (!['S1', 'S2', 'S3'].includes(verdict?.severity)) err(`${id}: verdict severity ${verdict?.severity}`);
    }
  })),
  'classification': c => (!c.themes || !c.reproduction ? null : collect(err => {
    const gate1 = new Set(Object.keys(c.gate1?.verdicts ?? {}));
    for (const id of admittedIds(c)) {
      const { classification, matches } = c.reproduction.verdicts[id];
      if (!CLASSIFICATIONS.includes(classification)) err(`${id}: classification ${classification}`);
      else if (!['new', 'introduced'].includes(classification) && !gate1.has(matches)) err(`${id}: ${classification} must name a Gate 1 id in matches (got ${matches})`);
    }
  })),
  'classification-ledger': c => (!c.themes || !c.reproduction || !c.ledger ? null : collect(err => {
    const status = new Map((c.ledger.entries ?? []).map(e => [e.id, e.status]));
    for (const id of admittedIds(c)) {
      const { classification, matches } = c.reproduction.verdicts[id];
      const want = classification === 'regression' ? ['closed', 'partly-closed'] : classification === 'still-open' ? LEDGER_OPEN : null;
      if (want && !want.includes(status.get(matches))) err(`${id}: ${classification} matches ${matches}, which the ledger marks ${status.get(matches) ?? 'nothing'}`);
    }
  })),
  'ledger-vocabulary': c => (!c.ledger ? null : collect(err => {
    for (const entry of c.ledger.entries ?? []) {
      if (!LEDGER_STATUSES.includes(entry.status)) err(`${entry.id}: ledger status ${entry.status}`);
      if (typeof entry.source !== 'string' || !entry.source.trim()) err(`${entry.id}: no source`);
      if (!['closed', 'partly-closed'].includes(entry.status)) continue;
      if (!['outcome', 'answer'].includes(entry.basis)) { err(`${entry.id}: ${entry.status} must rest on a record's Outcome or an accepted answer (basis outcome|answer), not ${entry.basis}`); continue; }
      const match = /^(.+\.md):(\d+)$/.exec(String(entry.source));
      if (!match) { err(`${entry.id}: source must be <path>.md:<line>`); continue; }
      const path = resolve(c.repo, match[1]);
      if (!existsSync(path)) { err(`${entry.id}: ${match[1]} does not exist`); continue; }
      const lines = readFileSync(path, 'utf8').split('\n'), line = Number(match[2]);
      if (line < 1 || line > lines.length) { err(`${entry.id}: ${entry.source} is past the end of the file`); continue; }
      const outcome = lines.findIndex(l => /^## Outcome/.test(l)) + 1;
      if (entry.basis === 'outcome' && (outcome === 0 || line <= outcome)) err(`${entry.id}: ${entry.source} is not inside the record's Outcome`);
      if (entry.basis === 'answer' && !/answer/i.test(lines[line - 1])) err(`${entry.id}: ${entry.source} is not an answer line`);
    }
  })),
  'ledger-complete': c => (!c.ledger ? null : collect(err => {
    const want = Object.entries(c.gate1?.verdicts ?? {}).filter(([, v]) => ADMITTED.includes(v.status)).map(([id]) => id);
    const count = new Map();
    for (const entry of c.ledger.entries ?? []) count.set(entry.id, (count.get(entry.id) ?? 0) + 1);
    for (const id of want) if (count.get(id) !== 1) err(`${id}: appears ${count.get(id) ?? 0} times in the ledger (want 1)`);
    for (const id of count.keys()) if (!want.includes(id)) err(`${id}: in the ledger but not a Gate 1 admitted id`);
  })),
  'themes': c => (!c.themes || !c.reproduction ? null : collect(err => {
    const themes = c.themes.themes ?? [];
    for (let i = 1; i <= 15; i++) { const id = `TH${String(i).padStart(2, '0')}`; if (!themes.some(t => t.id === id)) err(`${id}: missing from themes.json`); }
    for (const theme of themes) for (const field of ['status', 'priority']) if (theme[field] === undefined || theme[field] === null || theme[field] === '') err(`${theme.id}: no ${field}`);
    const admitted = new Set(admittedIds(c)), placed = new Map();
    for (const theme of themes) for (const id of theme.combIds ?? []) {
      if (!admitted.has(id)) err(`${theme.id}: ${id} is not an admitted comb id`);
      placed.set(id, [...(placed.get(id) ?? []), theme.id]);
    }
    if (c.ledger) {
      const open = (c.ledger.entries ?? []).filter(e => LEDGER_OPEN.includes(e.status)).map(e => e.id), held = new Map();
      for (const theme of themes) for (const id of theme.openGate1Ids ?? []) held.set(id, (held.get(id) ?? 0) + 1);
      for (const id of open) if (held.get(id) !== 1) err(`${id}: open in the ledger but in ${held.get(id) ?? 0} themes' openGate1Ids (want 1)`);
      for (const id of held.keys()) if (!open.includes(id)) err(`${id}: listed as open in a theme but the ledger does not mark it open`);
    }
    for (const id of admitted) if ((placed.get(id) ?? []).length !== 1) err(`${id}: in ${(placed.get(id) ?? []).length} themes (want 1: ${(placed.get(id) ?? []).join(', ') || 'none'})`);
  })),
  'comb-list': c => (!c.combList ? null : collect(err => {
    const items = c.combList.items ?? [], records = new Set((c.combList.records ?? []).map(r => r.id));
    for (let n = 1; n <= 22; n++) {
      const found = items.filter(item => item.item === n);
      if (found.length !== 1) { err(`comb item ${n}: ${found.length} entries (want 1)`); continue; }
      const [item] = found, id = `C82-CL-${String(n).padStart(2, '0')}`;
      if (!COMB_LIST_STATUSES.includes(item.status)) err(`comb item ${n}: status ${item.status}`);
      if (item.status !== 'closed' && (item.record !== id || !records.has(id))) err(`comb item ${n}: ${item.status} but no ${id} record`);
    }
    for (const item of items) if (!(item.item >= 1 && item.item <= 22)) err(`comb item ${item.item}: outside 1–22`);
  })),
  'tally': c => (!c.tally && !c.themes ? null : collect(err => {
    if (!c.tally) return err('themes.json exists but tally.json does not; run build-comb.mjs');
    const want = computeTally(c);
    for (const key of new Set([...Object.keys(want), ...Object.keys(c.tally)])) if (canonical(want[key]) !== canonical(c.tally[key])) err(`tally.json ${key} differs from what build-comb.mjs computes; regenerate it, never hand-edit`);
  })),
  'walkthroughs': c => (Object.keys(c.walkthroughs).length === 0 ? null : collect(err => {
    for (const [file, w] of Object.entries(c.walkthroughs)) {
      if (!['mouse', 'touch', 'keyboard'].includes(w.inputMode)) err(`${file}: inputMode ${w.inputMode}`);
      if (file === 'w2' && (w.viewport !== '375x812' || w.inputMode !== 'touch')) err('w2: must be viewport 375x812 with inputMode touch');
      if (file === 'w3' && w.inputMode !== 'keyboard') err('w3: must be inputMode keyboard');
      if (!Array.isArray(w.personas) || w.personas.length === 0) { err(`${file}: no personas`); continue; }
      for (const persona of w.personas) for (const t of TASKS) {
        const runs = (w.tasks ?? []).filter(run => run.persona === persona && (run.task === t || run.task === `${t}-equiv`));
        if (runs.length !== 1) { err(`${file}: ${persona} has ${runs.length} runs of ${t} (want 1)`); continue; }
        const [run] = runs;
        for (const field of ['outcome', 'discoverability']) if (typeof run[field] !== 'string' || !run[field].trim()) err(`${file}: ${persona} ${t} has no ${field}`);
        for (const field of ['clicks', 'keystrokes', 'deadEnds']) if (typeof run[field] !== 'number') err(`${file}: ${persona} ${t} ${field} must be a number`);
        if (!Array.isArray(run.surfaces)) err(`${file}: ${persona} ${t} has no surfaces list`);
      }
    }
  })),
  'tally-criteria': c => (!c.tally && !c.themes ? null : collect(err => {
    if (!c.tally) return err('themes.json exists but tally.json does not; run build-comb.mjs');
    for (const key of TALLY_CRITERIA) if (c.tally[key] === undefined || c.tally[key] === null) err(`tally.json: no ${key} line (an input file is missing)`);
  })),
};

/** Runs the named checks (default all): `{ name: null | errors[] }`. */
export function runChecks(c, names = Object.keys(CHECKS)) {
  return Object.fromEntries(names.map(name => [name, CHECKS[name](c)]));
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}

const ratio = required => Number(String(required).split(':')[0]);

/** The stop-rule tally, one line per protocol §8 criterion, computed only from the comb files. */
export function computeTally(c) {
  const verdicts = c.reproduction?.verdicts ?? {}, gate1 = c.gate1?.verdicts ?? {};
  const admitted = admittedIds(c).sort();
  const recordById = new Map(records(c).map(({ record }) => [record.id, record]));
  const severity = id => verdicts[id]?.severity ?? recordById.get(id)?.severity;
  const ledgerOpen = new Set((c.ledger?.entries ?? []).filter(e => LEDGER_OPEN.includes(e.status)).map(e => e.id));
  const combListOpen = (c.combList?.items ?? []).filter(item => item.status !== 'closed').map(item => item.record).filter(Boolean);
  const openS2ByTheme = {};
  for (const theme of c.themes?.themes ?? []) {
    const gate1S2 = (theme.openGate1Ids ?? []).filter(id => ledgerOpen.has(id) && gate1[id]?.severity === 'S2').length;
    const combS2 = (theme.combIds ?? []).filter(id => admitted.includes(id) && severity(id) === 'S2').length;
    openS2ByTheme[theme.id] = { gate1: gate1S2, comb: combS2, total: gate1S2 + combS2, ...(theme.id === 'TH12' ? { openByDecision: true } : {}) };
  }
  const tasks = c.coreTasks?.tasks ?? null;
  const table = c.findings.l5?.contrastTable ?? null;
  const combListRecords = combListOpen.map(id => recordById.get(id)).filter(Boolean);
  openS2ByTheme['comb-list'] = { gate1: 0, comb: combListRecords.filter(r => r.severity === 'S2').length, total: combListRecords.filter(r => r.severity === 'S2').length };
  const combSeverity = {};
  for (const s of ['S1', 'S2', 'S3']) {
    combSeverity[s] = Object.fromEntries([...CLASSIFICATIONS, 'unclassified'].map(k => [k, 0]));
    combSeverity[s].combListOpen = combListRecords.filter(r => r.severity === s).length;
    for (const id of admitted.filter(id => severity(id) === s)) combSeverity[s][CLASSIFICATIONS.includes(verdicts[id].classification) ? verdicts[id].classification : 'unclassified']++;
  }
  return {
    generatedBy: 'docs/roadmap/70-ui-ux/tooling/build-comb.mjs',
    openS1: {
      comb: admitted.filter(id => severity(id) === 'S1'),
      gate1: [...ledgerOpen].filter(id => gate1[id]?.severity === 'S1').sort(),
      combList: combListOpen.filter(id => recordById.get(id)?.severity === 'S1').sort(),
    },
    openS2ByTheme,
    coreTasks: tasks && {
      overBaseline: tasks.filter(t => typeof t.baselineClicks === 'number' && t.clicks > t.baselineClicks).map(t => t.id),
      overSlice81: tasks.filter(t => typeof t.slice81Clicks === 'number' && t.clicks > t.slice81Clicks).map(t => t.id),
      withDeadEnds: tasks.filter(t => t.deadEnds > 0).map(t => t.id),
    },
    axe: c.axe && { cells: c.axe.cells, perTheme: c.axe.perTheme, cellsWithSeriousOrCritical: c.axe.cellsWithSeriousOrCritical },
    contrastIncomplete: c.axe && { cells: c.axe.colorContrastIncomplete, of: c.axe.cells, outsideStopRule: true },
    measuredContrast: table && {
      rows: table.length,
      failures: table.filter(row => row.ratio < ratio(row.required)).map(row => `${row.element} (${row.theme}) ${row.ratio}:1 < ${row.required}`),
      outsideStopRule: true,
    },
    combSeverity,
  };
}

const EVIDENCE_PATH = /(?:apps\/e2e\/ux-output\/[^\s:()'",;]+|(?<![\w/.-])[\w.-]+\.(?:png|json|yml))/g;
/**
 * Resolves the file paths cited in evidence (free text without a path is allowed, briefs § 6). A repo-relative
 * path must exist; a bare file name is looked up in the auditor's walk folder, then in the capture folder `c82`.
 * Returns `{ checked, missing: [{ id, path }], bare: [{ id, path, resolved }] }`.
 */
export function checkEvidence(c, repo, { c82 = null } = {}) {
  const out = { checked: 0, missing: [], bare: [] };
  const walk = file => join('apps/e2e/ux-output/walk', file === 'comb-list' ? 'repro' : file);
  for (const { file, record } of records(c)) for (const text of record.evidence ?? []) for (const [path] of String(text).matchAll(EVIDENCE_PATH)) {
    const clean = path.replace(/[.]+$/, '');
    out.checked++;
    if (clean.includes('/')) { if (!existsSync(resolve(repo, clean))) out.missing.push({ id: record.id, path: clean }); continue; }
    const dirs = [walk(file), ...(c82 ? [join('apps/e2e/ux-output', c82), join('apps/e2e/ux-output', c82, 'comb')] : [])];
    const hit = dirs.map(d => join(d, clean)).find(candidate => existsSync(resolve(repo, candidate)));
    if (hit) out.bare.push({ id: record.id, path: clean, resolved: hit }); else out.missing.push({ id: record.id, path: clean });
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (process.argv.includes('--evidence')) {
    const here = import.meta.dirname, dir = resolve(here, '..', 'comb-82'), repo = resolve(here, '..', '..', '..', '..');
    const c82 = '37dd16e2303e7d8968905de74767710d6b02b85c';
    const result = checkEvidence(loadComb(dir, { gate1: resolve(here, '..', 'reproduction.json'), repo }), repo, { c82 });
    for (const { id, path, resolved } of result.bare) console.log(`bare: ${id} ${path} -> ${resolved}`);
    for (const { id, path } of result.missing) console.error(`missing: ${id} ${path}`);
    console.log(`evidence: ${result.checked} paths checked, ${result.bare.length} bare names resolved, ${result.missing.length} missing`);
    process.exit(result.missing.length ? 1 : 0);
  }
  const here = import.meta.dirname, dir = resolve(here, '..', 'comb-82');
  const comb = loadComb(dir, { gate1: resolve(here, '..', 'reproduction.json'), repo: resolve(here, '..', '..', '..', '..') });
  // The tally checks run after regeneration, so a stale tally never blocks its own rewrite.
  const results = runChecks(comb, Object.keys(CHECKS).filter(name => !name.startsWith('tally')));
  const failed = Object.entries(results).filter(([, errors]) => errors?.length);
  for (const [name, errors] of failed) for (const e of errors) console.error(`${name}: ${e}`);
  for (const [name, errors] of Object.entries(results)) if (errors === null) console.log(`${name}: skipped (inputs not written yet)`);
  if (failed.length) process.exit(1);
  if (!process.argv.includes('--check') && comb.themes) {
    writeFileSync(join(dir, 'tally.json'), `${JSON.stringify(computeTally(comb), null, 2)}\n`);
    console.log('wrote comb-82/tally.json');
  }
  const tally = runChecks(loadComb(dir, { gate1: resolve(here, '..', 'reproduction.json'), repo: comb.repo }), ['tally', 'tally-criteria']);
  for (const [name, errors] of Object.entries(tally)) for (const e of errors ?? []) console.error(`${name}: ${e}`);
  if (Object.values(tally).some(errors => errors?.length)) process.exit(1);
  console.log('comb files valid');
}
