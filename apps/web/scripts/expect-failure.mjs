// Proves `check-design-tokens.mjs` actually bites, by running it against fixtures that
// break every rule and asserting which rules fired.
//
// A Node wrapper rather than a shell one-liner, deliberately. `node check.mjs && exit 1 ||
// exit 0` can never fail in either `cmd` or `sh`: when the checker correctly exits
// non-zero the `&&` is skipped and `||` fires `exit 0`; when it wrongly exits zero, the
// `exit 1` runs and `||` immediately swallows it into `exit 0`. Both paths pass. `!`
// negation is sh-only and `if errorlevel` is cmd-only, and this repo's primary shell is
// PowerShell.
//
// It asserts the exact **set of rule names**, not a count: a total stays green when one
// rule silently stops matching while another gains a false positive, which is precisely
// the regression a self-test exists to catch.

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const checker = join(scriptDirectory, 'check-design-tokens.mjs');
const fixtures = join(scriptDirectory, 'fixtures', 'violations');

/**
 * Exactly what the fixtures contain, as `file:line rule`. Pinning the locations — not just
 * the rule names — is what proves the **controls** stay clean, and the controls are the
 * half that matters: a `1px` hairline, `height: 100vh`, `margin: 0`, a `1fr` grid track,
 * a `surface-tan` class, "Silver" in body copy, an `<svg width="24">`,
 * `content: "hex #fff means white"`, `fill: url(#face)` and `font-family: Gold, Tan,
 * Sienna` all sit in these same files. Every one of them was a false positive at some
 * point; any of them firing again adds an entry that is not on this list.
 */
const EXPECTED = [
  // An inline `styles` block, its `template`, and a `styles` string that interpolates —
  // a single `${…}` once made the whole block invisible.
  'inline-component.ts:8 rgb-color',
  'inline-component.ts:8 literal-length',
  'inline-component.ts:9 literal-length',
  'inline-component.ts:14 hex-color',
  // Both quote styles of `style=`, plus Angular's `[style.x]` and `[ngStyle]` bindings.
  'markup.html:2 hex-color',
  'markup.html:3 literal-length',
  'markup.html:4 hex-color',
  'markup.html:5 hex-color',
  // One per colour rule…
  'style-sheet.scss:3 hex-color',
  'style-sheet.scss:4 rgb-color',
  'style-sheet.scss:5 hsl-color',
  'style-sheet.scss:6 modern-color',
  'style-sheet.scss:7 named-color',
  'style-sheet.scss:8 named-color',
  // …one per length unit that expresses a scale…
  'style-sheet.scss:9 literal-length',
  'style-sheet.scss:10 literal-length',
  'style-sheet.scss:11 literal-length',
  // …a component defining its own private palette…
  'style-sheet.scss:12 hex-color',
  // …the first declaration after a nested Sass block…
  'style-sheet.scss:15 literal-length',
  // …and a length hiding inside a transform function.
  'style-sheet.scss:17 literal-length',
];

const EXPECTED_RULES = [...new Set(EXPECTED.map((entry) => entry.split(' ')[1]))].sort();

const fail = (message) => {
  console.error(`check-design-tokens self-test: ${message}`);
  process.exit(1);
};

const result = spawnSync(process.execPath, [checker, '--root', fixtures], { encoding: 'utf8' });

if (result.status === 0) {
  fail('the checker accepted a fixture directory full of literal styling values.');
}

const reported = result.stderr
  .split('\n')
  .map((line) => /^(\S+):(\d+):\d+ (\S+)$/.exec(line.trim()))
  .filter((match) => match !== null)
  .map((match) => `${match[1]}:${match[2]} ${match[3]}`)
  .sort();

const missing = EXPECTED.filter((entry) => !reported.includes(entry));
if (missing.length > 0) fail(`these no longer fire on their fixture:\n  ${missing.join('\n  ')}`);

const unexpected = reported.filter((entry) => !EXPECTED.includes(entry));
if (unexpected.length > 0) {
  fail(`reported something the fixtures do not intend — a control, or a new false positive:\n  ${unexpected.join('\n  ')}`);
}

console.log(`check-design-tokens self-test: all ${EXPECTED_RULES.length} rules fire, controls stay clean.`);
