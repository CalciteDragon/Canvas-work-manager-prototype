import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const rootArgumentIndex = process.argv.indexOf('--root');
const sourceRoot = resolve(
  rootArgumentIndex === -1 ? join(scriptDirectory, '..', 'src') : process.argv[rootArgumentIndex + 1] ?? '',
);

/**
 * §12: a domain service must not know whether storage is JSON, whether a transport is
 * HTTP, or what a seed looks like. The only import that needs judgement is
 * `@cwm/repositories` — the domain is *required* to import it for the repository
 * interfaces, so the check is on the named bindings, not the specifier.
 */
const ALLOWED_REPOSITORY_BINDINGS = new Set([
  'UnitOfWork',
  'ActivityRepository',
  'AgentConnectionRepository',
  'MilestoneRepository',
  'ProjectRepository',
  'ReflectionRepository',
  'SectionRepository',
  'TaskRepository',
  'UserRepository',
]);

const BANNED_MODULES = new Set(['fs', 'path', 'http', 'https', '@cwm/prototype-data']);

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
  const sourceText = await readFile(path, 'utf8');
  const sourceFile = ts.createSourceFile(path, sourceText, ts.ScriptTarget.Latest, true);
  const report = (node, message) => {
    const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    violations.push(`${relative(sourceRoot, path)}:${location.line + 1}:${location.character + 1} — ${message}`);
  };

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const specifier = statement.moduleSpecifier.text;

    if (specifier.startsWith('node:') || BANNED_MODULES.has(specifier)) {
      report(statement, `domain code must not import "${specifier}"`);
      continue;
    }

    if (specifier.startsWith('.') && !resolve(dirname(path), specifier).startsWith(sourceRoot)) {
      report(statement, `relative import "${specifier}" escapes the domain source root`);
      continue;
    }

    if (specifier !== '@cwm/repositories') continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined || !ts.isNamedImports(bindings)) {
      report(statement, 'import the repository interfaces by name, not as a namespace or default');
      continue;
    }
    for (const element of bindings.elements) {
      const imported = (element.propertyName ?? element.name).text;
      if (!ALLOWED_REPOSITORY_BINDINGS.has(imported)) {
        report(element, `"${imported}" is storage, not a repository interface`);
      }
    }
  }
}

if (violations.length > 0) {
  process.stderr.write(`Domain code must not depend on storage, transport, or fixtures:\n${violations.join('\n')}\n`);
  process.exitCode = 1;
}
