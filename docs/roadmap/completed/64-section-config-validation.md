<!-- completed-record id="64" closed="2026-10-03" summary="Markdown config is exactly { markdown } or empty, refused otherwise on every write; the v6 converter drops extras" -->
# Slice 64 — Section configs validated by type

## Goal

A Markdown section can only ever be written with `{}` or exactly `{ markdown: string }`. Every write
path (browser, HTTP, MCP) gets a clear refusal for anything else. The v5 → v6 converter produces
only those two shapes, so "Markdown prose stored beside extra keys" stops being a state anything
has to handle.

## Spec sections

- §11: config shapes a type declares are defined once, in `packages/contracts`.
- §14: the v5 → v6 converter's malformed-config rule changes (user, 2026-10-02: no legacy extra data
  is worth keeping). The Slice 63 amendment's "a config with extra keys keeps them and shows its
  prose read-only" sentence is corrected.
- §29: a section definition owns its config shape. A type that owns config now also declares its
  schema in contracts, and the domain enforces it on writes. This amends "its folder, one registry
  line and one capability line".
- §30 ("Which pages accept sections"): the open type string is unchanged; undeclared types stay
  unvalidated. The sentence about prose shown read-only beside unreadable config is removed.
- §54: `create_section` and `update_section` refuse a malformed Markdown config.

## Build

- Contracts gain `MarkdownConfigSchema` (strict) and a per-type config-schema map holding only
  `markdown`. A pure checker returns a refusal sentence (its wording lives in contracts) or nothing.
- `SectionService.add` and `update` refuse a config the checker rejects, with `DomainRuleError`.
- The web Markdown folder imports the schema from contracts. `readMarkdownConfig` drops its
  `unreadable.markdown` field, and the body drops the read-only prose.
- `convertConfig` in the v5 → v6 converter writes `{ markdown: encoded }` when `text` is a string,
  else `{}`. It no longer keeps extras, keeps non-string `text`, or refuses on a `markdown` key. The
  CLI reports how many configs lost keys.

## Done when

A malformed Markdown config is refused over MCP, HTTP and the domain, naming what is wrong, and
nothing is written. A valid one still saves. Non-Markdown and unregistered types accept configs as
before. Converting the committed v5 fixture leaves every converted config `{}` or `{ markdown }`,
and the CLI says how many lost keys. The web no longer has a prose-beside-extras branch. `pnpm test`,
`pnpm lint` and `pnpm docs:check` are green.

## Do not

- Validate the six other registered types (user, 2026-10-02: Markdown only; a type gets a schema
  when it owns config).
- Validate configs replayed by Undo/Redo/Restore or copied by Duplicate. Those reproduce recorded
  or stored state rather than accept new input. One test pins Duplicate's behaviour so it is
  intentional.
- Make the store refuse a document holding a malformed Markdown config, or bump `SCHEMA_VERSION`.
  The live `.prototype/data.json` was scanned on 2026-10-02 and holds none.
- Re-convert Markdown sections that the old rule already converted with extras.
- Make the fake web gateway refuse. It does not refuse retired types either; the domain is the one
  enforcement point.

<!-- ───────────── Written when the slice starts ───────────── -->

## Acceptance check

1. **Domain** (`pnpm --filter @cwm/domain test`):
   - `add` with `{ type: 'markdown', config: { markdown: 'x', summary: 'y' } }` throws
     `DomainRuleError`, and the message names `summary`.
   - The same holds for `{ markdown: 5 }` (the message names `markdown` and "string"), for
     `{ text: 'x' }`, and for `update` on a live Markdown section.
   - `update` refuses even when the incoming config equals a stored nonconforming one. Every
     incoming Markdown config is checked.
   - In every case the store snapshot, Activity and operation history are unchanged.
   - `{}` and `{ markdown: 'x' }` succeed. `progress` with `{ milestoneIds: [...] }` and an
     unregistered `calendar` with `{ view: 'month' }` succeed.
2. **MCP** (`pnpm --filter @cwm/mcp-tools test`): `create_section` and `update_section` with an
   extra key reject with `DomainRuleError`.
3. **HTTP** (`pnpm --filter prototype-host test`):
   - `POST /api/projects/:id/sections` with an extra key returns 409 `rule_violation`, the message
     names the key, and no section is created.
   - `PATCH /api/sections/:id` with an extra key returns 409, and the stored config is unchanged.
4. **Converter** (`pnpm --filter @cwm/prototype-data test`):
   - Every converted config in the committed v5 fixture, in every location (live, archived,
     `section.add`/`section.remove` snapshots, `section.update` before/after), is `{}` or exactly
     `{ markdown: string }`.
   - `{ text, extra }` becomes `{ markdown }`. `{ text: 5 }`, `{ markdown: 'x' }` with no `text`, and
     a non-object config become `{}`. `{ text, markdown }` converts instead of refusing.
   - `discardedConfigs` counts every converted **location**, sections and history alike, whose
     result is not the plain rename (any key dropped, or a non-string `text` emptied). The CLI
     message reports it.
5. **Web** (`pnpm --filter web test`): `readMarkdownConfig({ markdown: 'x', extra: 1 })` is
   `{ state: 'unreadable' }` with no `markdown`. The body and shortcut render only the note.
6. **Live run**:
   - With `pnpm dev:host` running, call `create_section` over `/mcp` with an extra key and see the
     refusal, then call it with `{ markdown }` and see it succeed.
   - With `pnpm dev:web` running, create and edit a Markdown section in the browser and check it
     saves. This only proves the happy path still works: the browser cannot produce a malformed
     config.
7. `pnpm test`, `pnpm lint` and `pnpm docs:check` are green. The e2e spec this slice edits passes
   under `pnpm e2e` if the environment allows; if it cannot run, that is reported.

## File-level change list

| File | Change | Responsibility |
|---|---|---|
| `packages/contracts/src/section.ts` | modify | `MarkdownConfigSchema` (`z.strictObject({ markdown: z.string() })`), `SECTION_CONFIG_SCHEMAS` (`{ markdown }`), and `sectionConfigRefusal(type, config): string \| undefined`. Empty `{}` is accepted for every type; an undeclared type is not checked (`Object.hasOwn`); the sentence names unexpected keys or the wrong-typed key. |
| `packages/contracts/src/section.test.ts` | modify | Checker cases. |
| `packages/domain/src/section-service.ts` | modify | `add` checks after the retired-type refusal, before any lookup. `update` checks after `require`/`assertLive`/`assertProjectWritable`, whenever `input.config` is present. Both throw `DomainRuleError`. |
| `packages/domain/src/section-service.test.ts` | modify | Refusal, ordering and acceptance cases. The label-matrix case at :344 (`{ markdown, tone }` → "Updated the Plan section") moves to title plus config, which still produces the general label. |
| `packages/domain/src/section-edit-undo.test.ts` | modify | The reordered-keys no-op (:311–319) and "restores a cleared title and a replaced config exactly" (:613–617) move off Markdown-with-extras onto an unvalidated type (`progress`). |
| `packages/domain/src/markdown-conversion.test.ts` | modify | Every converted config passes the checker. The verdict is preserved exactly where the source was `{}` or `{ text: string }`. Undo and Redo of a converted `section.update` whose before and after both became the same config succeed. |
| `packages/mcp-tools/src/tools/sections.ts` | modify | `create_section`/`update_section` descriptions say a Markdown config is exactly `{ markdown }` and anything else is refused. |
| `packages/mcp-tools/src/contract.test.ts` | modify | The `update_section` matrix `prepare` (:312–314) drops `extra`; refusal cases for both tools. |
| `apps/prototype-host/api/routes.test.ts` | modify | The round-trip test (:555–560) stops sending `extra`; 409 cases for POST and PATCH. |
| `apps/e2e/section-edit-undo.spec.ts` | modify | :56–65 drops `tone`; the title/collapse/span changes keep the combined edit. |
| `packages/prototype-data/src/upgrade-markdown-sections.ts` | modify | New `convertConfig` rule; `unreadableConfigs` becomes `discardedConfigs`, counted per location; the `markdown`-key refusal is removed; the doc comment is updated. |
| `packages/prototype-data/src/upgrade-markdown-sections.test.ts` | modify | The conversion-table expectations (:185–198); the collision refusal (:236–240) becomes a conversion case; the field rename in the v6 rerun (:269); new cases for an archived `{ text: 5 }`, `{ markdown: 'x' }`, and an extras-only history change. |
| `packages/prototype-data/src/upgrade-cli.ts` / `.test.ts` | modify | Field rename and the new report sentence. The no-backup refusal test (:283–293) uses a Rich Text created container instead of the removed collision. Counts at :213, :328, :336. |
| `packages/prototype-data/src/seeds.test.ts` | modify | Every seeded section config passes the checker. |
| `apps/web/src/app/features/projects/sections/markdown/markdown-config.ts` / `.spec.ts` | modify | Import the schema from contracts; no `markdown` on `unreadable`. |
| `apps/web/src/app/features/projects/sections/markdown/markdown-section-body.{ts,html}` / `.spec.ts` | modify | Remove `unreadableProse` and `[data-markdown-unreadable-prose]` (spec :135–149). Keep :153: a live update to `{ markdown, extra }` still blocks Save, since hand-edited data can deliver it. |
| `apps/web/src/app/features/projects/shortcuts/shortcut-frame.spec.ts` | modify | The Slice 63 prose-with-guidance case (:117) becomes note-only. |
| `apps/web/src/app/features/projects/sections/registry.spec.ts` | modify | Every registered type's default config passes `sectionConfigRefusal`. |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` | modify | `CURRENT_SLICE = 64`. |
| `docs/decisions/2026-10-section-config-validated-on-write.md` + `README.md` index | create / modify | §78 entry. |
| `docs/decisions/2026-08-section-config-ownership.md` | modify | Dated amendment: a type that owns config declares its schema in contracts, reversing "Type each section's config in contracts: rejected" for declared types. |
| `docs/decisions/2026-10-schema-version-6-markdown-conversion.md` | modify | Dated amendment: extras dropped, non-string `text` becomes `{}`, no `markdown`-key refusal. The "every config keeps its Archive recovery verdict" claim now holds only for clean sources: malformed ones get the clean config's verdict, and an archived malformed section may become empty and unlisted (accepted; it is among the discarded configs the CLI reports, not identified separately). |
| `docs/decisions/2026-10-markdown-source-and-rendering.md` | modify | Dated amendment: the unreadable state no longer carries prose. |
| Spec §14 (Slice 63 amendment, line ~643), §29 (registry cost), §30 ("Which pages accept sections") | modify | As in Spec sections, with an amendment note. |
| `docs/architecture/contracts/{how,what,why}.md` | modify | New symbols. The "Adding a section type" trap changes. why.md's "contracts own no config schema" / "Only the section's own folder parses it" is corrected. |
| `docs/architecture/domain/how.md`, `why.md` | modify | `SectionService` refusal; decision link. |
| `docs/architecture/mcp-tools/how.md`, `why.md` | modify | Refusal on the two tools; decision link. |
| `docs/architecture/prototype-data/how.md`, `why.md` | modify | The converter's config rule (replacing the `markdown`-key refusal and "unreadable configs kept" sentences) and the CLI count. |
| `docs/architecture/web/projects/how.md`, `why.md` | modify | Remove the prose-beside-extras paragraph (how :180–183) and the read-only-prose line (why :164). |
| `.prototype/notes.json` | modify | Resolve `note-2026-10-02-003`. |

## Test plan — tests first

| Test | Proves |
|---|---|
| `section.test.ts: sectionConfigRefusal accepts {} and { markdown } for markdown` | The valid shapes pass. |
| `…: names unexpected keys / a non-string markdown` | The refusal sentence says what is wrong. |
| `…: undeclared types and inherited Object keys are not checked` | `progress`, `calendar` and `toString` return undefined. |
| `section-service.test.ts: add refuses a malformed markdown config, writing nothing` | Domain refusal on create, with no Activity, no history and no section. |
| `…: add refuses before any lookup` | A missing project still answers with the config refusal, so the refusal confirms nothing about the project. |
| `…: an unpermitted actor gets PermissionDeniedError, not the config refusal` | Permission is checked first (add and update). |
| `…: update refuses a malformed markdown config, writing nothing` | Domain refusal on update. |
| `…: update ordering: missing section → not found; archived section → archived refusal; archived project → reactivate` | The check runs after the existing ones, even with a bad config. |
| `…: update re-sending a stored nonconforming config is refused` | Every incoming Markdown config is checked. |
| `…: update without config on a stored nonconforming section works` | A title change is unaffected. |
| `…: duplicate copies a stored nonconforming config` | The non-goal is intentional. |
| `…: progress and unregistered types keep accepting their configs` | Markdown-only scope. |
| `contract.test.ts: create_section / update_section refuse an extra key` | MCP surface. |
| `routes.test.ts: POST and PATCH with an extra markdown key answer 409 rule_violation, storing nothing` | HTTP surface. |
| `upgrade-markdown-sections.test.ts: applies each row of the conversion table` (rewritten) | `{ text, extra }`, `{ text: 5 }`, `{ text, markdown }`, `{ markdown }`, an archived `{ text: 5 }` and an extras-only history change all convert to clean configs; `discardedConfigs` counts each location. |
| `upgrade-cli.test.ts: message reports discarded configs`; the no-backup refusal on a Rich Text container | The CLI report and its refusal path. |
| `markdown-conversion.test.ts: every converted config is valid; clean sources keep their verdict; a converted archived `{ text: 5 }` is `{ include: false }` and `{ text, extra }` is `config`; a collapsed update (built in the test — the fixture has none) undoes and redoes` | Fixture-wide, through the domain, including the accepted Archive change. |
| `seeds.test.ts: every seeded section config is valid` | Seeds cannot regress. |
| `registry.spec.ts: every default config is valid` | Registry and contracts agree. |
| `markdown-config.spec.ts`, `markdown-section-body.spec.ts`, `shortcut-frame.spec.ts` (rewritten) | Unreadable shows the note only. |

## Boundaries touched

- **Contracts once.** The schema moves from the web into contracts, and the web imports it. That
  leaves no duplicate.
- **Domain abstractions only.** The checker is a pure contracts function; there is no new service
  edge.
- **MCP calls domain services.** The tools only change their descriptions; enforcement is in
  `SectionService`.
- **Components and gateways.** The web change is to the section folder's own config reader and its
  template.

## Explicit non-goals

- Validating the other six types.
- Validating Undo/Redo/Restore, Duplicate, the fake gateway, or store loads.
- Bumping `SCHEMA_VERSION`, or re-converting files that the old rule already converted.
- Typing `config` per type in `CreateSectionInputSchema` (a discriminated union). Domain refusal is
  enough, and it keeps §30's open type string.

## Open questions

- None outstanding. Scope was resolved with the user on 2026-10-02: Markdown only; the converter
  drops extras. Three follow-on calls are made under that direction:
  - An identical re-send of a stored bad config is refused.
  - An archived malformed section may convert to empty and unlisted.
  - Duplicate copies stored state unchecked.

## Revisions

- **Round 1 (2026-10-02):** The reviewer verified every claim against the code.
  - **Docs.** Added the missing amendments: the 2026-08 config-ownership decision (which had
    rejected contracts-owned config), spec §14 and §29 proper (the §30/§31 labels were corrected),
    and why.md in contracts, mcp-tools, prototype-data and web/projects.
  - **Converter.** Pinned that `discardedConfigs` counts every location, and recorded that the v6
    decision's verdict guarantee now covers only clean sources.
  - **Breaking tests.** Named the tests the change breaks: contract.test :312, section-edit-undo
    :613, section-service :344, upgrade-cli :283–293 and counts, and the e2e
    `section-edit-undo.spec.ts`.
  - **New tests.** Added PATCH 409, update ordering, the same-value resend, a Duplicate pin, the
    archived `{ text: 5 }`, `{ markdown }`-only, and Undo/Redo of a collapsed history change.
  - **Acceptance.** Acceptance item 6 now says what it can and cannot prove.
- **Round 2 (2026-10-02):** All round-1 findings were confirmed addressed. One gap remained: the
  accepted "archived malformed section becomes unlisted" outcome was untested where it shows. Added
  Archive-verdict assertions on the converted archived `{ text: 5 }` and `{ text, extra }`, and
  reworded the v6 amendment, since `discardedConfigs` does not identify unlisted sections. No other
  findings.

<!-- ───────────── Written before roadmap.mjs complete ───────────── -->

## Outcome

**Deliverables** — A Markdown section can be written only with `{}` or exactly `{ markdown: string }`.
[`MarkdownConfigSchema`, `SECTION_CONFIG_SCHEMAS` and `sectionConfigRefusal`](../../../packages/contracts/src/section.ts)
define the shape once. [`SectionService`](../../../packages/domain/src/section-service.ts) refuses
anything else on `add` and `update` with a `DomainRuleError` that names the offending key, so MCP,
HTTP (409 `rule_violation`) and the browser all get the same answer.

The [v5 → v6 converter](../../../packages/prototype-data/src/upgrade-markdown-sections.ts) writes only
those two shapes. It drops extras, empties a config with no string `text`, and reports
`discardedConfigs` per location through the CLI. The web Markdown section's unreadable state shows
only its guidance note.

Run live against a scratch copy of `nested-projects` (never the user's data file):

- MCP `create_section` and `update_section` refused an extra key and a non-string `markdown` with
  that sentence, and accepted the exact config.
- The agent-made section rendered with Edit in the browser, and a browser edit stored exactly
  `{ markdown }`.

Every suite in `pnpm test` passed (contracts 364, repositories 196, web 967, prototype-data 249,
domain 831, mcp-tools 177, host 290), and `pnpm lint` and `pnpm docs:check` are green.

**Deliberate choices** — The decisions below are recorded in
[the decision](../../decisions/2026-10-section-config-validated-on-write.md).

- **Markdown only.** The user chose this: the six other types read no config.
- **Enforced in the domain, not typed in the input schema.** This keeps §30's open type string.
- **Every incoming Markdown config is checked**, even an identical re-send of a stored bad one.
- **Undo, Redo, Restore and Duplicate stay unchecked.** They reproduce existing state; a test pins
  Duplicate's behaviour.
- **The converter drops instead of keeping.** The user chose this: nothing legacy was worth saving.
  An archived malformed section may therefore convert to empty and unlisted. This is accepted and
  counted among the discarded configs.

**Deviations from the plan** —

- `apps/prototype-host/recovery-undo-acceptance.test.ts` asserted the old CLI sentence. The plan's
  file list missed it, and the full suite caught it.
- Review added three small fixes: the `SectionConfigSchema` doc comment, a note on the
  [Slice 59 umbrella](../planned/59-markdown-and-work-navigation.md) whose C2 guidance this
  supersedes, and softer "only a hand edit" wording. Undo and Redo can still replay pre-Slice-64
  history.
- The e2e spec was edited (`tone` dropped) but `pnpm e2e` was not run.

**Deferred** — Nothing from this slice. A store-level refusal or a cleanup of malformed Markdown
configs waits until a real file holds one. A schema for any other type waits until that type reads
config.

**Open questions** — `note-2026-10-02-002` remains open: clicking Edit on converted prose shows its
escapes.

**Documentation updated** —

- **Decisions:** the new entry and its index row; dated amendments to the 2026-08 config-ownership,
  Markdown-source and schema-v6 decisions.
- **Spec:** §14, §29 and §30.
- **Architecture:** contracts how/what/why, domain how/why, mcp-tools how/why, prototype-data
  how/why, web/projects how/why.
- **Roadmap:** the Slice 59 umbrella note.
- **Friction:** `.prototype/notes.json` (`note-2026-10-02-004`).
