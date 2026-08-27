// §21: "Do not scatter literal styling values throughout components." AGENTS.md §1 makes
// that a boundary — no literal colors, spacing, or radii in component styles — and this is
// what stops it from being a rule everyone remembers differently.
//
// Modelled on `packages/domain/scripts/check-no-direct-date.mjs`: same `--root` argument,
// same `path:line:col` output, same "one job, no configuration" shape.
//
// Rules apply to **declaration values only**, never to whole files. A file-wide regex
// would flag `class="surface-tan"`, the word "Silver" in body copy, and `<svg width="24">`
// — and a checker with false positives gets worked around instead of fixed. Scoping to
// values is also what makes an exhaustive named-color list safe.
//
// The first version of this checker passed a probe file containing eleven deliberate
// literals. Each hole it had is now a fixture in `scripts/fixtures/violations/`, because a
// lint you have not watched fail on every violation form is a lint you are guessing about.

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
 * Every CSS named color. Exhaustive is safe now that rules only see declaration values —
 * a `.surface-tan` selector and the word "Silver" in body copy are both out of scope, and
 * quoted strings inside a value (`grid-template-areas: 'side workspace'`) are stripped
 * before this runs.
 */
const NAMED_COLORS = `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue
blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan
darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange
darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise
darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia
gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory
khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow
lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray
lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue
mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred
midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid
palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple
rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue
slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat
white whitesmoke yellow yellowgreen`
  .split(/\s+/)
  .filter(Boolean);

/**
 * Properties whose lengths must be tokens. §22 names "spacing density", "radius",
 * "font scale" and "sidebar width" as Design Lab controls — every one of them is a length
 * a component would otherwise hardcode.
 */
const LENGTH_PROPERTIES = [
  'padding', 'margin', 'gap', 'inset', 'top', 'right', 'bottom', 'left',
  'border-radius', 'box-shadow', 'width', 'height', 'font-size', 'letter-spacing',
  'text-indent', 'translate', 'flex-basis', 'transform',
];

/**
 * Units that express a *scale* and must therefore come from a token. Fractions of the
 * viewport or the container do not: `height: 100vh` on the shell grid and `width: 100%`
 * are layout, not design values, and no Design Lab control would ever move them.
 */
const SCALE_UNIT = /(-?\d*\.?\d+)(px|rem|em|ch|ex|pt|pc|cm|mm|in|q)\b/gi;

const RULES = [
  { name: 'hex-color', test: (value) => /#[0-9a-f]{3,8}\b/i.test(value) },
  { name: 'rgb-color', test: (value) => /\brgba?\(/i.test(value) },
  { name: 'hsl-color', test: (value) => /\bhsla?\(/i.test(value) },
  // oklch/lab/lch/hwb and color()/color-mix() are as literal as a hex triplet.
  { name: 'modern-color', test: (value) => /\b(?:oklch|oklab|lab|lch|hwb|color|color-mix)\(/i.test(value) },
  {
    name: 'named-color',
    // Skipped for `font-family`/`font`: Gold, Tan, Sienna, Linen, Snow and Thistle are all
    // real typefaces, and an exhaustive colour list turns every one of them into noise.
    skipFor: (property) => property === 'font-family' || property === 'font',
    test: (value) => new RegExp(`(^|[\\s:,(])(${NAMED_COLORS.join('|')})($|[\\s,;)])`, 'i').test(value),
  },
];

/**
 * What a rule is allowed to see. Quoted text is content, not styling
 * (`content: "hex #fff means white"`, `grid-template-areas: 'side workspace'`), and
 * `url(#face)` is an SVG fragment reference — a paint server or a filter, not a colour.
 * Both were false positives, and a checker that cries wolf gets worked around, not fixed.
 */
const styleValue = (value) => value.replaceAll(/'[^']*'|"[^"]*"/g, ' ').replaceAll(/\burl\([^)]*\)/gi, ' ');

/**
 * `padding: 12px` and `max-width: 40rem` fail; `padding: var(--space-3)`,
 * `border: 1px solid …` (a hairline is not a scale) and `height: 100vh` do not.
 */
const lengthViolation = (property, value) => {
  const matches = LENGTH_PROPERTIES.some(
    (name) =>
      property === name ||
      property.startsWith(`${name}-`) ||
      property.endsWith(`-${name}`) || // max-width, min-height, row-gap
      property === `inline-size` ||
      property === `block-size`,
  );
  return matches && hasScaleLength(value);
};

/** Any length that expresses a scale, ignoring `0` and a `1px` hairline. */
const hasScaleLength = (value) =>
  [...value.matchAll(SCALE_UNIT)].some(([, size, unit]) => {
    const magnitude = Math.abs(Number(size));
    return magnitude !== 0 && !(unit.toLowerCase() === 'px' && magnitude <= 1);
  });

// Comments become spaces of the same length, with newlines kept: positions in the stripped
// text then still line up with the source, so a reported line number is the real one.
const blank = (text) => text.replaceAll(/[^\n]/g, ' ');
const stripComments = (text) =>
  text.replaceAll(/\/\*[\s\S]*?\*\//g, blank).replaceAll(/(^|\s)\/\/[^\n]*/g, (match) => blank(match));

/**
 * Every `property: value` in a stylesheet, with the line and column of the value.
 *
 * `}` is in the anchor as well as `{` and `;`: without it, the first declaration after a
 * nested Sass block is invisible, which is a very ordinary thing to write.
 *
 * Custom property definitions are checked like any other declaration. The tokens file is
 * skipped whole; everywhere else `--my-accent: #ff0000` in a component is exactly the
 * scattered literal §21 forbids — a private palette wearing a token's clothes.
 */
function* declarations(css, { lineOffset = 0 } = {}) {
  const pattern = /(^|[{;}])\s*(--)?([a-z-]+)\s*:\s*([^;{}]+)/gi;
  const scanned = stripComments(css);
  for (const match of scanned.matchAll(pattern)) {
    const [, , custom, property, value] = match;
    // Measured from the property, not from the match start: the anchor may be a `}` on
    // the previous line, and a finding should point at the declaration itself.
    const before = scanned.slice(0, match.index + match[0].indexOf(property));
    const line = before.split('\n').length;
    yield {
      property: (custom ?? '') + property.toLowerCase(),
      value,
      line: line + lineOffset,
      column: before.length - before.lastIndexOf('\n'),
    };
  }
}

const checkCss = (css, file, options = {}) => {
  const findings = [];
  for (const { property, value, line, column } of declarations(css, options)) {
    const scanned = styleValue(value);
    const bare = property.replace(/^--/, '');
    for (const rule of RULES) {
      if (rule.skipFor?.(bare)) continue;
      if (rule.test(scanned)) findings.push({ file, line, column, rule: rule.name });
    }
    if (lengthViolation(bare, scanned)) findings.push({ file, line, column, rule: 'literal-length' });
  }
  return findings;
};

/**
 * In markup, only styling positions are checked. That means the plain `style` attribute in
 * either quote style, **and** Angular's binding forms — `[style.color]`, `[style]` and
 * `[ngStyle]` are how a component would most naturally sneak a literal past a checker that
 * only knew about `style="…"`.
 */
const checkMarkup = (markup, file) => {
  const findings = [];
  const at = (index) => markup.slice(0, index).split('\n').length - 1;

  for (const match of markup.matchAll(/\sstyle\s*=\s*(["'])([^"']*)\1/gi)) {
    findings.push(...checkCss(`x{${match[2]}}`, file, { lineOffset: at(match.index) }));
  }
  // [style.color]="'#f00'", [style]="…", [ngStyle]="{background: '#123456'}".
  // These get their own pass rather than going through `checkCss`: a bound style value is
  // *made of* quoted strings, so the quote-stripping that keeps `content: "…"` from being
  // a false positive would hide the literal entirely. Quotes and braces are removed and
  // every rule runs against what is left, with lengths always checked — there is no
  // property name to decide by.
  for (const match of markup.matchAll(/\[(?:style(?:\.[a-z-]+)?|ngStyle)\]\s*=\s*(["'])([\s\S]*?)\1/gi)) {
    const expression = match[2].replaceAll(/['"{}]/g, ' ');
    const line = at(match.index) + 1;
    const column = match.index - markup.slice(0, match.index).lastIndexOf('\n');
    for (const rule of RULES) {
      if (rule.test(expression)) findings.push({ file, line, column, rule: rule.name });
    }
    if (hasScaleLength(expression)) findings.push({ file, line, column, rule: 'literal-length' });
  }
  for (const match of markup.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    findings.push(...checkCss(match[1], file, { lineOffset: at(match.index) }));
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
      const kind = node.name.text;
      if (kind === 'styles' || kind === 'template') {
        for (const { text, node: literal } of styleTexts(node.initializer)) {
          const found = kind === 'styles' ? checkCss(text, file) : checkMarkup(text, file);
          findings.push(...found.map((finding) => ({ ...finding, line: finding.line + lineOf(literal) })));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return findings;
};

/**
 * The text of a `styles`/`template` initializer. Template *expressions* count: a single
 * `${…}` anywhere in the string made the entire block invisible to the first version of
 * this checker. Interpolations are replaced by a placeholder so the surrounding CSS still
 * parses as declarations.
 */
function* styleTexts(node) {
  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    yield { text: node.text, node };
  } else if (ts.isTemplateExpression(node)) {
    yield { text: node.head.text + node.templateSpans.map((span) => `EXPR${span.literal.text}`).join(''), node };
  } else if (ts.isArrayLiteralExpression(node)) {
    for (const element of node.elements) yield* styleTexts(element);
  }
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
  const isTokensFile = resolve(path) === TOKENS_FILE;
  const source = await readFile(path, 'utf8');
  const file = relative(sourceRoot, path).replaceAll('\\', '/');
  if (/\.(?:scss|css)$/.test(path)) {
    if (isTokensFile) continue;
    findings.push(...checkCss(source, file));
  } else if (path.endsWith('.html')) findings.push(...checkMarkup(source, file));
  else findings.push(...checkTypeScript(source, file));
}

if (findings.length > 0) {
  console.error(
    `${findings.length} literal styling value(s) outside the design tokens (§21). Use a custom property from src/styles/_tokens.scss:`,
  );
  for (const { file, line, column, rule } of findings) console.error(`${file}:${line}:${column} ${rule}`);
  process.exitCode = 1;
}
