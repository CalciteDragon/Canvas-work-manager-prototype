# How contracts work

## Runtime flow

Contracts have no runtime of their own; they are parsed at boundaries.

1. **Host load** — `loadPersistence` parses `.prototype/data.json` with
   `PrototypeDocumentSchema`; the literal `schemaVersion: 3` is part of the schema, so a
   stale file fails here with a message rather than mid-session.
2. **Every unit of work** — the repositories validate the whole document again at commit
   (`validateDocumentIntegrity`, in [repositories](../repositories/how.md)), so a rule the
   domain forgot cannot persist a broken document.
3. **HTTP** — each route parses its body with the matching `Create*`/`Update*` input
   schema and answers a contract shape; a parse failure is a 400 in the host's error
   mapping.
4. **MCP** — each tool's `inputSchema` is the same Zod input; the registry publishes it
   as JSON Schema in `tools/list`.
5. **Seeds** — every builder's output is parsed by the document schema in
   `seeds.test.ts`, so a broken seed fails CI.
6. **Web** — the gateway adapter types its responses with the inferred types; forms build
   inputs of the input types. The browser trusts the host and does not re-parse.

## Section create positions

`CreateSectionInputSchema` and `CreateSectionShortcutInputSchema` each accept an optional
`position` using `PositionSchema`. It is a non-negative integer interpreted by the domain as a
zero-based insertion point in the target page's combined placement order. Omitting it preserves
append behavior; a value past the end is clamped to the end. HTTP and MCP parse these shared
schemas, so they enforce the same input shape. The shortcut input remains strict about undeclared
fields.

## Undo records

`undo.ts` holds every Undo shape. `UndoOperationSchema` is a discriminated union on `type` whose
one member, `SectionRemoveUndoOperationSchema`, is strict and pinned to `version: 1`: an unknown
type, a later version or an extra key fails parsing, so a stored record can never smuggle
arbitrary JSON into an executor. Its refinements hold the record to what removal can actually
produce — rows exactly when a policy was applied, a reassign target exactly for reassign, unique
rows of the kind the section owns, a live pre-removal section on the placement's page.
`UndoRecordSchema` shares `assertActorIsAttributable` with activity. The receipt is strict and
carries only `undoId`, `operation`, `label`, `createdAt` and `expiresAt`. `UndoRefusalDetailsSchema`
is the typed half of a 409; MCP carries only the message, which starts with the same `reason`.

`PrototypeDocumentSchema.undoRecords` is defaulted to `[]`, which is why it arrived inside
schema version 3 without a converter: an older file parses with every collection unchanged.

## Key symbols

| Symbol | Kind | Role | Reference |
|---|---|---|---|
| `PrototypeDocumentSchema` | const | The whole `data.json` | [API](../../api/miscellaneous/variables.html#PrototypeDocumentSchema) |
| `SCHEMA_VERSION` | const | `3`; bump when an existing file would be wrong | [API](../../api/miscellaneous/variables.html#SCHEMA_VERSION) |
| `IsoDateTimeSchema` | const | `z.iso.datetime()`; seconds may be omitted, fractions any length — see `Instant` in domain | [API](../../api/miscellaneous/variables.html#IsoDateTimeSchema) |
| `PositionSchema` | const | Non-negative zero-based position for list, canvas or dashboard order | [API](../../api/miscellaneous/variables.html#PositionSchema) |
| `isRootProject` | function | Type guard on `Project.kind` | [API](../../api/miscellaneous/variables.html#isRootProject) |
| `NAVIGABLE_PAGE_KINDS` | const | `home`, `todos`, `archive`, `reflections` — `work` is a page but not a tab | [API](../../api/miscellaneous/variables.html#NAVIGABLE_PAGE_KINDS) |
| `SECTION_CAPABILITIES` | const | The one per-type declaration: owned rows and recovery capability (`owned-content`, `config`, `none`) | [API](../../api/miscellaneous/variables.html#SECTION_CAPABILITIES) |
| `sectionCapabilityOf` | function | Own-property lookup; `undefined` means unknown, never disposable | [API](../../api/miscellaneous/variables.html#sectionCapabilityOf) |
| `SECTION_OWNERSHIP` | const | Container type → owned row kind, derived from the capabilities; absence makes a type a view | [API](../../api/miscellaneous/variables.html#SECTION_OWNERSHIP) |
| `ownedKindOf` | function | Lookup over that map | [API](../../api/miscellaneous/variables.html#ownedKindOf) |
| `nameOf` | function | A section's display name: `title` override, else derived from `type` | [API](../../api/miscellaneous/variables.html#nameOf) |
| `ProjectArchiveSectionRecoverySchema` | const | Archive section entry's recovery metadata union | [API](../../api/miscellaneous/variables.html#ProjectArchiveSectionRecoverySchema) |
| `UndoOperationSchema` | const | Typed, versioned union of undoable operations; `section.remove` v1 only | [API](../../api/miscellaneous/variables.html#UndoOperationSchema) |
| `UndoRecordSchema` | const | A stored inverse: owner, actor, `sequence`, expiry, `consumedAt`, operation | [API](../../api/miscellaneous/variables.html#UndoRecordSchema) |
| `UndoReceiptSchema` | const | What a caller holds after a committed removal; no inverse data | [API](../../api/miscellaneous/variables.html#UndoReceiptSchema) |
| `UndoResultSchema` | const | Outcome, restored section, placement strategy and row count | [API](../../api/miscellaneous/variables.html#UndoResultSchema) |
| `UndoRefusalDetailsSchema` | const | 409 details discriminated on `reason` | [API](../../api/miscellaneous/variables.html#UndoRefusalDetailsSchema) |
| `assertActorIsAttributable` | function | The user/agent/system attribution rule, shared by events and Undo records | [API](../../api/miscellaneous/variables.html#assertActorIsAttributable) |

## Dependencies

**Depends on**

- `zod` (v4). Nothing else, and nothing from this workspace.

**Depended on by**

- [domain](../domain/overview.md), [repositories](../repositories/overview.md),
  [mcp-tools](../mcp-tools/overview.md), [prototype-data](../prototype-data/overview.md),
  [prototype-host](../prototype-host/overview.md), [web](../web/overview.md) — every other
  system, through the `@cwm/contracts` path alias in `tsconfig.base.json`.

## Invariants and lints

- **One definition per shape.** There is no `interface Task` anywhere else; the web app
  imports the inferred types. A reviewer's boundary pass checks this (AGENTS.md step 4).
- **Inputs never carry ids or timestamps** the domain assigns (§45). `null` clears,
  `undefined` leaves alone.
- **Every input schema has a JSON Schema form**, because the MCP registry publishes it:
  no `z.undefined()`, no functions, no transforms that lose the shape.
- **Every schema has a test** in `src/<file>.test.ts`: one valid fixture accepted, one
  malformed rejected (Slice 2's rule, still the convention).

## Commands

```bash
pnpm --filter @cwm/contracts test   # vitest
pnpm --filter @cwm/contracts lint   # tsc --noEmit
```

## Changing it

- **Adding a field:** add it to the entity schema, then to the input schema if a caller
  may set it, then follow the type errors: seeds (`packages/prototype-data/src/seeds.ts`),
  the JSON repositories' integrity checks if it is a reference, the routes, the gateway,
  the tool. Decide whether an existing `data.json` becomes wrong; if so, bump
  `SCHEMA_VERSION` and either reset or write a bounded converter (§14).
- **Adding a section type:** one line in the web registry and one entry in
  `SECTION_CAPABILITIES` declaring its owned rows (if any) and recovery capability —
  `registry.spec.ts` fails without it; if its display name is not derivable from its `type`, one
  entry in `SECTION_DISPLAY_NAMES` — `registry.spec.ts` fails at the moment a type incurs
  that cost.
- **Adding a derived read model:** its own file, exported from `index.ts`, with the rule
  that it projects canonical records (the `Task` itself, not a copy) wherever a caller will
  act on them — see `project-todos.ts` for the pattern.
- **The trap:** `z.object` strips unknown keys. A branch that merely omits a field accepts
  it silently and drops it; use `z.strictObject` when absence is the rule (25.1 found this
  with `parentProjectId`).
