import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const rootArgumentIndex = process.argv.indexOf('--root');
const sourceRoot = resolve(
  rootArgumentIndex === -1 ? join(scriptDirectory, '..', 'src') : process.argv[rootArgumentIndex + 1] ?? '',
);
const allowedClockPath = resolve(sourceRoot, 'clock.ts');

const collectTypeScriptFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return collectTypeScriptFiles(path);
      if (!entry.isFile() || !entry.name.endsWith('.ts') || /\.(?:test|spec)\.ts$/.test(entry.name)) return [];
      return [path];
    }),
  );
  return nested.flat();
};

const violations = [];
for (const path of await collectTypeScriptFiles(sourceRoot)) {
  if (resolve(path) === allowedClockPath) continue;
  const sourceText = await readFile(path, 'utf8');
  const sourceFile = ts.createSourceFile(path, sourceText, ts.ScriptTarget.Latest, true);
  const visit = (node) => {
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Date') {
      const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      violations.push(`${relative(sourceRoot, path)}:${location.line + 1}:${location.character + 1}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

if (violations.length > 0) {
  process.stderr.write(
    `Domain code must use the injected Clock instead of direct Date construction:\n${violations.join('\n')}\n`,
  );
  process.exitCode = 1;
}
