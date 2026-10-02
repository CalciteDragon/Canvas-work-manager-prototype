import MarkdownIt from 'markdown-it';
import { describe, expect, it } from 'vitest';
import { decodeLegacyProse, encodeLegacyProse } from './legacy-prose';

/**
 * **Legacy prose encoding** (Slice 63, docs/decisions/2026-10-schema-version-6-markdown-conversion.md).
 *
 * Two properties carry the whole conversion: the encoding is **exactly reversible**, so the source
 * keeps every byte of the old textarea, and it **renders as prose only**, so nothing typed into a
 * Rich Text section can become a heading, list, table, link or code block.
 */

const punctuation = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';

const hostile: readonly [string, string][] = [
  ['plain prose', 'Keep this light.'],
  ['every ASCII punctuation mark', punctuation],
  ['an ATX heading', '# x'],
  ['an ordered list', '1. x\n2) y'],
  ['a bullet list', '- x\n+ y\n* z'],
  ['a block quote', '> quoted'],
  ['a table', '| a | b |\n|---|---|\n| 1 | 2 |'],
  ['a compact table', '|a|b|'],
  ['setext underlines', 'Title\n===\nOther\n---'],
  ['a thematic break', '***'],
  ['a fenced block', '```js\ncode\n```'],
  ['inline HTML', '<b>bold</b> <script>x</script>'],
  ['a literal entity', '&amp; and &#32; and &copy;'],
  ['emphasis and code', '*a* _b_ `c` **d**'],
  ['a link and an autolink', '[x](https://example.com) <https://example.com>'],
  ['a trailing backslash', 'one\\\ntwo\\'],
  ['a lone backslash', '\\'],
  ['a 4-space indent', '    indented code?'],
  ['tabs', '\tlead\tmiddle\ttrail\t'],
  ['trailing spaces', 'two spaces  \nnext'],
  ['spaces on both sides', '  both  '],
  ['CRLF', 'test\r\naaa\r\n'],
  ['a lone CR', 'a\rb'],
  ['a blank line', 'para one\n\npara two'],
  ['runs of blank lines', 'a\n\n\n\nb'],
  ['leading and trailing newlines', '\n\nmiddle\n\n'],
  ['a whitespace-only line between lines', 'a\n   \nb'],
  ['NUL and control characters', 'a\u0000b\u0001c\u001fd\u007fe'],
  ['NBSP and wide space', ' lead  and　wide'],
  ['emoji', 'ship it 🚀 👍🏽'],
  ['the real data', 'test\naaa'],
];

describe('encodeLegacyProse / decodeLegacyProse', () => {
  it.each(hostile)('round-trips %s', (_name, text) => {
    expect(decodeLegacyProse(encodeLegacyProse(text))).toBe(text);
  });

  it.each(['', ' ', '   ', '\t', '\n\n', ' \r\n ', '  ', '　\t', '﻿', ' '])(
    'stores whitespace-only text %j raw',
    (text) => {
      expect(encodeLegacyProse(text)).toBe(text);
      expect(decodeLegacyProse(text)).toBe(text);
    },
  );

  it('escapes punctuation, encodes edge whitespace and CR, and hard-breaks only between non-empty lines', () => {
    expect(encodeLegacyProse('Keep this light.')).toBe('Keep this light\\.');
    expect(encodeLegacyProse('  a b\t')).toBe('&#32;&#32;a b&#9;');
    expect(encodeLegacyProse('x\r')).toBe('x&#13;');
    expect(encodeLegacyProse('a\nb\n\nc')).toBe('a\\\nb\n\nc');
  });

  it.each([
    ['an unescaped special character', 'a.b'],
    ['a dangling backslash', 'abc\\'],
    ['a backslash before a letter', '\\a'],
    ['an unknown entity', 'a&#33;b'],
    ['a named entity', 'a&amp;b'],
    ['an interior space reference', 'a&#32;b'],
    ['a raw leading space', ' a'],
    ['a raw trailing tab', 'a\t'],
    ['a raw CR', 'a\rb'],
    ['a plain newline between non-empty lines', 'a\nb'],
    ['a hard break beside a blank line', 'a\\\n\nb'],
    ['an encoded whitespace-only text', '&#32;'],
  ])('rejects %s', (_name, source) => {
    expect(() => decodeLegacyProse(source)).toThrow(TypeError);
  });
});

/**
 * **The render proof.** The options are the web renderer's (`markdown-renderer.ts`): `html`,
 * `linkify` and `typographer` off, `breaks` off. Copied rather than imported, because the renderer
 * lives in the web app; `markdown-renderer.spec.ts` renders frozen encoded strings through the real
 * `renderMarkdown` to close that gap.
 */
const md = new MarkdownIt({ html: false, linkify: false, typographer: false }).disable('image');

/** JavaScript's whitespace, the set markdown-it's paragraph trim uses. */
const normalise = (value: string): string => value.replace(/\s+/g, ' ').trim();

describe('encoded legacy prose renders as prose only', () => {
  const visible = hostile.filter(([, text]) => text.trim() !== '');

  it.each(visible)('%s', (_name, text) => {
    const tokens = md.parse(encodeLegacyProse(text), {});
    const paragraphs: string[] = [];
    let hardbreaks = 0;
    for (const token of tokens) {
      expect(['paragraph_open', 'paragraph_close', 'inline']).toContain(token.type);
      if (token.type !== 'inline') continue;
      let paragraph = '';
      for (const child of token.children ?? []) {
        expect(['text', 'softbreak', 'hardbreak']).toContain(child.type);
        if (child.type === 'text') paragraph += child.content;
        else {
          paragraph += '\n';
          if (child.type === 'hardbreak') hardbreaks += 1;
        }
      }
      paragraphs.push(paragraph);
    }

    // markdown-it normalises NUL to U+FFFD; that loss is accepted and recorded in the decision.
    expect(normalise(paragraphs.join('\n'))).toBe(normalise(text.replace(/\u0000/g, '�')));
    const lines = text.split('\n');
    const joins = lines.slice(1).filter((line, index) => line !== '' && lines[index] !== '').length;
    expect(hardbreaks).toBe(joins);
  });
});
