import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const option = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1] ?? '';
};
const sourceRoot = resolve(option('root', join(scriptDirectory, '..', 'packages', 'domain', 'src')));

/**
 * §12: a domain service must not know whether storage is JSON, whether a transport is
 * HTTP, or what a seed looks like. §8 says the same of the MCP tools, one layer out — they
 * call domain services and must never reach a repository.
 *
 * The specifier rule is an **allowlist**, not a ban list. A ban list cannot survive the
 * next dependency someone adds — the first version of this script banned `fs` and let
 * `fs/promises` straight through — and a *regex* denylist additionally misses relative
 * paths that escape the package and dynamic imports with computed specifiers, both of
 * which this walker reports.
 *
 * `--allow` and `--label` are what let a second package reuse it. The repository-binding
 * rule below only engages when `@cwm/repositories` is allowed at all, so a package that
 * may not import it is simply refused at the specifier.
 */
const ALLOWED_MODULES = new Set(option('allow', '@cwm/contracts,@cwm/repositories').split(',').filter(Boolean));
const LABEL = option('label', 'Domain code');

/**
 * `@cwm/repositories` is the one import that needs judgement: the domain is *required* to
 * import it for the repository interfaces, so the check is on the named bindings. A
 * service importing `DataStore` or `JsonTaskRepository` is a service that knows storage
 * is JSON.
 */
const ALLOWED_REPOSITORY_BINDINGS = new Set([
  'UnitOfWork',
  'ActivityRepository',
  'AgentConnectionRepository',
  'MilestoneRepository',
  'ProjectPageRepository',
  'ProjectRepository',
  'ReflectionRepository',
  'SectionRepository',
  'SectionShortcutRepository',
  'TaskRepository',
  'UserRepository',
]);

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

  /** Shared by `import`, `export … from`, `import()` and `require()`. */
  const checkSpecifier = (node, specifier) => {
    if (specifier.startsWith('.')) {
      if (!resolve(dirname(path), specifier).startsWith(sourceRoot)) {
        report(node, `relative import "${specifier}" escapes the source root`);
      }
      return false;
    }
    if (!ALLOWED_MODULES.has(specifier)) {
      report(node, `${LABEL} may not import "${specifier}"`);
      return false;
    }
    return specifier === '@cwm/repositories';
  };

  const checkRepositoryBindings = (node, bindings) => {
    // `export * from '@cwm/repositories'` would re-export the stores under a relative
    // specifier every sibling could then import cleanly. There is no binding list to
    // check, so it is refused outright.
    // `NamedImports` on an import, `NamedExports` on a re-export — different node kinds,
    // same list of names.
    if (bindings === undefined || !(ts.isNamedImports(bindings) || ts.isNamedExports(bindings))) {
      report(node, 'import the repository interfaces by name — no namespace, default, or star re-export');
      return;
    }
    for (const element of bindings.elements) {
      const imported = (element.propertyName ?? element.name).text;
      if (!ALLOWED_REPOSITORY_BINDINGS.has(imported)) {
        report(element, `"${imported}" is storage, not a repository interface`);
      }
    }
  };

  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      if (checkSpecifier(node, node.moduleSpecifier.text)) {
        checkRepositoryBindings(node, node.importClause?.namedBindings);
      }
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      // A re-export is an import that also widens the package's own surface.
      if (checkSpecifier(node, node.moduleSpecifier.text)) {
        checkRepositoryBindings(node, node.exportClause);
      }
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      const [argument] = node.arguments;
      if (argument !== undefined && ts.isStringLiteral(argument)) checkSpecifier(node, argument.text);
      else report(node, `dynamic import with a computed specifier is not allowed in ${LABEL}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

if (violations.length > 0) {
  process.stderr.write(`${LABEL} must not depend on storage, transport, or fixtures:\n${violations.join('\n')}\n`);
  process.exitCode = 1;
}
