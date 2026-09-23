# How contracts work

## Runtime flow

Contracts have no runtime of their own; they are parsed at boundaries.

1. **Host load** — `loadPersistence` parses `.prototype/data.json` with
   `PrototypeDocumentSchema`; the literal `schemaVersion: 5` is part of the schema, so a
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

## Operation payloads and history

`undo.ts` assembles the **payloads**, importing the eight row members from `row-history.ts`, the
`section.restore` member from `section-restore-history.ts`, the four placement members from
`shortcut-history.ts` and the two optional-page members from `page-history.ts`.
`UndoOperationSchema` is a discriminated union on `type` whose
nineteen strict members are pinned to `version: 1`: an unknown type, a later version or an extra key
fails parsing, so a stored action can never smuggle arbitrary JSON into an executor. Add captures
the created section and the placement Redo returns it to; move captures the subject page and
before/after neighbours; update captures a unique set of title, config, collapsed and column-span
changes; removal captures the section, placement, applied policy, exact rows, a required
`disposition` and the `archiveGeneration` it wrote, which must be the snapshot's plus one. Restore captures the archived marker and generation it found, the tombstone's
old position, the placement it actually landed on, and only the rows it revived — each of which must
say it came down with that section and is live in it afterwards. Each of the four shortcut payloads names
the **destination** project and nothing of the source; add and remove additionally capture the whole
canonical placement record, because their inverses have to recreate it, while update and move name
the placement by id and carry only what they changed. The
refinements reject malformed self-neighbours, duplicate fields, unchanged "changes", invalid
normalized titles and placements on another page. `operation-receipt.ts` defines `OperationReceiptSchema`, re-exported by `undo.ts` — strict, carrying only
`historyId`, `actionId`, `operation`, `revision`, `label`, `createdAt` and `expiresAt` — the write
results that embed it, `UndoResultSchema`/`RedoResultSchema`, and `UndoConflictSchema`, whose
required typed `nextStep` now has no "use a later receipt" member.

`operation-history.ts` holds the **stored history**; `operation-history-public.ts` holds the
snapshot-free summary and strict transition inputs shared with browser/transport consumers.
`OperationHistorySchema` is attributable to one actor
(`assertActorIsAttributable`, shared with activity) and refines `cursor ≤ orderHighWaterMark`;
whether the cursor's orders exist is a cross-collection rule the store checks.
`OperationActionSchema` has a positive `order`, a `state` of `applied`, `undone` or `retired`, and an
expiry after its creation. `OperationHistorySummarySchema` is strict all the way down — ids, labels,
revision, the project-level archived-ancestor `blockedBy`, never a payload — and its `historyId` is
`null` before the caller's first recorded write. Each `OperationHistoryEntrySchema` also carries its
own required, nullable `blockedBy` (`OperationHistoryBlockerSchema`): the archived project a
transition of **that step** would refuse for (Slice 41). `OperationHistoryTransitionInputSchema` and
`OperationHistoryStepInputSchema` (MCP) are strict. `OperationHistoryRefusalDetailsSchema` is the
typed half of a 409: seven reasons, each carrying the history, the named action and the current
summary. `SectionAlreadyRemovedDetailsSchema` carries only the section id and the recovered receipt.
MCP carries only the message, which starts with the same `reason`.

`PrototypeDocumentSchema` has `operationHistories` and `operationActions`, defaulted to `[]`, and no
`undoRecords` — a leftover key is stripped. `SCHEMA_VERSION` is 5; an older file needs
`pnpm prototype:upgrade` ([decision](../../decisions/2026-09-schema-version-5-conversion.md)).

## Key symbols

| Symbol | Kind | Role | Reference |
|---|---|---|---|
| `PrototypeDocumentSchema` | const | The whole `data.json` | [API](../../api/miscellaneous/variables.html#PrototypeDocumentSchema) |
| `SCHEMA_VERSION` | const | `5`; bump when an existing file would be wrong | [API](../../api/miscellaneous/variables.html#SCHEMA_VERSION) |
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
| `UndoOperationSchema` | const | Typed, versioned union of section operations and task/reflection add, update, archive and restore | [API](../../api/miscellaneous/variables.html#UndoOperationSchema) |
| `SectionRemovalDispositionSchema` | const | `retained` or `deleted`, required on every removal payload | [API](../../api/miscellaneous/variables.html#SectionRemovalDispositionSchema) |
| `OperationHistorySchema` | const | One actor's cursor, order high-water mark and revision in one project | [API](../../api/miscellaneous/variables.html#OperationHistorySchema) |
| `OperationActionSchema` | const | One ordered, stateful action holding a payload | [API](../../api/miscellaneous/variables.html#OperationActionSchema) |
| `OperationReceiptSchema` | const | What a caller holds after a committed section or row write; revision-ordered and payload-free | [API](../../api/miscellaneous/variables.html#OperationReceiptSchema) |
| `TaskAddResultSchema`, `TaskWriteResultSchema` | consts | Lightweight task create/write envelopes; non-create no-ops carry `operation: null` | [API](../../api/miscellaneous/variables.html#TaskWriteResultSchema) |
| `ReflectionAddResultSchema`, `ReflectionWriteResultSchema` | consts | Lightweight reflection create/write envelopes | [API](../../api/miscellaneous/variables.html#ReflectionWriteResultSchema) |
| `OperationHistorySummarySchema`, `OperationHistoryEntrySchema`, `OperationHistoryBlockerSchema` | const | The caller's next Undo and Redo — each with its own step blocker — revision and project-level archived blocker | [API](../../api/miscellaneous/variables.html#OperationHistorySummarySchema) |
| `OperationHistoryTransitionInputSchema` | const | `{ actionId, direction, expectedRevision }`, strict | [API](../../api/miscellaneous/variables.html#OperationHistoryTransitionInputSchema) |
| `OperationHistoryTransitionResultSchema` | const | Direction, action, that direction's result and the refreshed summary | [API](../../api/miscellaneous/variables.html#OperationHistoryTransitionResultSchema) |
| `OperationHistoryRefusalDetailsSchema` | const | 409 details discriminated on seven `history_*` reasons, each with the current summary | [API](../../api/miscellaneous/variables.html#OperationHistoryRefusalDetailsSchema) |
| `SectionAlreadyRemovedDetailsSchema` | const | Exact-owner receipt carried by a repeated-removal 409 | [API](../../api/miscellaneous/variables.html#SectionAlreadyRemovedDetailsSchema) |
| `UndoResultSchema` | const | Discriminated add removal, field restoration, move placement or removal result | [API](../../api/miscellaneous/variables.html#UndoResultSchema) |
| `RedoResultSchema` | const | Discriminated add recreation, field reapplication, move placement or re-removal result | [API](../../api/miscellaneous/variables.html#RedoResultSchema) |
| `SectionAddResultSchema` | const | `create_section` / `POST …/sections`: the created section and its required add receipt | [API](../../api/miscellaneous/variables.html#SectionAddResultSchema) |
| `SectionWriteResultSchema` | const | Update and move: the section and a receipt, or `operation: null` for a true no-op | [API](../../api/miscellaneous/variables.html#SectionWriteResultSchema) |
| `SectionFieldChangeSchema` | const | One recorded settings field (`title`, `config`, `collapsed`, `columnSpan`) with before and after values | [API](../../api/miscellaneous/variables.html#SectionFieldChangeSchema) |
| `UndoConflictSchema` | const | One entity a transition would overwrite, with its typed next step | [API](../../api/miscellaneous/variables.html#UndoConflictSchema) |
| `assertActorIsAttributable` | function | The user/agent/system attribution rule, shared by events and operation histories | [API](../../api/miscellaneous/variables.html#assertActorIsAttributable) |
| `ActivityHistoricalContextSchema` | const | Validated target label and owning project/root captured for durable audit | [API](../../api/miscellaneous/variables.html#ActivityHistoricalContextSchema) |
| `ToolPermissionSchema` | const | Static grant or stored-operation-family discovery declaration | [API](../../api/miscellaneous/variables.html#ToolPermissionSchema) |
| `OPERATION_FAMILY_PERMISSION` | const | Section/task/reflection family → write grant | [API](../../api/miscellaneous/variables.html#OPERATION_FAMILY_PERMISSION) |

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

## Row and Activity contracts

`row-history.ts` defines strict task/reflection payloads and transition results.
`row-write-result.ts` and `shortcut-write-result.ts` own the lightweight write envelopes:
creation requires a receipt; normalized no-ops answer `operation: null`; a shortcut removal names
ids and a required receipt rather than a placement that no longer exists.
`section-restore-history.ts` and `shortcut-history.ts` hold the Slice 37 payloads and their
directional results, kept out of those envelope modules for the same reason `row-history.ts` is.
`page-history.ts` holds the two optional-page payloads and their directional results, and
`page-write-result.ts` the one `{ page, operation }` envelope both toggle writes answer — nullable,
because a caller addressing a page by kind cannot know whether it is creating the record or moving a
boolean. `page.add` captures the created page whole, so Redo recreates the same id and `createdAt`;
`page.update` captures the root, the page id, an optional kind and two **distinct** booleans. Neither
accepts Home or a work canvas: `OPTIONAL_PAGE_KINDS` is the narrow vocabulary both use, and the
directional results report an absent page on Undo Add and a present one everywhere else.
`project-history.ts` holds the three existing-project payloads — `project.update`,
`project.archive`, `project.reactivate` — as one shape: the subject `projectId` (never its root) and
the **changed** fields with exact before/after values, `null` standing for absence. `status` and
`completedAt` are recorded independently, exactly as the commit moved them, because the service's own
normalization does not always move them together; `parentProjectId` never clears; the kind follows the status crossing
the archive boundary; and only an update carries `archivedThroughout`, the flag the history
executor's narrow archived-subject exception reads. Every project result returns the current
project, which always still exists. `project-write-result.ts` holds the strict `{ project, operation }`
envelope, apart from the payloads for the same bundling reason. Transition results identify the subject and affected
rows, report absence on Undo Add, and include implicit-container placement when needed.
`history-placement.ts` owns shared placement shapes without an import cycle. `tool-permissions.ts`
defines the static/family declaration and `OPERATION_FAMILY_PERMISSION`.

`live.ts` also names `PROJECT_RECORD_EVENT_TYPES` and `isProjectRecordEvent`: the frames that say
a project record changed, which open browser root aggregates re-read on from any root because a
cross-root reparent's one frame names only the root it moved to. The domain suite proves project
writes and transitions emit exactly this list.

`ActivityHistoricalContextSchema` captures target kind, id and label plus owning project/root.
Event identity must agree with that context. Activity contains no executable inverse payload.
