// §21: "Do not scatter literal styling values throughout components." AGENTS.md §1 makes
// that a boundary — no literal colors, spacing, or radii in component styles — and this is
// what stops it from being a rule everyone remembers differently.
//
// Modelled on `packages/domain/scripts/check-no-direct-date.mjs`: same `--root` argument,
// same `path:line:col` output, same "one job, no configuration" shape.
//
// Rules apply to **declaration values only**, never to whole files. A file-wide regex
// would flag `class="surface-tan"`, the word "Silver" in body copy, and `<svg width="24">`
// — and a checker with false positives gets worked around instead of fixed.

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const rootArgumentIndex = process.argv.indexOf('--root');
const sourceRoot = resolve(
  rootArgumentIndex === -1 ? join(scriptDirectory, '..', 'src') : process.argv[rootArgumentIndex + 1] ?? '',
);

/** The one file allowed to hold literals: it is where the tokens are defined. */
const TOKENS_FILE = resolve(sourceRoot, 'styles', '_tokens.scss');

/**
 * CSS named colors. Only the ones a person would plausibly type — the full 148 add false
 * positives (`tan`, `linen`, `plum`) for values nobody reaches for by accident.
 */
const NAMED_COLORS = [
  'aqua', 'azure', 'beige', 'black', 'blue', 'brown', 'coral', 'crimson', 'cyan', 'fuchsia',
  'gold', 'gray', 'green', 'grey', 'indigo', 'ivory', 'khaki', 'lavender', 'lime', 'magenta',
  'maroon', 'navy', 'olive', 'orange', 'orchid', 'pink', 'purple', 'red', 'salmon', 'silver',
  'skyblue', 'teal', 'tomato', 'turquoise', 'violet', 'white', 'yellow',
];

/** Properties whose lengths must be tokens. `1px` is exempt — a hairline border is not a scale. */
const LENGTH_PROPERTIES = [
  'padding', 'margin', 'gap', 'inset', 'top', 'right', 'bottom', 'left',
  'border-radius', 'box-shadow', 'width', 'height', 'font-size',
];

const RULES = [
  { name: 'hex-color', test: (value) => /#[0-9a-f]{3,8}\b/i.test(value) },
  { name: 'rgb-color', test: (value) => /\brgba?\(/i.test(value) },
  { name: 'hsl-color', test: (value) => /\bhsla?\(/i.test(value) },
  {
    name: 'named-color',
    test: (value) => new RegExp(`(^|[\\s:,(])(${NAMED_COLORS.join('|')})($|[\\s,;)])`, 'i').test(value),
  },
];

/** `padding: 12px` fails; `padding: var(--space-3)` and `border: 1px solid …` do not. */
const lengthViolation = (property, value) => {
  if (!LENGTH_PROPERTIES.some((name) => property === name || property.startsWith(`${name}-`))) return false;
  return [...value.matchAll(/(-?\d*\.?\d+)px\b/g)].some((match) => Math.abs(Number(match[1])) > 1);
};

// Comments become spaces of the same length, with newlines kept: positions in the stripped
// text then still line up with the source, so a reported line number is the real one.
const blank = (text) => text.replaceAll(/[^\n]/g, ' ');
const stripComments = (text) =>
  text.replaceAll(/\/\*[\s\S]*?\*\//g, blank).replaceAll(/(^|\s)\/\/[^\n]*/g, (match) => blank(match));

/**
 * Every `property: value` in a stylesheet, with the line and column of the value. Custom
 * property *definitions* (`--color-accent: #14161a`) are skipped — defining a token is the
 * point; using a literal instead of one is not.
 */
function* declarations(css, lineOffset = 0, columnOffset = 0) {
  const pattern = /(^|[{;])\s*(--)?([a-z-]+)\s*:\s*([^;{}]+)/gi;
  const scanned = stripComments(css);
  for (const match of scanned.matchAll(pattern)) {
    const [, , custom, property, value] = match;
    if (custom !== undefined) continue;
    const before = scanned.slice(0, match.index);
    const line = before.split('\n').length;
    yield {
      property: property.toLowerCase(),
      value,
      line: line + lineOffset,
      column: (line === 1 ? columnOffset : 0) + (match.index - before.lastIndexOf('\n')),
    };
  }
}

const checkCss = (css, file, lineOffset = 0) => {
  const findings = [];
  for (const { property, value, line, column } of declarations(css, lineOffset)) {
    for (const rule of RULES) if (rule.test(value)) findings.push({ file, line, column, rule: rule.name });
    if (lengthViolation(property, value)) findings.push({ file, line, column, rule: 'literal-length' });
  }
  return findings;
};

/** In markup only `style="…"` and `<style>` blocks are styling. Everything else is content. */
const checkMarkup = (markup, file) => {
  const findings = [];
  for (const match of markup.matchAll(/\sstyle\s*=\s*"([^"]*)"/gi)) {
    const line = markup.slice(0, match.index).split('\n').length;
    findings.push(...checkCss(`x{${match[1]}}`, file, line - 1));
  }
  for (const match of markup.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    const line = markup.slice(0, match.index).split('\n').length;
    findings.push(...checkCss(match[1], file, line - 1));
  }
  return findings;
};

/** `inlineStyleLanguage: "scss"` means a component can hide literals in its own `.ts`. */
const checkTypeScript = (source, file) => {
  const findings = [];
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const lineOf = (node) => ast.getLineAndCharacterOfPosition(node.getStart(ast)).line;

  const visit = (node) => {
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
      const text = node.name.text;
      if (text === 'styles' || text === 'template') {
        for (const literal of stringLiterals(node.initializer)) {
          findings.push(
            ...(text === 'styles'
              ? checkCss(literal.text, file, lineOf(literal))
              : checkMarkup(literal.text, file).map((finding) => ({ ...finding, line: finding.line + lineOf(literal) }))),
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return findings;
};

function* stringLiterals(node) {
  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) yield node;
  else if (ts.isArrayLiteralExpression(node)) for (const element of node.elements) yield* stringLiterals(element);
}

const collectFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return collectFiles(path);
      if (!entry.isFile() || /\.spec\.ts$/.test(entry.name)) return [];
      return /\.(?:scss|css|html|ts)$/.test(entry.name) ? [path] : [];
    }),
  );
  return nested.flat();
};

const findings = [];
for (const path of await collectFiles(sourceRoot)) {
  if (resolve(path) === TOKENS_FILE) continue;
  const source = await readFile(path, 'utf8');
  const file = relative(sourceRoot, path).replaceAll('\\', '/');
  if (/\.(?:scss|css)$/.test(path)) findings.push(...checkCss(source, file));
  else if (path.endsWith('.html')) findings.push(...checkMarkup(source, file));
  else findings.push(...checkTypeScript(source, file));
}

if (findings.length > 0) {
  console.error(
    `${findings.length} literal styling value(s) outside the design tokens (§21). Use a custom property from src/styles/_tokens.scss:`,
  );
  for (const { file, line, column, rule } of findings) console.error(`${file}:${line}:${column} ${rule}`);
  process.exitCode = 1;
}
