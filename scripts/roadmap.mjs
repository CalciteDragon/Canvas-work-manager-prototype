/**
 * The roadmap's state machine (docs/documentation-protocol.md, "The roadmap").
 *
 * A plan is one Markdown file that moves through three folders under docs/roadmap/:
 *
 *   planned/  →  active/  →  completed/
 *
 * Each file carries its state in an HTML comment on its first line, and `progress.md`
 * carries a board generated from those comments. Nothing here is edited by hand except the
 * plan's own prose; the board and the folder are moved by this script so that they cannot
 * disagree. `check-docs.mjs` fails `pnpm lint` when they do.
 *
 *   node scripts/roadmap.mjs sync                       regenerate the board in progress.md
 *   node scripts/roadmap.mjs check                      exit 1 if the board is stale or a plan is malformed
 *   node scripts/roadmap.mjs new <id> <slug> --title "…" [--summary "…"]
 *                                                       create planned/<id>-<slug>.md from the template
 *   node scripts/roadmap.mjs start <file>               planned → active
 *   node scripts/roadmap.mjs complete <file> [--closed YYYY-MM-DD] [--summary "…"]
 *                                                       active → completed (requires a "## Outcome" section)
 *
 * `git mv` is used when the file is tracked, so history follows the plan across states.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const ROADMAP = join(ROOT, 'docs', 'roadmap');
export const STATES = ['active', 'planned', 'completed'];
const PROGRESS = join(ROADMAP, 'progress.md');
const TEMPLATE = join(ROOT, 'docs', 'templates', 'implementation-plan.md');
const BEGIN = '<!-- roadmap:begin -->';
const END = '<!-- roadmap:end -->';

const lf = (text) => text.replace(/\r\n?/g, '\n');
const attrs = (comment) => Object.fromEntries([...comment.matchAll(/(\w+)="([^"]*)"/g)].map(([, k, v]) => [k, v]));

/**
 * The template ships an "## Outcome" skeleton, so the heading alone proves nothing. An
 * outcome counts as written when the section holds at least one line of prose that is not
 * a heading, not an HTML comment, and not a `<placeholder>` left over from the template.
 */
export const hasWrittenOutcome = (text) => {
  const match = text.match(/^## Outcome\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m);
  if (!match) return false;
  return match[1]
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .some((line) => line.trim() !== '' && !/^#/.test(line.trim()) && !/<[^>]+>/.test(line));
};

/** Parses one plan file into its board entry, or returns the reason it cannot be parsed. */
export const parseEntry = (state, file) => {
  const text = lf(readFileSync(file, 'utf8'));
  const firstLine = text.split('\n', 1)[0];
  const title = (text.split('\n').find((l) => l.startsWith('# ')) ?? '').replace(/^# /, '').trim();
  const entry = { state, file, name: basename(file), title, problems: [] };
  if (state === 'completed') {
    const m = firstLine.match(/^<!-- completed-record (.*?) -->$/);
    if (!m) entry.problems.push('first line must be `<!-- completed-record id="…" closed="YYYY-MM-DD" summary="…" -->`');
    else Object.assign(entry, attrs(m[1]));
    if (!/^\d{4}-\d\d-\d\d$/.test(entry.closed ?? '')) entry.problems.push('closed must be a YYYY-MM-DD date');
    if (!hasWrittenOutcome(text)) entry.problems.push('a completed record needs a written "## Outcome" section');
  } else {
    const m = firstLine.match(/^<!-- plan (.*?) -->$/);
    if (!m) entry.problems.push('first line must be `<!-- plan id="…" status="planned|active" summary="…" -->`');
    else Object.assign(entry, attrs(m[1]));
    if (entry.status !== state) entry.problems.push(`status="${entry.status}" but the file is in ${state}/`);
  }
  if (!entry.id) entry.problems.push('missing id');
  if (!title) entry.problems.push('missing "# Title" heading');
  if (!entry.summary) entry.problems.push('missing summary="…" (one line, what the slice delivers or delivered)');
  return entry;
};

export const readEntries = () =>
  STATES.flatMap((state) => {
    const dir = join(ROADMAP, state);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith('.md') && f !== 'README.md')
      .sort()
      .map((f) => parseEntry(state, join(dir, f)));
  });

const idKey = (id = '') => {
  const m = id.match(/^(\d+)(?:\.(\d+))?/);
  return m ? Number(m[1]) + (m[2] ? Number(m[2]) / 100 : 0) : Number.POSITIVE_INFINITY;
};
const byId = (a, b) => idKey(a.id) - idKey(b.id) || a.id.localeCompare(b.id);
const byClosed = (a, b) => (a.closed ?? '').localeCompare(b.closed ?? '') || byId(a, b);
const cell = (s = '') => s.replace(/\|/g, '\\|');
const link = (e) => `[${e.name}](${e.state}/${e.name})`;

/** The Markdown that lives between the two roadmap markers in progress.md. */
export const renderBoard = (entries) => {
  const section = (state, header, rows, empty) => [`### ${header}`, '', ...(rows.length ? rows : [empty]), ''];
  const active = entries.filter((e) => e.state === 'active').sort(byId);
  const planned = entries.filter((e) => e.state === 'planned').sort(byId);
  const completed = entries.filter((e) => e.state === 'completed').sort(byClosed);
  const planRows = (list) => (list.length ? ['| Slice | Title | Summary | Plan |', '|---|---|---|---|', ...list.map((e) => `| ${cell(e.id)} | ${cell(e.title)} | ${cell(e.summary)} | ${link(e)} |`)] : []);
  return [
    ...section('active', 'Active', planRows(active), '_Nothing is active. Start one with `node scripts/roadmap.mjs start docs/roadmap/planned/<file>`._'),
    ...section('planned', 'Planned', planRows(planned), '_Nothing is planned._'),
    ...section('completed', 'Completed', completed.length ? ['| Slice | Title | Closed | Summary | Record |', '|---|---|---|---|---|', ...completed.map((e) => `| ${cell(e.id)} | ${cell(e.title)} | ${e.closed} | ${cell(e.summary)} | ${link(e)} |`)] : [], '_Nothing has been completed._'),
  ].join('\n').trimEnd();
};

export const currentBoard = () => {
  const text = lf(readFileSync(PROGRESS, 'utf8'));
  const start = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  if (start === -1 || end === -1 || end < start) throw new Error(`progress.md must contain ${BEGIN} … ${END}`);
  return { text, start: start + BEGIN.length, end };
};

export const sync = () => {
  const entries = readEntries();
  const { text, start, end } = currentBoard();
  const next = text.slice(0, start) + '\n' + renderBoard(entries) + '\n' + text.slice(end);
  if (next !== text) writeFileSync(PROGRESS, next);
  return entries;
};

export const check = () => {
  const entries = readEntries();
  const problems = entries.flatMap((e) => e.problems.map((p) => `${e.state}/${e.name}: ${p}`));
  const { text, start, end } = currentBoard();
  if (text.slice(start, end).trim() !== renderBoard(entries).trim()) {
    problems.push('progress.md board is stale — run `node scripts/roadmap.mjs sync`');
  }
  const ids = new Map();
  for (const e of entries) {
    if (e.id && ids.has(e.id)) problems.push(`${e.state}/${e.name}: id "${e.id}" is also used by ${ids.get(e.id)}`);
    ids.set(e.id, `${e.state}/${e.name}`);
  }
  return problems;
};

const option = (args, name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const tracked = (file) => {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', file], { cwd: ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};
const move = (from, to) => {
  if (tracked(from)) execFileSync('git', ['mv', from, to], { cwd: ROOT, stdio: 'inherit' });
  else renameSync(from, to);
};
const replaceFirstLine = (file, line) => {
  const lines = lf(readFileSync(file, 'utf8')).split('\n');
  lines[0] = line;
  writeFileSync(file, lines.join('\n'));
};
const today = () => new Date().toISOString().slice(0, 10);

const commands = {
  sync() {
    const entries = sync();
    console.log(`progress.md synced: ${entries.filter((e) => e.state === 'active').length} active, ${entries.filter((e) => e.state === 'planned').length} planned, ${entries.filter((e) => e.state === 'completed').length} completed`);
  },
  check() {
    const problems = check();
    for (const p of problems) console.error(`roadmap: ${p}`);
    if (problems.length) process.exit(1);
    console.log('roadmap: ok');
  },
  new(args) {
    const [id, slug] = args;
    const title = option(args, 'title');
    if (!id || !slug || !title) throw new Error('usage: new <id> <slug> --title "…" [--summary "…"]');
    const target = join(ROADMAP, 'planned', `${id}-${slug}.md`);
    if (existsSync(target)) throw new Error(`${target} already exists`);
    const summary = option(args, 'summary') ?? '';
    const body = lf(readFileSync(TEMPLATE, 'utf8'))
      .replace(/<!-- plan id="[^"]*" status="[^"]*" summary="[^"]*" -->/, `<!-- plan id="${id}" status="planned" summary="${summary}" -->`)
      .replace(/^# .*$/m, `# Slice ${id} — ${title}`);
    writeFileSync(target, body);
    sync();
    console.log(`created ${target}`);
  },
  start(args) {
    const from = resolve(ROOT, args[0] ?? '');
    const entry = parseEntry('planned', from);
    if (entry.state !== 'planned' || dirname(from) !== join(ROADMAP, 'planned')) throw new Error('start takes a file in docs/roadmap/planned/');
    const to = join(ROADMAP, 'active', basename(from));
    move(from, to);
    replaceFirstLine(to, `<!-- plan id="${entry.id}" status="active" summary="${entry.summary ?? ''}" -->`);
    sync();
    console.log(`started ${to}`);
  },
  complete(args) {
    const from = resolve(ROOT, args[0] ?? '');
    if (dirname(from) !== join(ROADMAP, 'active')) throw new Error('complete takes a file in docs/roadmap/active/');
    const entry = parseEntry('active', from);
    const text = lf(readFileSync(from, 'utf8'));
    if (!hasWrittenOutcome(text)) throw new Error('write the "## Outcome" section first — what now exists, what was learned, what was deferred');
    const summary = option(args, 'summary') ?? entry.summary;
    if (!summary) throw new Error('a completed record needs a one-line summary: --summary "…"');
    const closed = option(args, 'closed') ?? today();
    const to = join(ROADMAP, 'completed', basename(from));
    move(from, to);
    replaceFirstLine(to, `<!-- completed-record id="${entry.id}" closed="${closed}" summary="${summary}" -->`);
    sync();
    console.log(`completed ${to}`);
  },
};

const isDirectRun = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const [command, ...args] = process.argv.slice(2);
  if (!commands[command]) {
    console.error('usage: roadmap.mjs <sync|check|new|start|complete> …');
    process.exit(2);
  }
  try {
    commands[command](args);
  } catch (error) {
    console.error(`roadmap: ${error.message}`);
    process.exit(1);
  }
}
