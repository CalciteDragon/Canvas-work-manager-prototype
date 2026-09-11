/**
 * Markdown handling the documentation site needs beyond the defaults.
 *
 * docs/templates/ is written for an agent to copy, so its prose is full of angle-bracket
 * placeholders — `# <A sentence that states the decision>`. VitePress compiles Markdown as
 * Vue, which reads those as tags and fails the build, while the rest of the documentation
 * uses real HTML (<br/> inside tables) and must keep working. So the escape is scoped to
 * the templates, and skips fenced blocks and inline code, where the brackets are already
 * literal and escaping them would show the entity instead.
 */
const escapeOutsideCode = (line) =>
  // Odd segments are inside backticks and are left alone.
  line
    .split('`')
    .map((segment, index) =>
      index % 2 === 0 ? segment.replace(/</g, '&lt;').replace(/>/g, '&gt;') : segment,
    )
    .join('`');

export const escapeTemplatePlaceholders = (md) => {
  md.core.ruler.before('normalize', 'cwm-template-placeholders', (state) => {
    if (!(state.env?.relativePath ?? '').startsWith('docs/templates/')) return;
    let inFence = false;
    let inComment = false;
    state.src = state.src
      .split('\n')
      .map((line) => {
        if (line.trimStart().startsWith('```')) {
          inFence = !inFence;
          return line;
        }
        if (inFence) return line;
        // A template's HTML comments carry the filing instructions and stay comments:
        // escaping them would print the <!-- --> markers into the page.
        const wasInComment = inComment;
        if (line.includes('<!--')) inComment = true;
        if (line.includes('-->')) inComment = false;
        return wasInComment || line.includes('<!--') ? line : escapeOutsideCode(line);
      })
      .join('\n');
  });
};

/**
 * Inline code is rendered literally, not as a Vue template.
 *
 * The web app is Angular, so the documentation quotes template syntax — `{{ section.type }}`,
 * `{{ prompt().message }}` — inside backticks. VitePress compiles a page's HTML as a Vue
 * template, which evaluates those braces against a component that has no such data and
 * fails to render the page. Fenced blocks are already protected; this does the same for
 * inline code, so quoting a template anywhere in the documentation is safe.
 */
export const literalInlineCode = (md) => {
  md.renderer.rules.code_inline = (tokens, index) =>
    `<code v-pre>${md.utils.escapeHtml(tokens[index].content)}</code>`;
};
