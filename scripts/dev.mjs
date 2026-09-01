/**
 * `pnpm dev` used to start the web app and the host together under `concurrently`. It no
 * longer starts anything, because starting them together is what broke them.
 *
 * `concurrently` gives each child a piped stdin that never delivers data and never closes.
 * `tsx watch` — the host's dev command — hangs on exactly that: it spawns the child, the
 * child loads its modules, and then nothing. No listening line, no error, no exit. And
 * because the host never *exits*, `--kill-others` never fires, so the web half keeps
 * running and the app looks up while every API call answers `ERR_CONNECTION_REFUSED`.
 * `tsx` without `watch` is fine, and `tsx watch` with a terminal or `/dev/null` on stdin is
 * fine. See docs/decisions/2026-08-web-and-host-start-separately.md.
 *
 * This script exists rather than deleting the `dev` entry so that the muscle memory, and
 * every `pnpm dev` still written in the spec and the older slice records, lands on the
 * answer instead of on npm's "command not found".
 */
const lines = [
  '',
  '  `pnpm dev` is gone — web and host start separately now, in two terminals:',
  '',
  '    pnpm dev:web    →  http://localhost:4200',
  '    pnpm dev:host   →  http://127.0.0.1:4310',
  '',
  '  Order does not matter; the web app retries until the host answers.',
  '',
  '  Why: `concurrently` hands its children a piped stdin, and `tsx watch` hangs on one',
  '  silently — the host never binds and never exits, so the app comes up with no API.',
  '  docs/decisions/2026-08-web-and-host-start-separately.md',
  '',
];
console.error(lines.join('\n'));
process.exit(1);
