/**
 * Mounts the generated Compodoc reference inside the documentation site.
 *
 * docs/api/ is Compodoc's output (git-ignored, rebuilt by `pnpm docs:api`) and the
 * architecture pages link into it with relative paths like ../../api/classes/TaskService.html.
 * Copying it to .vitepress/public/docs/api makes it static content of the site at exactly
 * the path those links resolve to, so one build serves both halves of the documentation
 * and nothing has to be rewritten.
 */
import { cpSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const source = join(ROOT, 'docs', 'api');
const destination = join(ROOT, '.vitepress', 'public', 'docs', 'api');

if (!existsSync(source)) {
  console.log('docs/api is not built; run `pnpm docs:api` to include the API reference.');
  process.exit(0);
}

rmSync(destination, { recursive: true, force: true });
cpSync(source, destination, { recursive: true });
console.log('Copied docs/api into the documentation site.');
