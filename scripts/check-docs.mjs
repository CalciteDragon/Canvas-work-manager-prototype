/**
 * The documentation structure check, run by `pnpm lint` and `pnpm docs:check`.
 *
 * Documentation in this repository is state, not commentary (AGENTS.md), and stale or
 * broken documentation is a defect with the severity of a failing test. This script makes
 * the structural half of that mechanical, so the reviewer's attention goes to the prose:
 *
 *   1. Every folder under docs/architecture/ is one system and carries exactly the four
 *      files the protocol names — overview.md, why.md, what.md, how.md — and every
 *      overview links to each child system's overview.
 *   2. Every relative Markdown link in AGENTS.md, README.md and docs/ resolves.
 *   3. Links into the Compodoc output (docs/api/…) resolve when it has been built, and
 *      otherwise name a symbol that exists in the sources — so a renamed class breaks the
 *      check without anyone having run `pnpm docs:api`.
 *   4. AGENTS.md links the documentation entry points it promises.
 *   5. The roadmap's plans carry a well-formed state marker and progress.md's board is in
 *      sync with the folders (scripts/roadmap.mjs check).
 *   6. docs/decisions/README.md indexes every decision entry, and each entry carries the
 *      six §78 sections.
 *   7. The templates the protocol tells an agent to copy exist.
 *   8. Every ```mermaid fence parses, because a diagram that does not renders as blank
 *      space on the site rather than as an error.
 *
 * The rules are described for people in docs/documentation-protocol.md; keep the two in
 * step when one changes.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check as checkRoadmap, ROOT } from './roadmap.mjs';

const DOCS = join(ROOT, 'docs');
const ARCHITECTURE = join(DOCS, 'architecture');
const API = join(DOCS, 'api');
const REQUIRED_FILES = ['overview.md', 'why.md', 'what.md', 'how.md'];
const TEMPLATES = ['system-overview.md', 'system-why.md', 'system-what.md', 'system-how.md', 'implementation-plan.md', 'decision.md'];
const AGENTS_MUST_LINK = [
  'docs/architecture/overview.md',
  'docs/roadmap/README.md',
  'docs/roadmap/progress.md',
  'docs/roadmap/goals.md',
  'docs/decisions/README.md',
  'docs/documentation-protocol.md',
];
const DECISION_SECTIONS = ['Question', 'Options tested', 'What we learned', 'Current decision', 'Confidence', 'Revisit when'];
const SOURCE_ROOTS = ['apps', 'packages'];
const SOURCE_SKIP = new Set(['node_modules', 'dist', 'storybook-static', '.angular', 'test-results', 'playwright-report', 'testing', 'test']);

const problems = [];
const rel = (p) => relative(ROOT, p).split(sep).join('/');
const problem = (file, message) => problems.push(`${rel(file)}: ${message}`);
const read = (p) => readFileSync(p, 'utf8').replace(/\r\n?/g, '\n');

const walk = (dir, keep) => {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!keep(full, true)) continue;
      out.push(...walk(full, keep));
    } else if (keep(full, false)) out.push(full);
  }
  return out;
};
const subdirectories = (dir) => readdirSync(dir).map((n) => join(dir, n)).filter((p) => statSync(p).isDirectory());
const directories = (dir) => [dir, ...subdirectories(dir).flatMap(directories)];

// 1. The architecture tree.
const architectureDirs = directories(ARCHITECTURE);
for (const dir of architectureDirs) {
  for (const name of REQUIRED_FILES) if (!existsSync(join(dir, name))) problem(dir, `missing ${name}`);
  for (const name of readdirSync(dir)) {
    if (name.endsWith('.md') && !REQUIRED_FILES.includes(name)) {
      problem(join(dir, name), 'only overview/why/what/how belong in a system folder; fold this into one of them or make a subsystem folder');
    }
  }
  const overview = join(dir, 'overview.md');
  if (existsSync(overview)) {
    const text = read(overview);
    for (const child of subdirectories(dir)) {
      const target = `${relative(dir, child)}/overview.md`;
      if (!text.includes(`](${target})`)) problem(overview, `must link its subsystem: [${target}](${target})`);
    }
  }
}

// 3. Compodoc links: a symbol index over the sources, used only when docs/api/ is absent.
let symbols;
const symbolIndex = () => {
  if (symbols) return symbols;
  symbols = new Set();
  const declaration = /\b(?:class|interface|function|const|let|enum|type)\s+([A-Za-z_$][\w$]*)/g;
  for (const root of SOURCE_ROOTS) {
    const files = walk(join(ROOT, root), (p, isDir) => {
      const name = p.split(sep).at(-1);
      if (isDir) return !SOURCE_SKIP.has(name);
      return name.endsWith('.ts') && !/\.(spec|test|stories)\.ts$/.test(name);
    });
    for (const file of files) for (const m of read(file).matchAll(declaration)) symbols.add(m[1]);
  }
  return symbols;
};
const GENERIC_API_PAGES = /^(index|overview|modules|routes|coverage|properties|architecture)\.html$/;
const checkApiLink = (file, target) => {
  const [path, fragment] = target.split('#');
  if (existsSync(join(API, 'index.html'))) {
    const page = join(API, path);
    if (!existsSync(page)) problem(file, `compodoc page not found: docs/api/${path} (rebuild with pnpm docs:api, or fix the symbol)`);
    else if (fragment && ![...read(page).matchAll(/\b(?:id|name)=["']([^"']+)["']/g)].some((m) => m[1] === fragment)) {
      problem(file, `compodoc fragment not found: docs/api/${path}#${fragment} (rebuild with pnpm docs:api, or fix the symbol)`);
    }
    return;
  }
  if (GENERIC_API_PAGES.test(path)) return;
  let symbol;
  const kind = path.match(/^(classes|components|injectables|interfaces|directives|pipes|guards)\/([A-Za-z_$][\w$]*?)(?:-\d+)?\.html$/);
  const misc = path.match(/^miscellaneous\/(functions|variables|typealiases|enumerations)\.html$/);
  if (kind) symbol = kind[2];
  else if (misc) symbol = fragment;
  else return problem(file, `unrecognised compodoc path: docs/api/${target}`);
  if (!symbol) return; // a bare miscellaneous page is fine
  if (!symbolIndex().has(symbol)) problem(file, `compodoc link names a symbol not declared in the sources: ${symbol} (docs/api/${target})`);
};

// 2. Every relative link resolves.
const docFiles = [
  join(ROOT, 'AGENTS.md'),
  join(ROOT, 'README.md'),
  ...walk(DOCS, (p, isDir) => (isDir ? !['api', 'templates'].includes(p.split(sep).at(-1)) : p.endsWith('.md'))),
];
const LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
// A frozen record may link to source files that later slices moved or deleted; the record
// is history and is not edited to follow them. Its links into docs/ are still checked.
const isFrozenRecord = (file) => rel(file).startsWith('docs/roadmap/completed/');
for (const file of docFiles) {
  let fenced = false;
  for (const rawLine of read(file).split('\n')) {
    if (/^\s*```/.test(rawLine)) fenced = !fenced;
    if (fenced) continue;
    const line = rawLine.replace(/`[^`]*`/g, ''); // inline code is not a link
    for (const m of line.matchAll(LINK)) {
      const target = m[1];
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue;
      const resolved = resolve(dirname(file), decodeURI(target.split('#')[0]));
      const fromRoot = rel(resolved);
      if (fromRoot.startsWith('docs/api/')) {
        const fragment = target.split('#')[1];
        checkApiLink(file, fromRoot.slice('docs/api/'.length) + (fragment ? `#${decodeURI(fragment)}` : ''));
        continue;
      }
      if (isFrozenRecord(file) && !fromRoot.startsWith('docs/') && !/\.md$/i.test(fromRoot)) continue;
      if (!existsSync(resolved)) problem(file, `broken link: ${target}`);
    }
  }
}

// 4. AGENTS.md links the entry points.
const agents = read(join(ROOT, 'AGENTS.md'));
for (const target of AGENTS_MUST_LINK) if (!agents.includes(`](${target})`)) problem(join(ROOT, 'AGENTS.md'), `must link ${target}`);

// 5. The roadmap.
for (const p of checkRoadmap()) problems.push(`docs/roadmap: ${p}`);

// 6. Decisions: indexed and in the §78 shape.
const decisionsDir = join(DOCS, 'decisions');
const decisionIndex = join(decisionsDir, 'README.md');
const index = existsSync(decisionIndex) ? read(decisionIndex) : (problem(decisionIndex, 'missing'), '');
for (const name of readdirSync(decisionsDir).filter((n) => n.endsWith('.md') && n !== 'README.md')) {
  if (!index.includes(`](${name})`)) problem(decisionIndex, `does not list ${name}`);
  const text = read(join(decisionsDir, name));
  for (const section of DECISION_SECTIONS) {
    if (!new RegExp(`^(?:#{1,3} |\\*\\*)${section}(?:\\*\\*)?\\s*$`, 'm').test(text)) problem(join(decisionsDir, name), `missing the §78 section "${section}"`);
  }
}

// 7. Templates.
for (const name of TEMPLATES) if (!existsSync(join(DOCS, 'templates', name))) problem(join(DOCS, 'templates', name), 'template missing');

// 8. Every ```mermaid fence parses.
//
// A diagram that fails to parse does not announce itself: vitepress-plugin-mermaid catches
// the throw and leaves the container empty, so the page shows a heading followed by blank
// space and only the browser console knows. Parsing every fence here — with the same
// mermaid the site renders with — turns that silence into a failing check. The usual cause
// is punctuation mermaid reads as syntax: a ';' inside a sequence diagram message ends the
// message and starts a new statement.
const mermaidBlocks = [];
for (const file of [...docFiles, ...walk(join(DOCS, 'templates'), (p, isDir) => isDir || p.endsWith('.md'))]) {
  const lines = read(file).split('\n');
  let open = -1;
  for (const [i, line] of lines.entries()) {
    if (open < 0) {
      if (/^\s*```mermaid\s*$/.test(line)) open = i;
    } else if (/^\s*```\s*$/.test(line)) {
      mermaidBlocks.push({ file, line: open + 2, text: lines.slice(open + 1, i).join('\n') });
      open = -1;
    }
  }
  if (open >= 0) problem(file, `unterminated \`\`\`mermaid fence opened at line ${open + 1}`);
}
if (mermaidBlocks.length) {
  // Mermaid sanitises every label through DOMPurify, which needs a window to exist before
  // mermaid is imported — hence jsdom, and hence the import order below.
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><body></body>');
  globalThis.window ??= dom.window;
  globalThis.document ??= dom.window.document;
  const mermaid = (await import('mermaid')).default;
  for (const block of mermaidBlocks) {
    try {
      await mermaid.parse(block.text);
    } catch (error) {
      // Mermaid reports "Parse error on line N" counted from the start of the fence, and
      // puts what it expected on the last line; point at the line in the file instead.
      const lines = String(error?.message ?? error).split('\n').map((l) => l.trim()).filter(Boolean);
      const within = Number(lines[0]?.match(/on line (\d+)/)?.[1]);
      const where = Number.isFinite(within) ? block.line + within - 1 : block.line;
      // The "Expecting …" list runs to every token in the grammar; only what it got helps.
      const got = lines.at(-1)?.match(/got '(.+)'$/)?.[1];
      const detail = got ? `unexpected ${JSON.stringify(got)}` : lines.join(' ');
      problem(block.file, `the mermaid diagram at line ${block.line} does not parse (line ${where}): ${detail}`);
    }
  }
}

if (problems.length) {
  for (const p of problems) console.error(`docs: ${p}`);
  console.error(`\ndocs: ${problems.length} problem(s). See docs/documentation-protocol.md.`);
  process.exit(1);
}
console.log(`docs: ok — ${architectureDirs.length} system folders, ${docFiles.length} documents checked`);
