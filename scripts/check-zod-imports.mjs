import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';

/**
 * Zod is imported as a namespace — `import * as z from 'zod'` — in code the web app bundles.
 *
 * `import { z } from 'zod'` (or the default import) binds Zod's re-exported namespace object as a
 * value, so the bundler cannot tell which of its members are used and keeps them all, including
 * `z.locales`: every translation of every error message, most of the 232.69 kB the namespace
 * import took out of the 2026-11 initial bundle. With the namespace import, esbuild follows the
 * static `z.…` accesses and drops the rest
 * (`docs/decisions/2026-11-on-demand-loading-and-prefetch.md`). Type-only imports and named
 * imports of single members (`ZodError`) are fine. Covers `import`, `import = require` and
 * `export … from` of `zod` and its subpaths.
 *
 * Usage: `node scripts/check-zod-imports.mjs --root <dir> [--root <dir> …]`.
 */
const roots = process.argv.flatMap((arg, i, all) => (arg === '--root' ? [resolve(all[i + 1])] : []));
if (roots.length === 0) {
  process.stderr.write('check-zod-imports: pass at least one --root\n');
  process.exit(2);
}

const collect = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : collect(path);
      return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
    }),
  );
  return nested.flat();
};

/** `zod` and its subpaths (`zod/v4`, `zod/mini`): each exports the same kind of `z` object. */
const isZod = (specifier) => /^zod(?:\/|$)/.test(specifier);
/** `{ z }` and `{ z as zod }` both bind the namespace object. */
const namesZ = (element) => (element.propertyName ?? element.name).text === 'z';

const violations = [];
for (const root of roots) {
  for (const path of await collect(root)) {
    const text = await readFile(path, 'utf8');
    if (!text.includes('zod')) continue;
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    for (const statement of source.statements) {
      const report = () => {
        const { line } = source.getLineAndCharacterOfPosition(statement.getStart(source));
        violations.push(`${relative(process.cwd(), path)}:${line + 1}`);
      };
      // `import z = require('zod')` binds the same object.
      if (ts.isImportEqualsDeclaration(statement)) {
        const reference = statement.moduleReference;
        if (!statement.isTypeOnly && ts.isExternalModuleReference(reference) && ts.isStringLiteral(reference.expression) && isZod(reference.expression.text)) report();
        continue;
      }
      // `export { z } from 'zod'` hands the bound object on to whoever imports this file.
      if (ts.isExportDeclaration(statement)) {
        if (statement.isTypeOnly || statement.moduleSpecifier === undefined || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
        if (!isZod(statement.moduleSpecifier.text)) continue;
        const clause = statement.exportClause;
        if (clause !== undefined && ts.isNamedExports(clause) && clause.elements.some((element) => !element.isTypeOnly && namesZ(element))) report();
        continue;
      }
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      if (!isZod(statement.moduleSpecifier.text)) continue;
      const clause = statement.importClause;
      if (clause === undefined || clause.isTypeOnly) continue;
      const bindings = clause.namedBindings;
      const valueZ =
        clause.name !== undefined ||
        (bindings !== undefined &&
          ts.isNamedImports(bindings) &&
          bindings.elements.some((element) => !element.isTypeOnly && namesZ(element)));
      if (valueZ) report();
    }
  }
}

if (violations.length > 0) {
  process.stderr.write(
    `Import Zod as a namespace (import * as z from 'zod'), not { z } or the default — the bundle keeps every locale otherwise:\n${violations.join('\n')}\n`,
  );
  process.exitCode = 1;
}
