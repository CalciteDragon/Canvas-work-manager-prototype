# Schema version 6 converts Rich Text to Markdown and retires it

**Question**

Slice 59 Stage C2: Markdown replaces Rich Text. How does every stored Rich Text section — live,
archived and every copy history keeps of one — become Markdown without losing visible prose, and
what happens to Rich Text afterwards?

**Options tested**

- *Store legacy prose as Markdown unchanged*: rejected. A line typed as `# x`, `1. x` or `| a | b |`
  would silently become a heading, list or table; old prose would be reinterpreted.
- *Escape only what is significant in context*: rejected (user, 2026-10-02). Context-sensitive
  escaping is hard to prove complete and harder to invert exactly.
- *Escape everything by one fixed, reversible rule*: adopted (user, 2026-10-02). Noisier source
  wherever there is punctuation; in exchange nothing in old prose can become structure.
- *Invent a title for untitled converted sections*: rejected (user, 2026-10-02). They take the new
  type's name, "Markdown", like a new section. Stored history labels keep their "Rich Text" wording.
- *Recursive string replacement over history*: rejected. Config lives in exactly four stored places,
  walked by name.

**What we learned**

- **The encoding** (`packages/prototype-data/src/legacy-prose.ts`). Per line: every ASCII punctuation
  character is backslash-escaped; leading and trailing spaces and tabs become `&#32;` / `&#9;`; `\r`
  becomes `&#13;`. A break between two non-empty lines becomes a backslash hard break; a break beside
  an empty line stays a paragraph break. Whitespace-only text — JavaScript's `trim`, the predicate
  recovery and the renderer use — is stored raw, so a blank textarea stays blank to Archive and to
  "No notes yet.". The decoder is a lenient parse followed by a check that encoding its result
  reproduces the source, so it is an exact inverse that rejects anything the encoder cannot produce.
  A test renders every hostile input through markdown-it with the app's options and sees only
  paragraph, text and break tokens; the web renderer spec renders frozen encoded strings for real.
- **Accepted rendering losses.** Markdown renders without `pre-wrap`, so runs of blank lines collapse
  to one paragraph break, leading indentation and runs of spaces collapse, and NUL renders as U+FFFD.
  The source keeps every byte; no word, punctuation mark or line break is lost.
- **Where config lives.** `sections`, the `section.add` and `section.remove` snapshots (the only copy
  once a removal deleted the section) and the `before`/`after` of a `section.update` config change. A
  `task.add`/`reflection.add` created container is always a container type.
- **A `section.update` names no type.** It is resolved by id from the live sections, the add/remove
  snapshots and created containers, which must agree. An update whose section no source records — two
  actors plus an undone add that a later action discarded, or a pruned removal — can never be applied
  again, so it is left as recorded and counted, not refused.
- **Malformed configs.** `{}` stays `{}`. `{ text, ...extras }` encodes the prose and keeps the extras;
  Markdown reads that as unreadable but shows the prose read-only above its guidance note, so prose
  that was visible stays visible. A non-string `text` is kept unchanged under the new type. A Rich
  Text config already holding a `markdown` key is refused: it would collide with encoded output.
  Every config keeps its Archive recovery verdict (proved against the committed fixture).
- **Freezing.** The v4 → v5 step had to be frozen at a literal 5 and stop validating, like the two
  steps before it; the v5 → v6 step is now the only validating step and owns the chain's guarantee.

**Current decision**

`SCHEMA_VERSION` is 6. `upgradeMarkdownSections` converts version 5 (and re-runs on version 6) by the
rules above, matching the literal `'rich-text'`, and validates before the CLI writes a byte. It
refuses conflicting types for one section id, a `markdown` key in a Rich Text config, a Rich Text
created container, and any encoding that does not round-trip — naming the section or the action and
its path — and writes nothing. `pnpm prototype:upgrade` chains 2 → 3 → 4 → 5 → 6, keeps the backup,
temp-file rename and owner lock, and reports converted sections, history records, unreadable configs
and orphaned edits. A clean version-6 file is a byte-identical no-op.

Rich Text is retired: `RETIRED_SECTION_TYPES = ['rich-text']` in contracts, no capability, no web
registration, no prose noun. `SectionService.add` refuses it (after the actor and grant checks, before
any lookup) so browser, HTTP and MCP get the same `DomainRuleError`. The store refuses a document
holding it in `sections` or in any snapshot that can recreate a section, naming the upgrade. Seeds
write hand-authored Markdown.

**Limits of the v6 remedy.** Re-running the upgrade on version 6 fixes only *consistent* hand edits,
where every source for a section id agrees it is Rich Text. Rich Text written onto a section whose
snapshots say Markdown, or a `markdown` key written into a Rich Text config, still refuses.

The spec's §14 (document example and Slice 63 amendment), §29 (labels, capabilities), §30 (type list
and registered types), §31 (Archive and removal) and its folder tree were updated in the same change.

The committed fixture `packages/prototype-data/test/fixtures/history-v5-rich-text.json` was produced
once at commit `630e4ba` by the real domain from the pre-slice `nested-projects` seed; its provenance
is in that folder's `README.md`.

**Confidence**

High. Every supported starting version converts and reopens; repeat upgrades are byte-identical;
converted history Undoes and Redoes into Markdown with the same ids and labels, in the domain and
over real files through the CLI subprocess.

**Revisit when**

A real file holds a refusal case this entry treats as hand-edit-only, or the collapsed-whitespace
loss is felt in real use (the remedy would be a rendering change, never a re-conversion).
