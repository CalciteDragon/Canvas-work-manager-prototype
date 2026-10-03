<!-- completed-record id="63" closed="2026-10-03" summary="Rich Text converted to Markdown at schema v6 with history intact; Rich Text retired on create and load" -->
# Slice 63 — Rich Text to Markdown conversion and retirement (Slice 59 Stage C2)

## Goal

Convert every current and historical Rich Text section to Markdown without losing visible prose,
then retire Rich Text creation and registration (Stage C2 of [Slice 59](../planned/59-markdown-and-work-navigation.md)).

## Spec sections

§§11, 14 (contracts and owned-file upgrades), 27, 29–31 (sections, shortcuts, history and recovery),
54 (MCP writes), 66 (section structure), 69 and 77 (verification and actual use).

## Build

- Add a named v5→v6 converter over live sections and every enumerated history payload/snapshot.
  Escape legacy prose rather than reinterpret it; preserve IDs, labels, attribution and timestamps.
- Freeze v4→v5 output to literal v5 opaque data and validate only after the extended upgrade chain;
  retain owner locks, backup and validate-before-replace behavior. Diagnose unprovable preservation.
- Regenerate current seeds, retire the Rich Text registration and narrowly refuse new rich-text
  creates through domain/HTTP/MCP. Keep foreign/malformed config recoverable with visible guidance.
- Update living spec, architecture, decisions and guides with the delivered conversion behavior.

## Done when

Upgrading copies from every supported version preserves prose and history through restart; a
repeat upgrade changes no bytes. Converted history Undo/Redo recreates Markdown with the same
identities and historical labels. New browser/HTTP/MCP writes use source config and reject new
Rich Text. Recovery, read-only shortcuts, permissions and all required checks remain green;
realistic converted data is exercised in the app and the bundle remains below its ceiling.

## Do not

- Rewrite historical fixtures or older upgrade semantics, discard unknown config, or perform
  recursive string replacement over history.
- Add richer editing, Markdown in task/reflection bodies, history relabeling, merge/autosave,
  shortcuts on Work (Stage D), Sub-Projects retirement (Stage E) or a larger bundle budget.

## Decisions taken before planning (user, 2026-10-02)

1. **Untitled converted sections take the new type's name.** No title is invented. The frame
   reads "Markdown", like a new section's. Stored history labels keep their "Rich Text" wording.
2. **Escape everything.** Legacy prose is encoded by one fixed, reversible rule, never by
   context-sensitive escaping. The source is noisier wherever there is punctuation; in exchange,
   nothing in old prose can become a heading, list, table, link or code block.

## Findings from the repository that shape the plan

- **Where config is stored.** Persisted section config lives in exactly four places:
  - `document.sections`, live and archived;
  - `section.add.section`, the full snapshot;
  - `section.remove.section`, the full snapshot, which is the only copy once `disposition: 'deleted'`;
  - `section.update.changes[field='config'].before/after`.
  `CreatedContainer.section` (on `task.add` and `reflection.add`) is always a container type.
  `section.restore`, `section.move`, shortcut, page and project payloads hold no config. Activity
  events hold labels, not types or config. Every other `ProjectSectionSchema` use
  (`project-archive.ts`, `section-shortcut.ts`, the result schemas) is a read shape, not stored.
- **`section.update` carries no section type.** The converter has to resolve the type by
  `sectionId`, from `document.sections` and from any `section.add` or `section.remove` snapshot.
  A section's type never changes, so every source must agree.
- **The real `.prototype/data.json`** is v5. It has 2 Rich Text sections and rich-text
  `section.add` ×1, `section.update` ×2, `section.remove` ×1 and `section.restore` ×1. Its
  multi-line prose is `"test\naaa"`. Every seed's Rich Text section is untitled, with config
  exactly `{ text }`.
- **The Markdown renderer** is `new MarkdownIt({ html: false, linkify: false, typographer: false })`
  with `breaks` off, so a single newline renders as a space. Legacy line breaks have to become
  explicit hard breaks.
- **`upgradeActivityIdentity`** currently reads `SCHEMA_VERSION` and calls
  `validateDocumentIntegrity`. At v6 both would retarget it, so it has to be frozen to a literal 5,
  like the two steps before it.

## Design

### 1. Legacy prose encoding — `packages/prototype-data/src/legacy-prose.ts`

`encodeLegacyProse(text): string` and its exact inverse, `decodeLegacyProse(source): string`. Pure
functions with no dependencies.

**How each line is encoded** (lines split on `\n`):
- Every ASCII punctuation character (CommonMark's escapable set, `!"#$%&'()*+,-./:;<=>?@[\]^_`{|}~`)
  becomes a backslash followed by the character.
- Every leading and every trailing space or tab becomes a numeric character reference: `&#32;` for
  a space, `&#9;` for a tab.
  - This stops indented code blocks and accidental trailing-space hard breaks.
  - The references can't be confused with literal text, because a literal `&` is always `\&`.
- `\r` anywhere becomes `&#13;`, so CRLF input still decodes exactly.

**How lines are joined:**
- A line break between two non-empty lines becomes `\` + `\n`, which is a CommonMark hard break.
- A break next to an empty line stays a plain `\n`, so blank lines remain paragraph breaks.

**What the decoder does:** it reverses exactly these rules and throws on any sequence the encoder
cannot produce.

**What the converter checks:** `decodeLegacyProse(encodeLegacyProse(t)) === t`. If the check
fails, the conversion is refused with a diagnostic naming the section (or the action and its path),
and nothing is written. This is the "diagnose unprovable preservation" requirement.

**What the rendering test proves:** prose survives rendering. A test renders encoded text with the
web app's exact markdown-it options and checks two things:
- the token stream holds only paragraph, text, softbreak, hardbreak and entity-decoded text;
- the concatenated text, whitespace-normalised, equals the input, whitespace-normalised.

markdown-it becomes a `devDependency` of `@cwm/prototype-data` at the web app's version. Only the
test imports it. That test copies the renderer's options, so a web `markdown-renderer.spec.ts`
case also renders a few frozen encoded strings through the real `renderMarkdown`, which adds
`.disable('image')` and its own core rule.

**Whitespace-only text is stored raw**, and decodes to itself. The empty string is one case of this.
- The predicate is exactly JavaScript's `text.trim() === ''`, in both encoder and decoder. It is
  the same `trim` that recovery (`section-recovery-policy.ts`) and the renderer's empty check use,
  so it also covers NBSP, U+3000, U+FEFF and U+2028. Using CommonMark's narrower whitespace set
  would encode two NBSPs (`"  "`, blank to JavaScript but not to CommonMark) to text that trims non-empty and break recovery parity.
- Why: encoding `"  "` as `&#32;&#32;` would make a blank Rich Text count as recoverable prose. It
  would then be kept in Archive instead of deleted on removal, and it would render an empty
  paragraph instead of "No notes yet."
- It stays unambiguous: any encoding of non-blank text contains a non-whitespace character.

**Accepted rendering losses**, recorded in the decision. Rich Text was a textarea; Markdown renders
HTML without `pre-wrap`. So in the rendered view:
- runs of blank lines collapse to one paragraph break;
- leading indentation and runs of spaces collapse;
- NUL renders as U+FFFD.

The source keeps every byte, as the round trip proves. No word, punctuation mark or line break is
lost. Control characters are in the hostile round-trip table.

**The converter is frozen to its own rules.** It matches the literal `'rich-text'`, never
`RETIRED_SECTION_TYPES` or `sectionCapabilityOf`, so its behaviour can't change when the contracts
do.

### 2. The v5→v6 converter — `packages/prototype-data/src/upgrade-markdown-sections.ts`

`upgradeMarkdownSections(input: unknown)` reads opaque v5 JSON, writes literal v6 data, and
validates the final document with `validateDocumentIntegrity`. It is now the only validating step,
so it owns the chain's guarantee.

- **Already at 6:** runs the same conversion. A clean v6 file comes back unchanged
  (`changed: false`) and is never written. A hand-edited v6 file that still holds `rich-text` is
  converted and written, so the remedy named by the integrity error actually works for consistent hand edits (see *Limits of the v6 remedy*).
- **Any version other than 5 or 6:** `RangeError`.

**Resolving each section's type.** Before converting anything, the converter builds
`sectionId → type` from four sources:
- `sections`;
- every `section.add.section` snapshot;
- every `section.remove.section` snapshot;
- every `task.add` / `reflection.add` `container.section`. Redo of the row's add can recreate this
  container, so an update on it is not an orphan.

**When the sources disagree about a section's type, the conversion is refused.**

**A `section.update` whose section appears nowhere is left unconverted** and counted as
`unreachableUpdates`. It can legitimately happen:
1. Actor A adds a Rich Text section.
2. Actor B edits it, then undoes the edit.
3. A undoes the add, which deletes the section.
4. A makes a new action. That discards A's undone `section.add`, so its snapshot is gone.

B's update is now orphaned. No path can apply it again: the section is missing and no snapshot can
recreate it, so Undo or Redo reports `missing`. A retained section whose `section.remove` was later
pruned produces the same orphan. Refusing the conversion here would block a legitimate file.
Integrity needs no change for these, because an update only writes onto a section that already
exists and never recreates a type.

**How a rich-text config converts.** One rule, used in every location below:

| Stored config | Converted type | Converted config |
|---|---|---|
| exactly `{ text: string }` | `markdown` | `{ markdown: encodeLegacyProse(text) }` |
| `{}` | `markdown` | `{}`, which Markdown already reads as empty |
| `{ text: string, ...extras }` with no `markdown` key | `markdown` | `{ markdown: encodeLegacyProse(text), ...extras }` |
| any config holding a `markdown` key | — | **refused**, with a diagnostic |
| anything else (non-string `text`, keys without `text`) | `markdown` | **unchanged** |

**Rows 3 and 5 are the recoverable-with-guidance cases.**
- Rich Text's non-strict `readRichTextConfig` shows the `text` of row 3 today, so that prose must
  stay visible.
- `readMarkdownConfig`'s `unreadable` state gains an optional `markdown` string, present when that
  key holds a string.
- The body then renders that prose read-only above the existing *"This section's stored content
  isn't Markdown source"* note, and Save stays blocked.
- Domain recovery reads both rows as `unknown`, so Archive keeps them.
- Nothing is emptied, no key is dropped, and the type string `rich-text` is never left behind.

**Why row 4 refuses.** A legacy `{ markdown: "x" }` would collide with an encoded `{ text }`. It
would also silently become readable, unescaped Markdown. Both are reinterpretation.

**Where the rule is applied.** An enumerated walk over the stored payload union. There is no
recursive string replacement.

| Location | Change |
|---|---|
| `sections[]` where `type === 'rich-text'` | type and config |
| `operationActions[].operation`, type `section.add` or `section.remove`, where the snapshot type is `rich-text` | the snapshot's type and config |
| `operationActions[].operation`, type `section.update`, where the resolved type is `rich-text` | each `config` change's `before` and `after` |
| `task.add` / `reflection.add` `container.section` | asserted to be a non-`rich-text` container, else refused |
| every other operation type | left untouched |

Nothing else changes:
- action ids, `order`, `state`, `label`, `createdAt`, `expiresAt`;
- history cursors, high-water marks and revisions;
- section ids, positions, titles, `archivedAt`, `archiveGeneration`, `columnSpan`, `collapsed`;
- Activity.

**Undo conflict detection stays consistent.** Encoding is deterministic, so a live config and the
`after` that wrote it convert to equal values. Undo's equality check therefore behaves after
conversion exactly as it did before.

**Recovery parity.** Every fixture config gets the same `sectionRecoveryOf` verdict before and
after conversion: Rich Text before, Markdown after. A test asserts it.

**Result:** `{ document, changed, convertedSections, convertedPayloads, unreadableConfigs,
unreachableUpdates }`. The CLI message reports the four counts.
- `changed` is true only when a section or payload was actually rewritten.
- Orphans alone never set it. A clean v6 file can legitimately keep the orphans left by its
  v5 conversion, and a re-run must still report "already at 6".

**Limits of the v6 remedy.** Re-running on v6 fixes only *consistent* hand edits, where every
source for a section id agrees it is `rich-text`. Two kinds of hand edit still refuse, with the
same diagnostic as at v5, and the decision entry says so:
- `rich-text` written onto a section whose snapshots say `markdown` (conflicting types);
- `{ markdown }` written into a rich-text config (row 4).

### 3. The chain — `upgrade-cli.ts` and `upgrade-activity-identity.ts`

- **`upgradeActivityIdentity` is frozen.**
  - It now writes the literal `TARGET_VERSION = 5`, does not validate, and returns opaque JSON.
  - A file at 5 or later passes through unchanged, like the v3 step does.
  - Its refusals (missing target, invalid scope, false project) stay exactly as they are.
  - `captureActivityIdentities` is unchanged; the seed builders still use it.
- **`upgradeDataFile`:**
  - accepts versions 2–6;
  - chains `v2→3 → v3→4 → v4→5 → v5→6`;
  - writes only when some step changed the document;
  - keeps backup-before-write, temp-file-then-rename, owner lock and no-write-on-failure exactly
    as they are.
- **`upgradeMessage`** names the version converted from and reports the Markdown counts.
- **`SCHEMA_VERSION` becomes 6** in `packages/contracts/src/document.ts`. The store's existing
  `describeVersion` already tells the owner of a v5 file to run `pnpm prototype:upgrade`.

### 4. Retirement — contracts, domain and integrity

- **Contracts (`section.ts`).**
  - Remove `'rich-text'` from `SECTION_CAPABILITIES`.
  - Add `RETIRED_SECTION_TYPES = ['rich-text']` and `isRetiredSectionType(type)`, with a doc
    comment pointing to the decision.
  - `CreateSectionInputSchema` stays open (§30). The refusal lives in the domain, so every caller
    gets the same error.
- **Domain (`SectionService.add`).** Refuse a retired type with `DomainRuleError`. The message
  names Markdown as the replacement. The check runs in the shared `add` path, so it covers
  browser, HTTP and MCP. `addWithin` also serves `resolveContainer`, but that path only creates
  containers.
  - **Where it runs:** after `assertValidActor` and `assertPermitted('projects.write')`, and before
    any lookup. It is input validation, so it leaks nothing about the project.
  - **Which error wins:**
    - an agent without `projects.write` gets `PermissionDeniedError` (people are never checked);
    - otherwise a retired type gets the rule error, ahead of a missing or foreign project, an
      archived project or a disabled page.

    Tests pin this order.
- **`section-edit-undo.ts`.** Drop the `text` entry from `PROSE_NOUN`. Stored labels are never
  recomputed, so nothing is relabelled.
- **Integrity (`validateDocumentIntegrity`).** Refuse any retired type in `sections` or in a stored
  `section.add`, `section.remove` or `CreatedContainer` snapshot. The message names
  `pnpm prototype:upgrade`.
  - This is what guarantees that converted history can only ever recreate Markdown.
  - Redo of `section.add` and Undo of a deleted `section.remove` rebuild from snapshots that are
    now Markdown.

### 5. Web

- **Delete** `sections/rich-text/` (5 files) and its registry entry. Markdown becomes the first
  picker entry.
- **Update** `registry.spec.ts` and the section-create-dialog ordering spec.
- **`markdown-config.ts`.** The `unreadable` state carries an optional `markdown` string (see §2's
  row 3).
- **`markdown-section-body`.** Renders that string read-only, through the existing renderer, above
  the unreadable note. Save stays blocked.
- **`MarkdownSection`'s placeholder.** Its `@placeholder` currently prints raw source in
  `pre-wrap`, so converted notes would flash `Keep this light\.` while the body loads. The
  placeholder strips CommonMark backslash escapes before ASCII punctuation, and the numeric
  references for space, tab and CR.
  - This is a display-only placeholder simplification in the Markdown folder, aimed at converted
    prose. It is neither a general Markdown-to-text converter nor a legacy decoder: any other
    entity stays visible for the brief placeholder moment. Its doc comment says exactly that.
  - Unreadable configs still show an empty placeholder.
- **Swap** every other spec and story that builds a `rich-text` section to `markdown` with
  `{ markdown }` config. The list is under the file-level changes below.

### 6. Seeds, fixtures, MCP and acceptance scripts

- **Seeds.** `seeds.ts` writes `markdown` sections with readable, hand-authored Markdown (`{ markdown: brief }`).
  Seeds are new content, not converted data, so they carry no escapes. Regenerate all six
  `prototype/seeds/*.json`.
- **New frozen fixture** `packages/prototype-data/test/fixtures/history-v5-rich-text.json`. It is a
  v5 document produced once by the real domain from the pre-slice `nested-projects` seed. It holds:
  - live and archived Rich Text;
  - multi-line prose, plus prose that looks like Markdown (`# x`, `1. x`, `- x`, `| a | b |`,
    `<b>`, `&amp;`, a trailing backslash, 4-space indent, CRLF);
  - empty `{}`, whitespace-only `"   "`, `{ text: 5 }` and `{ text, extra }`;
  - `section.add`, both applied and undone-and-deleted, so that it exists only as a snapshot;
  - two `section.update` config edits;
  - an orphaned `section.update`, from the two-actor sequence in §2;
  - `section.remove` with disposition `deleted`, and one `retained`;
  - `section.restore`.

  The generator is a one-off script in the scratchpad and is not committed. Its provenance is
  recorded in the decision entry and in a short `test/fixtures/README.md` note: the source seed,
  the domain calls in order, the commit it ran at, and the plain-JSON edits made for the malformed
  configs. The fixture is frozen from then on.
- **Refusal variants are plain-JSON tests, not committed fixtures.** Tests build them by editing a
  copy of the fixture:
  - conflicting types for one section id;
  - a `markdown` key inside a rich-text config;
  - a rich-text `CreatedContainer`;
  - an encoding that fails to round-trip, forced through an injected encoder seam.
- **Existing fixtures are unchanged:** `nested-projects-v2.json`, `nested-projects-v3.json` and
  `history-v4.json`. The chain tests now assert that their Rich Text arrives as Markdown at v6.
- **MCP.** In `tools/sections.ts`, drop `rich-text` from the `create_section` type examples.
  `mcp-acceptance.mjs` switches its three `rich-text` creates to `markdown`.
- **Data files.** `.prototype/e2e-data.json` is regenerated by the e2e servers. The developer's
  `.prototype/data.json` is converted with `pnpm prototype:upgrade` during actual use, and the
  backup is kept.

## Acceptance check

1. **Every supported starting version converts.** For each of v2, v3, v4 and v5, an upgrade of a
   *copy* reaches v6 and `validateDocumentIntegrity` accepts it. The v5 fixture comes out with:
   - every Rich Text section, live or archived, as Markdown;
   - every encoded prose value decoding to its original;
   - everything else deep-equal to the input. The method: delete `type` and `config` at the
     enumerated paths (sections, `section.add`/`section.remove` snapshots, `section.update` config
     changes) on both sides, normalise `schemaVersion`, then deep-compare;
   - the §2 table's results: whitespace-only stored raw; `{ text, extra }` encoded with `extra`
     kept; `{ text: 5 }` unchanged under `markdown`; the orphaned update unchanged and counted;
   - the same `sectionRecoveryOf` verdict for every config before and after.
2. **Restart and repeat.** The converted file opens in a fresh `JsonFileDataStore`. A second
   upgrade reports "already at schema version 6" and leaves the file byte-identical. Because a
   clean v6 file now runs the conversion too, this proves the conversion is idempotent, not merely
   that it skipped the write.
   - A hand-edited v6 file holding `rich-text` fails to load and names the upgrade command.
   - Running that command converts it, and the file then loads.
3. **Converted history works.** On the converted v5 fixture, in the domain:
   - Undo the converted `section.update` and the section's config equals the converted `before`.
   - Redo it and the config equals the converted `after`.
   - Undo and Redo the snapshot-only `section.add` / `section.remove` and the section is recreated
     with the same id, type `markdown` and the converted config.
   - History labels are byte-identical to the input's.
4. **New writes refuse Rich Text.**
   - `SectionService.add` with `rich-text` throws `DomainRuleError` and writes nothing.
   - `POST /api/projects/:id/sections` returns the mapped rule error.
   - MCP `create_section` over HTTP and over stdio returns the tool error.
   - `markdown` creates and updates still succeed on all three.
   - The refusal precedence from §4 holds: an agent's missing grant first, then the retired type.
5. **The picker.** It lists Markdown first and has no Rich Text. The e2e journeys pass on Markdown.
6. **Unreadable but visible.** A converted `{ markdown, extra }` section renders its prose
   read-only with the guidance note and offers no Save, both on its own page and through a
   read-only shortcut.

   The C1 tests in `markdown-section-body.spec.ts` and the Slice 62 e2e journeys already cover:
   - live propagation;
   - draft retention;
   - Flow/Grid resize;
   - the read-only shortcut over readable Markdown;
   - Archive Restore of Markdown.

   These keep passing on converted data; this slice does not re-prove them.
7. **The gates pass:**
   - `pnpm test`, `pnpm lint` (including `docs:check`), `pnpm build` with the initial bundle under
     1,050,000 bytes, `pnpm storybook:build`, `pnpm e2e`;
   - host `acceptance`, `agent-acceptance`, `mcp-acceptance` and `live-acceptance`;
   - `pnpm docs:api` built before the final tests.
8. **Actual use.**
   - Upgrade a copy of the developer's `.prototype/data.json`, open it in the app, and confirm
     `"test\naaa"` shows as two lines.
   - Undo and Redo its converted Rich Text history.
   - Restore from Archive.
   - Check a read-only shortcut to a converted section.
   - Repeat on `nested-projects` in both themes, at desktop and 375 px widths.
   - Record friction against `CURRENT_SLICE = 63`.

## File-level change list

| File | Change | Responsibility |
|---|---|---|
| `packages/contracts/src/document.ts` | modify | `SCHEMA_VERSION = 6` |
| `packages/contracts/src/section.ts` | modify | drop `rich-text` capability; `RETIRED_SECTION_TYPES`, `isRetiredSectionType` |
| `packages/contracts/src/section.test.ts`, `index.test.ts`, `inputs.test.ts`, `project-page.test.ts`, `undo.test.ts` | modify | capability table, retired export; `rich-text` fixtures → `markdown` |
| `packages/prototype-data/test/fixtures/README.md` | create | provenance of the v5 fixture |
| `apps/web/.../sections/markdown/markdown-config.ts`, `markdown-section-body.{ts,html,scss}`, `markdown-section.ts` (+ specs) | modify | unreadable prose shown read-only; placeholder strips escapes |
| `apps/web/src/app/shared/components/markdown-renderer/markdown-renderer.spec.ts` | modify | frozen encoded strings through the real renderer |
| `packages/domain/src/section-service.ts` | modify | retired-type refusal in `add` |
| `packages/domain/src/section-edit-undo.ts` | modify | drop `text` prose noun |
| `packages/domain/src/section-recovery-policy.ts` | modify | doc comment: Markdown only |
| `packages/repositories/src/data-store.ts` (+ test) | modify | integrity refuses retired types in sections and stored snapshots |
| `packages/prototype-data/src/legacy-prose.ts` (+ test) | create | encode/decode, round-trip and markdown-it render proof |
| `packages/prototype-data/src/upgrade-markdown-sections.ts` (+ test) | create | v5→v6 converter |
| `packages/prototype-data/src/upgrade-activity-identity.ts` (+ test) | modify | freeze at literal 5, opaque, no validation |
| `packages/prototype-data/src/upgrade-cli.ts` (+ test) | modify | 2–6 chain, counts in the message |
| `packages/prototype-data/src/index.ts` | modify | export the new step |
| `packages/prototype-data/src/seeds.ts`, `seeds.test.ts`, `prototype/seeds/*.json` | modify | Markdown seed sections; regenerated snapshots |
| `packages/prototype-data/test/fixtures/history-v5-rich-text.json` | create | frozen v5 fixture |
| `packages/prototype-data/package.json`, `pnpm-lock.yaml` | modify | `markdown-it` devDependency |
| `packages/mcp-tools/src/tools/sections.ts`, `contract.test.ts` | modify | tool wording; retired-type refusal test |
| `apps/prototype-host/api/routes.test.ts`, `mcp/handler.test.ts`, `mcp/stdio.test.ts` | modify | refusal tests; fixtures → markdown |
| `apps/prototype-host/scripts/mcp-acceptance.mjs` | modify | `markdown` creates |
| `apps/prototype-host/recovery-undo-acceptance.test.ts` | modify | v5 → v6 subprocess upgrade |
| Every domain test the grep finds (14 files, including `section-recovery-policy.test.ts`, whose Rich Text cases change meaning) and host `services.test.ts`, `concurrency.test.ts` | modify | `rich-text` fixtures → `markdown` |
| `apps/web/.../sections/rich-text/*` | delete | retired section |
| `apps/web/.../sections/registry.ts`, `registry.spec.ts` | modify | Markdown first, no Rich Text |
| Web specs and stories (14 files from the grep) | modify | fixtures → markdown |
| `apps/e2e/*.spec.ts` (8 files) | modify | journeys on Markdown |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` | modify | `CURRENT_SLICE = 63` |
| Spec §14, §§29–31, §66 and the folder tree (lines ~576, 617–640, 1188, 1596, 1610, 1637–1641, 1705, 1752, 3535, 4276) | modify | v6, seven registered types, Markdown-only prose, conversion note |
| `docs/decisions/2026-10-schema-version-6-markdown-conversion.md` | create | §78 entry: encoding, type resolution, malformed handling, refusal, frame name |
| `docs/decisions/2026-10-markdown-source-and-rendering.md`, `2026-09-schema-version-5-conversion.md`, `2026-09-section-update-history-labels.md`, `2026-09-content-oriented-archive-policy.md` | amend | dated amendments: C2 delivered; v4→v5 frozen; `text` prose noun gone; Rich Text `proseKey` retired |
| `docs/specifications/archive-removal-undo-refactor-spec.md` | none | a historical *Proposed* document, not living docs; left as written |
| `docs/decisions/README.md` | modify | index |
| `docs/architecture/prototype-data/*`, `contracts/*`, `domain/why.md` + `how.md`, `repositories/how.md` + `why.md`, `web/projects/*`, `mcp-tools/how.md`, `testing/how.md` + `overview.md`, `what.md`, `why.md` | modify | v6, chain, retirement, links to the decision |
| `docs/guides/mcp-setup.md`, `first-milestone-walkthrough.md`, `README.md`, `AGENTS.md` | modify | Markdown examples; schema version 6 |
| `docs/roadmap/planned/59-…`, `goals.md`, `progress.md` | modify | C2 status |
| `.prototype/notes.json` | modify | friction from actual use |


## Test plan — tests first

Each test is written first and seen failing for the right reason.

1. **`legacy-prose.test.ts`**
   - **Round trip** over a table of hostile inputs:
     - every ASCII punctuation mark;
     - `# `, `1. `, `- `, `> `, `|a|b|`, setext `===` and `---`;
     - `<b>`, `&amp;`, `&#32;` typed as literal text;
     - `\` at the end of a line, including the last line;
     - 4-space indent, tabs, trailing spaces;
     - CRLF, blank lines, runs of blank lines;
     - NUL and other control characters, NBSP, emoji;
     - whitespace-only text and the empty string.
   - **Decoder rejections:** an unescaped special character, a dangling `\`, and an unknown entity.
   - **Whitespace-only text** encodes to itself.
   - **Render proof.** Each non-blank input, encoded and rendered with the app's markdown-it
     options, yields only paragraph and inline-text tokens. Its text equals the input with
     whitespace normalised. Each single line break renders as a `<br>`.
2. **`markdown-renderer.spec.ts`** (web): frozen encoded strings rendered through the real
   `renderMarkdown` produce the expected text, `<br>` elements, no headings, no lists, no links.
3. **`upgrade-markdown-sections.test.ts`**, on the v5 fixture:
   - converts live, archived, `section.add`, `section.remove` (both dispositions) and
     `section.update` payloads;
   - leaves every non-prose payload deep-equal, using the acceptance item 1 method;
   - applies each row of the §2 table, including `{ text, extra }` encoded with `extra` kept;
   - leaves the orphaned update unchanged and counts it;
   - gives the same recovery verdict before and after for every config, including `"  "` and
     `"　\t"`;
   - types an update on a `CreatedContainer`-only section from that snapshot, not as an orphan;
   - refuses each plain-JSON variant: conflicting types, a `markdown` key in a rich-text config, a
     rich-text `CreatedContainer`, and a forced round-trip failure;
   - **at v6:** a clean file that still holds an orphan comes back `changed: false`; a v6 file
     holding consistent `rich-text` is converted; an inconsistent one refuses;
   - v4 or v7 input throws `RangeError`;
   - the output passes `validateDocumentIntegrity`;
   - every encoded prose value decodes to the fixture's original.
4. **`upgrade-activity-identity.test.ts`**
   - outputs the literal `schemaVersion: 5`;
   - its sections and history are byte-equal to the input's;
   - it never validates: a v5 output still carrying `rich-text` comes back without throwing;
   - v5 and later pass through;
   - the existing refusals are unchanged.
   - The frozen intermediate steps keep their existing tests: `upgrade-project-pages.test.ts`
     (v2 → 3) and `version-3-undo-compatibility.test.ts` (v3 → 4). This test adds v4 → 5, so every
     fixed intermediate output is tested.
5. **`upgrade-cli.test.ts`**
   - v2, v3, v4 and v5 → v6, each from a copy; `nested-projects-v2.json`, `nested-projects-v3.json`
     and `history-v4.json` arrive at v6 with their Rich Text as Markdown;
   - a clean v6 file writes nothing;
   - a v6 file holding `rich-text` is converted and backed up;
   - repeat runs are byte-identical;
   - a refused conversion writes no backup and no temp file;
   - message wording for each start version and for every count;
   - the owner lock still refuses.
6. **Integrity** (`data-store.test.ts`)
   - A v6 document holding `rich-text` fails, naming the upgrade command, when it appears:
     - in `sections`;
     - in a `section.add` snapshot;
     - in a `section.remove` snapshot;
     - in a `CreatedContainer` snapshot.
   - Unknown, non-retired types still load.
   - A `section.update` config change holding `{ text }` (the orphan) still loads.
7. **Domain**
   - **`section-service.test.ts`, the retired-type refusal:**
     - a create throws `DomainRuleError`, writes nothing and records no history;
     - an agent without `projects.write` gets `PermissionDeniedError` instead. A person never
       does, because `assertPermitted` checks only agents;
     - the retired type beats a missing project, an archived project and a disabled page;
     - `markdown` and unknown open types still create.
   - **Converted history** (acceptance item 3): the converted fixture is loaded into an in-memory
     store and Undo/Redo is exercised. Labels stay byte-identical.
8. **Host and MCP.** Each of HTTP, MCP over HTTP and MCP over stdio refuses `rich-text` and
   accepts `markdown` source.
9. **Web**
   - `registry.spec.ts`: no `rich-text`, Markdown first, capability parity;
   - the section-create dialog lists Markdown first;
   - `markdown-config.spec.ts`: `unreadable` carries the `markdown` string exactly when it is one;
   - `markdown-section-body.spec.ts`: unreadable-with-prose renders the prose and the note, with no
     Edit or Save, including when read-only;
   - `markdown-section.spec.ts`: the placeholder strips escapes and the space, tab and CR
     references.
10. **Seeds.** `seeds.test.ts` compares bytes after the builders change, and no seed contains
    `rich-text`.

## Boundaries touched

- **Contracts once.** The retired list lives in `section.ts` only. The converter reads plain JSON,
  does not redefine v5 shapes, and is frozen to the literal `'rich-text'`.
- **Domain purity.** The refusal is a rule over the input string, with no HTTP or MCP knowledge.
  The domain never imports the encoder and never parses Markdown.
- **MCP → domain.** The tool keeps calling `SectionService.add`; the refusal arrives through it.
- **Integrity stays in repositories.** It already validates documents; it gains a check on
  stored types and no domain dependency.
- **Web `core/` and `prototype/`.** Unaffected. The placeholder helper and the unreadable prose
  stay inside `sections/markdown/`.
- **Converters are not a runner.** Four named steps, called explicitly in a fixed order and
  registered nowhere (§71).
- **No literal styles.** Any new unreadable-prose styling uses tokens. Deleting the Rich Text SCSS
  only removes styles.

## Explicit non-goals

- Everything in *Do not*.
- No fix for the Preview-label friction from Slice 62.
- No change to Markdown's dialect, renderer options or editor.
- No relabelling of stored "Rich Text" history labels.
- No titles invented for converted sections.
- No `pre-wrap` rendering to restore collapsed whitespace; that loss is accepted and recorded.

## Open questions

Both product questions were answered before planning; see *Decisions taken*. The review confirmed
that integrity should not type-check `section.update` changes. An update only writes onto an
existing section and never recreates a type. Every path that recreates one (Redo of
`section.add`, Undo of `section.remove`, Redo of `task.add` or `reflection.add` from its `CreatedContainer`) reads a snapshot, and integrity checks those.

## Revisions

**Round 1** (independent review). These claims were verified correct:
- the payload enumeration;
- the real-data counts;
- that conflict detection always compares live config with stored config;
- that the escaping works under markdown-it;
- that the v4→v5 step had to be frozen.

Changes made:
- **Orphaned updates.** An untypeable `section.update` no longer refuses the conversion. It is
  left unconverted and counted, because two actors plus pruning can legitimately produce one.
- **Malformed configs.** `{ text, ...extras }` now encodes `text` and keeps the extras. Markdown's
  unreadable state shows that prose read-only, so prose that is visible today stays visible. A
  rich-text config holding a `markdown` key is refused, because it would collide with encoded
  output.
- **Whitespace-only prose** is stored raw. Without that, conversion would change Archive recovery
  and the empty-state message. A recovery-parity test is added.
- **v6 files with `rich-text`.** The v6 path now runs the idempotent conversion, so the upgrade
  command that the integrity error names actually works.
- **Accepted losses recorded:** collapsed whitespace and NUL. Control characters joined the
  hostile table, and a test was added for the real `renderMarkdown`.
- **Placeholder.** It now strips escapes, so the eager placeholder never flashes `\.`.
- **Test 4.** Its assertion now checks the literal 5 and byte-equal data. The existing
  intermediate tests are listed.
- **Refusal precedence** is pinned: permission, then retired type, then lookups.
- **Test coverage.** Added the integrity case for `CreatedContainer` and the unreadable read-only
  shortcut case. The checks C1 already covers are named.
- **Frozen literal.** The converter matches `'rich-text'` literally.
- **Fixture provenance** is recorded.
- **Change list.** Added the contract tests, spec lines 576 and 4276, two decision amendments and
  the archive-refactor spec.
- **Acceptance item 1** states how the deep comparison is done.

**Round 2** (same reviewer). All twelve round-1 findings were confirmed resolved, and no
substantive design hole was found. These were verified:
- recovery parity for every row of the conversion table;
- that no two rows can produce the same output;
- that the v6 re-run touches only literal `rich-text`;
- that no integrity check or executor reads an orphan's config with type knowledge;
- that the refusal order fits the actual code.

Changes made:
- **Permission test.** The test that "a viewer is refused" could not be written: `assertPermitted`
  checks only agents. Precedence is now tested with an agent that lacks `projects.write`.
- **Whitespace predicate.** It is pinned to JavaScript's `trim`, the same one recovery and the
  renderer use, and parity cases were added.
- **Container sections.** `CreatedContainer` is a fourth source for a section's type, so an update
  on a container that Redo can recreate isn't counted as an orphan.
- **`changed`.** It reflects only actual rewrites, and the clean-v6 no-op test includes an orphan.
- **Remedy limits.** The v6 remedy is documented as covering consistent hand edits only.
- **Placeholder helper.** Described as a narrow simplification for converted prose.
- **Acceptance list.** Renumbered, with C1's coverage moved under item 6.
- **Domain test count.** Corrected to 14, naming `section-recovery-policy.test.ts`.

**Round 3** (same reviewer). No substantive findings. Three wording fixes:
- the whitespace-parity example now uses NBSP;
- the v6-remedy claim is qualified to consistent hand edits;
- the open question lists `CreatedContainer` Redo as a recreation path.

The plan is cleared for implementation.

**Implementation review** (three independent reviewers against `630e4ba..HEAD`, Step 4):
- *Correctness* fuzzed 200,000 strings through the encoder and markdown-it and 200,000 sources through
  the decoder, with no failure. One real bug: the placeholder stripped escapes and then decoded
  references, turning a typed `&#32;` into a space. Fixed with a single-pass replace and a test.
- *Spec and acceptance* found every test-plan and acceptance item satisfied and accepted the
  deviations below. Low items fixed: the deep-equal method could not see a changed non-Rich-Text
  config (a new test asserts every other location, the orphan included, is untouched); the decode
  test skipped `section.update` values (now included, six of them); the CLI overstated what a
  `{ text: 5 }` section shows (now "kept, and any prose in it is shown"); acceptance 6 had no
  shortcut-level test (added to `shortcut-frame.spec.ts`).
- *Boundaries and living docs* found every boundary intact and all lints green. Fixed: a stale
  `schemaVersion: 5` literal in `contracts/how.md`, missing doc comments on the converter's exports,
  and `markdown-it` unlisted as a test-only dependency.

## Outcome

**Deliverables.** Schema version 6 exists and every supported file reaches it.
[`legacy-prose.ts`](../../../packages/prototype-data/src/legacy-prose.ts) escapes old textarea prose by
one fixed rule with an exact inverse, proven by a hostile round-trip table and a markdown-it render
proof (paragraph, text and break tokens only).
[`upgradeMarkdownSections`](../../../packages/prototype-data/src/upgrade-markdown-sections.ts) converts
live and archived sections, `section.add`/`section.remove` snapshots and `section.update` config edits;
leaves and counts orphaned edits; refuses type conflicts, `markdown`-key collisions, Rich Text
containers and any encoding that fails to round-trip; and re-runs idempotently on v6. The v4 → v5
step is frozen at literal 5, and `pnpm prototype:upgrade` chains 2 → 6 and reports four counts.
Rich Text is retired: `RETIRED_SECTION_TYPES` in contracts, a `DomainRuleError` from
`SectionService.add` on every surface (after the grant check, before any lookup), store integrity
refusing it in sections and every recreating snapshot, no web registration (Markdown is first of
seven), Markdown seed briefs. Markdown's unreadable state shows prose it still holds read-only, and
the placeholder no longer flashes escapes. The frozen fixture
[`history-v5-rich-text.json`](../../../packages/prototype-data/test/fixtures/history-v5-rich-text.json)
was produced once by the real domain (provenance beside it).

Verified: 3,056 offline tests (`pnpm test`), 104/104 browser journeys, the four host acceptance
scripts, `pnpm lint` and `docs:check`, Storybook build, and an initial bundle of about 1,028 kB under
the unchanged 1,050,000-byte ceiling. Actual use converted the developer's `.prototype/data.json`
(2 sections, 4 history records, backup kept; a repeat run wrote nothing): `"test\naaa"` renders on two
lines, its converted edit Undoes and Redoes under the stored "Edited prose" label (clock set back with
the dev panel because the real history had expired), and Archive Restore returns it intact. A scratch
copy of the converted fixture on nested-projects showed Markdown-looking legacy prose rendering
literally, and the unreadable Garden brief readable on its page and through a read-only Home
shortcut, at 375 px in dark and light with no horizontal scroll.

**Deliberate choices.** All recorded in
[Schema version 6 converts Rich Text to Markdown and retires it](../../decisions/2026-10-schema-version-6-markdown-conversion.md):
escape everything rather than context-sensitive escaping (user), the new type's name for untitled
sections (user), whitespace-only prose stored raw for recovery parity, orphans left rather than
refused, refusal in the domain rather than the input schema (§30 keeps the type open), and the
accepted rendering losses (collapsed whitespace, NUL). Amendments note C2 on the Markdown, schema-v5,
history-label and Archive-policy decisions.

**Deviations from the plan.**
- Recovery parity and converted-history Undo/Redo are proven in
  [`markdown-conversion.test.ts`](../../../packages/domain/src/markdown-conversion.test.ts) in the domain,
  not in prototype-data, which cannot depend on the domain without a cycle. The host acceptance test
  repeats the history proof over real files through the CLI subprocess.
- `convertMarkdownSections` is exported (not from the package index) so the container-typing case can
  be tested on a partial document — the same pattern as `captureActivityIdentities`.
- `placeholderTextOf` also strips a backslash before a line break, or converted multi-line prose
  would flash a trailing `\`.
- A v6 re-run opens its message with "…already at schema version 6 but still held retired sections"
  rather than "from 6 to 6".
- No plain-JSON edits were needed for the fixture's malformed configs: the domain wrote all of them.
- Two existing tests that asserted literal schema 5 now assert `SCHEMA_VERSION`; they test the current
  stored version, not a frozen step.

**Deferred.** Nothing from this slice's scope. The friction below is for a later slice if it recurs.

**Open questions.**
- Editing converted prose shows its escapes (`test\`, `\.`, `\,`) — the accepted cost of escaping
  everything, but visible noise a person did not type
  ([`note-2026-10-02-002`](../../../.prototype/notes.json)). A one-time "clean up escapes" action on
  Edit is a candidate if it bothers real use.
- The unreadable note gives no next step for someone who wants to edit that content (`note-2026-10-02-003`).
- Slice 62's Preview-label friction remains open, as planned.

**Documentation updated.** The decision entry, four dated amendments and the index; the spec's §14,
§29–31 and folder tree; `docs/architecture/` contracts, domain, repositories, prototype-data,
mcp-tools, testing, web/projects and the root files; `docs/guides/mcp-setup.md` and
`first-milestone-walkthrough.md`; `README.md`; `AGENTS.md` (schema version 6); the fixture README.
