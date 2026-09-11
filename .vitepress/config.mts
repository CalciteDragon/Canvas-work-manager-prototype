/**
 * The documentation site.
 *
 * The Markdown under docs/ stays the source of truth — readable on GitHub, edited in the
 * same change as the code (docs/documentation-protocol.md §2) — and this file only gives it
 * a navigable web surface: a sidebar derived from the folders, local search, and Mermaid
 * rendering for the diagrams already written as ```mermaid fences.
 *
 * The site root is the repository root, not docs/, because the documentation links up to
 * AGENTS.md, README.md and the spec. Rooting it here means every relative link that works
 * in the editor and on GitHub also works on the site, and scripts/check-docs.mjs stays the
 * one thing that validates them.
 */
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';
import { sidebar } from '../scripts/docs-sidebar.mjs';
import { escapeTemplatePlaceholders, literalInlineCode } from '../scripts/docs-markdown.mjs';

const SPEC = '/Canvas Work Manager — Prototype Product, Design & Development Specification';

export default withMermaid(
  defineConfig({
    // GitHub Pages serves the site under the repository name; the workflow sets DOCS_BASE.
    base: process.env.DOCS_BASE ?? '/',
    srcDir: '.',
    // Everything that is code, generated, or not documentation. docs/api is Compodoc's
    // HTML output, copied into the public directory by scripts/docs-site-assets.mjs.
    srcExclude: [
      'node_modules/**',
      'apps/**',
      'packages/**',
      'prototype/**',
      'docs/api/**',
      '.claude/**',
      '**/dist/**',
    ],
    rewrites: { 'README.md': 'index.md' },
    title: 'Canvas Work Manager',
    description: 'Prototype documentation: architecture, decisions, roadmap and guides.',
    cleanUrls: true,
    lastUpdated: true,
    // scripts/check-docs.mjs is the authority on links: it resolves every relative link
    // against the repository, including the ones into Compodoc's output. What VitePress
    // cannot know about is listed here — everything else it still catches.
    ignoreDeadLinks: [
      // Compodoc's generated HTML, served as static files rather than as pages.
      /(^|\/)api\//,
      // The templates' angle-bracket placeholders (<system>, <Name>), percent-encoded.
      /%3C/,
      // A template's own sibling links; inside docs/architecture/ the siblings exist.
      /^\.\/(why|what|how)$/,
      // documentation-protocol.md points at the templates folder, which has no index page.
      /templates\/index$/,
      // Links into the source tree, and the local servers the guides tell you to start.
      /(^|\/)(apps|packages)\//,
      /^https?:\/\/localhost/,
    ],
    markdown: {
      lineNumbers: false,
      config: (md) => {
        escapeTemplatePlaceholders(md);
        literalInlineCode(md);
      },
    },
    themeConfig: {
      nav: [
        { text: 'Architecture', link: '/docs/architecture/overview' },
        { text: 'Roadmap', link: '/docs/roadmap/goals' },
        { text: 'Decisions', link: '/docs/decisions/README' },
        { text: 'Guides', link: '/docs/guides/mcp-setup' },
        { text: 'Spec', link: SPEC },
        { text: 'API reference', link: '/docs/api/index.html', target: '_blank' },
      ],
      sidebar: sidebar(),
      search: { provider: 'local' },
      outline: 'deep',
      socialLinks: [
        { icon: 'github', link: 'https://github.com/CalciteDragon/Canvas-work-manager-prototype' },
      ],
      editLink: {
        pattern:
          'https://github.com/CalciteDragon/Canvas-work-manager-prototype/edit/main/:path',
        text: 'Edit this page on GitHub',
      },
      docFooter: { prev: 'Previous', next: 'Next' },
    },
    // Mermaid must be pre-bundled: without this the dev server hands the browser the
    // CommonJS build of one of its dependencies and no diagram renders. The "Failed to
    // resolve dependency" notes the plugin prints for mermaid's optional extras (cytoscape
    // and friends, used by diagram kinds this documentation does not use) are harmless.
    vite: {
      // With srcDir at the repository root, Vite would look for a public/ folder there;
      // the site's static files (the copied Compodoc output) live beside this config.
      publicDir: fileURLToPath(new URL('./public', import.meta.url)),
      optimizeDeps: { include: ['mermaid'] },
      ssr: { noExternal: ['mermaid'] },
    },
  }),
);
