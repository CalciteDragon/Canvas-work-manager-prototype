import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * AGENTS.md §1: **"MCP tools call domain services, never repositories directly."**
 *
 * That is this slice's central claim, and it cannot be enforced by the package manifest —
 * the test harness legitimately dev-depends on `@cwm/repositories` to build a store. So it
 * is enforced here, over `src/` only, the way `packages/domain` enforces its own boundary
 * rather than trusting inspection.
 *
 * Matched on **import and export specifiers**, never on free text: `tool.ts`'s own doc
 * comment says "no repository, no store, no clock", and a substring scan would fail on the
 * sentence explaining the rule it is checking.
 */
const SOURCE_ROOT = fileURLToPath(new URL('.', import.meta.url));

const BANNED = [
  { pattern: /^@cwm\/repositories/, why: 'a tool that reads storage directly bypasses the domain’s scoping and permission checks' },
  { pattern: /^@cwm\/prototype-data/, why: 'seeds and fixture tokens are test material, not tool material' },
  { pattern: /^node:/, why: 'a transport-free registry has no business touching the platform' },
  { pattern: /^(?:fs|path|http|https|net|crypto|child_process|os)(?:\/|$)/, why: 'the same, reached by a bare builtin name' },
];

/** `from '…'`, a bare `import '…'`, `export … from '…'`, and `import('…')`. */
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;

const sourceFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      if (!entry.isFile() || !entry.name.endsWith('.ts') || /\.test\.ts$/.test(entry.name)) return [];
      return [path];
    }),
  );
  return nested.flat();
};

describe('the tool package’s import boundary', () => {
  it('scans a source tree that is actually there', async () => {
    // A scanner that silently found no files would pass forever.
    expect((await sourceFiles(SOURCE_ROOT)).length).toBeGreaterThanOrEqual(7);
  });

  it('lets no tool reach past the domain services', async () => {
    const violations: string[] = [];

    for (const path of await sourceFiles(SOURCE_ROOT)) {
      const source = await readFile(path, 'utf8');
      for (const [, specifier] of source.matchAll(SPECIFIER)) {
        const banned = BANNED.find(({ pattern }) => pattern.test(specifier!));
        if (banned !== undefined) violations.push(`${path.slice(SOURCE_ROOT.length)} imports "${specifier}" — ${banned.why}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('would catch a repository import if one appeared', () => {
    const smuggled = "export { JsonTaskRepository } from '@cwm/repositories';";

    const specifiers = [...smuggled.matchAll(SPECIFIER)].map(([, specifier]) => specifier!);

    expect(specifiers).toEqual(['@cwm/repositories']);
    expect(BANNED.some(({ pattern }) => pattern.test(specifiers[0]!))).toBe(true);
  });

  it('does not trip on prose that merely mentions a repository', () => {
    const comment = '/** No repository, no store — see @cwm/repositories for why. */';

    expect([...comment.matchAll(SPECIFIER)]).toEqual([]);
  });
});
