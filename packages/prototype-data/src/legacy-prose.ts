/**
 * **Legacy prose as Markdown source** (§14, §29; Slice 63).
 *
 * Rich Text was a plain textarea. Its prose becomes Markdown source by one fixed, reversible rule
 * that escapes everything rather than guessing which characters matter, so nothing typed into a
 * textarea can become a heading, list, table, link or code block
 * (docs/decisions/2026-10-schema-version-6-markdown-conversion.md). Per line, split on `\n`:
 *
 * - every ASCII punctuation character — CommonMark's escapable set — becomes `\` + the character;
 * - every leading and trailing space or tab becomes `&#32;` or `&#9;`, so no indent opens a code
 *   block and no trailing spaces make a break; a literal `&` is always `\&`, so these cannot be
 *   confused with typed text;
 * - `\r` anywhere becomes `&#13;`, so CRLF prose decodes exactly.
 *
 * A line break between two non-empty lines becomes `\` + newline, a CommonMark hard break; a break
 * beside an empty line stays a plain newline, so blank lines remain paragraph breaks.
 *
 * Whitespace-only text — JavaScript's `trim`, the predicate recovery and the renderer use — is stored
 * raw, so a blank textarea stays blank to Archive and to "No notes yet." Any encoding of non-blank
 * text holds a non-whitespace character, so the two cases cannot be confused.
 *
 * Frozen with the v5→v6 converter: it is the rule old prose was converted by, not a general
 * Markdown escaper, and must not change with the contracts.
 */

const PUNCTUATION = new Set('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~');

const REFERENCES: Readonly<Record<string, string>> = { ' ': '&#32;', '\t': '&#9;', '\r': '&#13;' };

const isBlank = (text: string): boolean => text.trim() === '';

const isEdgeWhitespace = (character: string): boolean => character === ' ' || character === '\t';

const encodeLine = (line: string): string => {
  const characters = [...line];
  let start = 0;
  while (start < characters.length && isEdgeWhitespace(characters[start]!)) start += 1;
  let end = characters.length;
  while (end > start && isEdgeWhitespace(characters[end - 1]!)) end -= 1;
  return characters
    .map((character, index) => {
      if (index < start || index >= end) return REFERENCES[character]!;
      if (character === '\r') return REFERENCES['\r']!;
      return PUNCTUATION.has(character) ? `\\${character}` : character;
    })
    .join('');
};

/** Encode legacy textarea prose as Markdown source that renders as that prose. */
export const encodeLegacyProse = (text: string): string => {
  if (isBlank(text)) return text;
  const lines = text.split('\n');
  return lines
    .map((line, index) => {
      const encoded = encodeLine(line);
      const next = lines[index + 1];
      if (next === undefined) return encoded;
      return line !== '' && next !== '' ? `${encoded}\\\n` : `${encoded}\n`;
    })
    .join('');
};

/**
 * The exact inverse of `encodeLegacyProse`. A lenient parse, then a check that encoding the result
 * reproduces the source byte for byte — so it accepts exactly what the encoder can produce and
 * throws a `TypeError` on anything else.
 */
export const decodeLegacyProse = (source: string): string => {
  if (isBlank(source)) return source;
  let text = '';
  let index = 0;
  while (index < source.length) {
    const character = source[index]!;
    if (character === '\\') {
      const next = source[index + 1];
      if (next === '\n' || (next !== undefined && PUNCTUATION.has(next))) {
        text += next;
        index += 2;
        continue;
      }
      throw new TypeError(`not legacy prose: a backslash at ${index} escapes nothing the encoder escapes`);
    }
    if (character === '&') {
      const reference = Object.entries(REFERENCES).find(([, encoded]) => source.startsWith(encoded, index));
      if (reference === undefined) throw new TypeError(`not legacy prose: an unknown reference at ${index}`);
      text += reference[0];
      index += reference[1].length;
      continue;
    }
    if (PUNCTUATION.has(character)) throw new TypeError(`not legacy prose: an unescaped "${character}" at ${index}`);
    text += character;
    index += 1;
  }
  if (encodeLegacyProse(text) !== source) throw new TypeError('not legacy prose: the encoder would not produce this source');
  return text;
};
