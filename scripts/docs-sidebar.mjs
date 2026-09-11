/**
 * The documentation site's sidebar, derived from the folders rather than hand-maintained.
 *
 * docs/documentation-protocol.md gives the structure its shape — four files per system
 * folder under docs/architecture/, one entry per decision, the roadmap's three states —
 * so the sidebar can be read off the file system. A new system or decision appears in the
 * site the moment its files exist, with no config to update and nothing to forget, which
 * is the same bargain scripts/check-docs.mjs makes for the structure itself.
 *
 * Titles come from each file's first H1, so the sidebar says what the document says.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DOCS = join(ROOT, 'docs');

/** The site path for a file on disk: docs/architecture/why.md -> /docs/architecture/why */
const link = (file) => '/' + relative(ROOT, file).split(sep).join('/').replace(/\.md$/, '');

/**
 * VitePress renders a sidebar label as HTML, and docs/templates/ titles their placeholders
 * in angle brackets (`# Slice <id> — <Title>`). Left raw, those become elements, break the
 * page's markup and take the whole site's hydration down with them, so a label is escaped.
 */
const label = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The first H1, which is the document's own name for itself. */
const title = (file, fallback) => {
  const heading = readFileSync(file, 'utf8').match(/^#\s+(.+?)\s*$/m);
  return label(heading ? heading[1] : fallback);
};

const prettify = (name) => {
  const words = name.replace(/^\d+-/, '').replace(/\.md$/, '').replace(/-/g, ' ');
  return label(words.charAt(0).toUpperCase() + words.slice(1));
};

const markdownFiles = (dir) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((name) => name.endsWith('.md'))
        .sort()
        .map((name) => join(dir, name))
    : [];

const subdirectories = (dir) =>
  readdirSync(dir)
    .map((name) => join(dir, name))
    .filter((full) => statSync(full).isDirectory())
    .sort();

/**
 * One system folder: its four protocol files, then its child systems nested beneath.
 * The overview is the group's own link, so clicking the system name lands somewhere useful.
 */
const system = (dir, fallbackName) => {
  const overview = join(dir, 'overview.md');
  const items = [
    { text: 'Overview', link: link(overview) },
    ...['why.md', 'what.md', 'how.md']
      .map((name) => join(dir, name))
      .filter(existsSync)
      .map((file) => ({ text: prettify(file.split(sep).pop()), link: link(file) })),
    ...subdirectories(dir).map((child) => system(child, prettify(child.split(sep).pop()))),
  ];
  return {
    text: existsSync(overview) ? title(overview, fallbackName) : fallbackName,
    link: existsSync(overview) ? link(overview) : undefined,
    collapsed: true,
    items,
  };
};

const entries = (dir, { collapsed = true, text }) => ({
  text,
  collapsed,
  items: markdownFiles(dir)
    .filter((file) => !file.endsWith(`${sep}README.md`))
    .map((file) => ({ text: title(file, prettify(file.split(sep).pop())), link: link(file) })),
});

const architecture = () => {
  const root = system(join(DOCS, 'architecture'), 'Architecture');
  // Level 0 is the site's architecture landing page, so it is the section, not a group.
  return { text: 'Architecture', collapsed: false, link: root.link, items: root.items };
};

const roadmap = () => ({
  text: 'Roadmap',
  collapsed: false,
  link: '/docs/roadmap/README',
  items: [
    { text: 'How the roadmap works', link: '/docs/roadmap/README' },
    { text: 'Goals', link: '/docs/roadmap/goals' },
    { text: 'Progress', link: '/docs/roadmap/progress' },
    { ...entries(join(DOCS, 'roadmap', 'active'), { text: 'Active', collapsed: false }) },
    entries(join(DOCS, 'roadmap', 'planned'), { text: 'Planned' }),
    entries(join(DOCS, 'roadmap', 'completed'), { text: 'Completed' }),
  ],
});

export const sidebar = () => [
  {
    text: 'Start here',
    collapsed: false,
    items: [
      { text: 'Quickstart (README)', link: '/' },
      { text: 'Agent entry point', link: '/AGENTS' },
      { text: 'Specification', link: '/Canvas Work Manager — Prototype Product, Design & Development Specification' },
      { text: 'Documentation protocol', link: '/docs/documentation-protocol' },
    ],
  },
  architecture(),
  roadmap(),
  {
    text: 'Decisions',
    collapsed: false,
    link: '/docs/decisions/README',
    items: [entries(join(DOCS, 'decisions'), { text: 'Every decision' })],
  },
  {
    text: 'Guides',
    collapsed: false,
    items: markdownFiles(join(DOCS, 'guides')).map((file) => ({
      text: title(file, prettify(file.split(sep).pop())),
      link: link(file),
    })),
  },
  {
    text: 'Reference',
    collapsed: false,
    items: [
      { text: 'API reference (Compodoc)', link: '/docs/api/index.html', target: '_blank' },
      entries(join(DOCS, 'templates'), { text: 'Templates' }),
    ],
  },
];
