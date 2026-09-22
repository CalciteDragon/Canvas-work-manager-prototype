# Why contracts exist

## The problem it solves

Five consumers need the same shapes — Angular forms, the host's routes, the MCP tool
schemas, the seeds and the tests — and the prototype's whole purpose is to change those
shapes often (§1: "alter data shapes"). Five hand-maintained copies would drift on the
first change and the drift would surface as a 500 in a browser. One schema, parsed at
every boundary, is what makes a shape change a type-error hunt rather than a debugging
session (§11).

## Forces

- **Runtime validation, not only types.** A data file, a seed and an MCP input all
  arrive as untyped JSON; a TypeScript interface protects none of them. Zod gives one
  definition that is both the type and the parser.
- **MCP publishes the input schemas** (§55), so every input must have a JSON Schema
  representation. This is why `CreateProjectInput` is a `z.strictObject` union rather
  than a schema using `z.undefined()`, which has no JSON Schema form.
- **The document is one file** (§14), so the document schema is the migration boundary:
  a version mismatch must be fatal at load, and a bump must be deliberate.
- **The contracts are MVP-reusable** (§70) and must never learn about the prototype's
  fakes: no token field on `AgentConnection`, no seed names as an enum.

## The shape, and the alternatives rejected

**Entities and inputs are separate schemas.** An input carries only what a caller may
set. Rejected: `Entity.partial()` as the update input — it would let a caller write
`createdAt` and would make "clear this field" indistinguishable from "leave it alone".

**Section and shortcut creation carry an optional insertion position.** Both write inputs use
the shared `PositionSchema`, so a browser request and an MCP call can ask for the same place
without a transport-specific field or a second move operation. The existing combined canvas
order for sections and Home shortcuts remains the ordering base
([decision](../../decisions/2026-09-home-orders-sections-and-shortcuts-together.md)); the
optional insertion behavior follows the approved direct-editing direction
([decision](../../decisions/2026-09-direct-canvas-editing-direction.md)), with the create-position
rule recorded in [contextual insertion names its position](../../decisions/2026-09-contextual-insertion-names-its-position.md).
The domain applies it as part of creation.

**`Project` is a discriminated union on `kind`** (`root` | `subproject`) since 25.1, so a
workspace and a unit of work differ by what the parser enforces rather than by what each
call site remembers ([decision](../../decisions/2026-09-project-workspaces-and-subproject-work-units.md)).

**Section capabilities are one map in contracts, not a registry entry in the web app.**
Which section types own rows is needed by the domain (cascade on removal) and by the UI
(registry `kind`), and what removing a type could leave worth recovering is needed by the
Archive projection, so `SECTION_CAPABILITIES` sits below all of them and `SECTION_OWNERSHIP`
is derived from it ([ownership](../../decisions/2026-09-sections-own-their-data.md),
[recovery](../../decisions/2026-09-content-oriented-archive-policy.md)). The cost: every
registered type declares a capability, which `registry.spec.ts` enforces. An undeclared type
is *unknown*, never disposable. The capability is a declaration, not a verdict — the domain
combines it with the content that actually remains.

**Section names are derived, with an optional stored override.** `nameOf` over the
`type` string plus a one-entry display-name table; `title` is optional
([decision](../../decisions/2026-09-a-section-has-a-name.md)).

**Section config is an opaque object replaced whole.** Only the section's own folder
parses it ([decision](../../decisions/2026-08-section-config-ownership.md)).

**Edit Undo records a field footprint, not a whole snapshot.** Title, config, collapse and span
are the only explicit settings fields; config is still one structural replacement. A move stores
combined neighbours, and an add stores only the created section needed for a safe non-cascading
delete, plus the placement Redo returns it to. The public receipt exposes only ids, the operation
and the history's revision, so transport clients cannot steer an inverse
([decision](../../decisions/2026-09-section-edit-undo-boundaries.md)).

**A history's cursor is an order value, and every shape a client sees is snapshot-free.** The cursor
cannot dangle when an action is pruned, the summary is strict all the way down, and a refusal
always carries the current summary so a stale caller reconciles without a second read
([scope](../../decisions/2026-09-operation-history-scope.md),
[retention](../../decisions/2026-09-operation-history-retention.md)).

**Task and reflection history uses typed footprints and transport-light result modules.** Row
creates capture their complete entity and any implicit container; updates capture only changed
fields and structural effects; archive and restore capture their exact affected rows. Public write
envelopes and history cursor shapes are kept in `row-write-result.ts` and
`operation-history-public.ts`, apart from executable payloads, so a browser type import does not
drag the inverse graph into its bundle
([decision](../../decisions/2026-09-row-operation-history.md)).

**A Restore payload is an exact footprint, and a shortcut payload holds no source.** `section.restore`
captures the markers, generation, old position and committed placement of one Restore plus only the
rows it revived, so an inverse can never recompute a cascade and absorb someone else's work. Each of the four
shortcut payloads names the **destination** project, which is both where the action belongs and what
`operationProjectOf` has to answer without a repository read; add and remove also capture the whole
placement record their inverses must recreate, while update and move name it by id. Nothing of the
source appears in any of them, so a source edit is not a placement conflict. `shortcut-write-result.ts` keeps the
transport envelopes out of that module for the same reason `row-write-result.ts` does
([decision](../../decisions/2026-09-section-restore-and-shortcut-history.md)).

**An optional-page payload is confined to the three kinds a toggle can name.** `page.add` captures
the created record whole because its Redo recreates the same id and `createdAt`; `page.update` carries
two distinct booleans, so a payload cannot describe a toggle that changed nothing. Home and a work
canvas are refused by both, because `validateDocumentIntegrity` requires them and no service can
create or disable one — a payload that could name one would describe an inverse that leaves the
document invalid. `page-write-result.ts` keeps the transport envelope out of that module for the same
reason `shortcut-write-result.ts` does
([decision](../../decisions/2026-09-optional-page-operation-history.md)).

**Activity owns historical display identity.** A task or reflection Add can be undone safely
without keeping a canonical tombstone: its earlier events retain a validated target label and
owning project/root context, but no executable inverse
([decision](../../decisions/2026-09-historical-activity-identity.md)).

**`ActivityAction` is an open `entity.verb` string**, not an enum: §57 names no action
list and every slice adds verbs. `LiveEvent.type` reuses it so a frame is the
announcement of the activity record that was just written, not a parallel type.

**Versioning without a migration runner.** `SCHEMA_VERSION` went 1 → 2 (rows name their
section) with a reset, and 2 → 3 (kinds and pages) with one bounded converter because a
real file was by then worth keeping. Version 4 introduced operation histories; version 5 requires
captured Activity identity. Three bounded, named steps are chained by the CLI without becoming a
general migration framework
([decision](../../decisions/2026-09-schema-version-5-conversion.md)).

## Consequences

- A shape change is one edit plus the type errors it produces; nothing can be forgotten
  silently. A malformed seed fails its test before it can surprise a session.
- The MCP registry's input schemas are exactly the inputs the host validates — an agent
  and a person cannot be told different rules.
- Everything else in the repository depends on this package, so it must stay free of
  everything else: zod is its only dependency, and it stays that way.

## Decisions that shape this system

- [Persona contract fields](../../decisions/2026-08-persona-contract-fields.md)
- [Project statuses, milestone statuses, task priorities](../../decisions/2026-08-status-and-priority-value-sets.md)
- [A date-only task due date is stored at UTC end-of-day](../../decisions/2026-08-task-date-only-due-time.md)
- [A section config is an object at rest, replaced whole on write](../../decisions/2026-08-section-config-ownership.md)
- [What an `Identity` is, and where it comes from](../../decisions/2026-08-identity-contract-and-me-route.md)
- [What `ActivityEvent.summary` is for, and what it is not](../../decisions/2026-08-activity-summary-ownership.md)
- [Container sections own their rows; view sections own nothing](../../decisions/2026-09-sections-own-their-data.md) — `sectionId`, `SECTION_OWNERSHIP`
- [A section has a name, and the default is derived rather than stored](../../decisions/2026-09-a-section-has-a-name.md) — `nameOf`, `title`
- [Home orders sections and shortcuts together](../../decisions/2026-09-home-orders-sections-and-shortcuts-together.md) — one combined index space for sections and shortcuts
- [Direct canvas editing is the next development direction](../../decisions/2026-09-direct-canvas-editing-direction.md) — accepted contextual insertion
- [A root project is a workspace with pages; a subproject is a unit of work](../../decisions/2026-09-project-workspaces-and-subproject-work-units.md) — `kind`, `ProjectPage`, schema v3
- [A section removal commits one scoped, expiring Undo record](../../decisions/2026-09-section-removal-undo-records.md) — `undo.ts` removal payload (records became history actions in Slice 35)
- [Undo and Redo follow one history per exact actor, per owning project](../../decisions/2026-09-operation-history-scope.md) — `operation-history.ts`
- [One explicit write is one history action, kept for 24 hours and at most 50 per history](../../decisions/2026-09-operation-history-retention.md) — cursor, revision and state shapes
- [Applied-state checks and an archive generation replace supersession; unrepairable actions retire](../../decisions/2026-09-operation-history-retired-actions.md) — `ProjectSection.archiveGeneration`, `retired`, the conflict vocabulary
- [Schema version 4 converted explicitly and froze the v3 → v4 step](../../decisions/2026-09-schema-version-4-conversion.md) — retained as the intermediate step before v5
- [Task and reflection writes join operation history](../../decisions/2026-09-row-operation-history.md) — typed row payloads and `{ task|reflection, operation }` results
- [Activity identity survives removal of its task or reflection](../../decisions/2026-09-historical-activity-identity.md) — required captured context
- [Schema version 5 converts Activity identity explicitly](../../decisions/2026-09-schema-version-5-conversion.md) — the frozen v4 intermediate and final validating step
- [Undo and Redo advertise their stored operation family's grant](../../decisions/2026-09-operation-family-permissions.md) — the shared static/family declaration
- [Disposable removal and immediate canvas Undo](../../decisions/2026-09-disposable-removal-and-immediate-undo.md) — compatible removal disposition, exact-owner repeat receipt, typed repair steps
- [A recorded Restore is a new action, and a shortcut action owns only its placement](../../decisions/2026-09-section-restore-and-shortcut-history.md) — `section-restore-history.ts`, `shortcut-history.ts`, `shortcut-write-result.ts` and the fourth operation family
- [Undoing a first enable deletes the page it created; undoing a toggle moves one boolean](../../decisions/2026-09-optional-page-operation-history.md) — `page-history.ts`, `page-write-result.ts`, the `page` conflict entity kind and the fifth operation family

## Spec sections

§11 shared contracts · §14 local storage and the document · §25 widget model · §26–§27
pages and ownership · §33 task model · §35 milestones · §36 reflections · §52 agent
connections · §57 activity events · §62 the live frame.

**Archive section entries carry recovery metadata, optionally.** `ProjectArchiveSectionItem.recovery`
is a discriminated union (`owned-content` with a positive `contentCount` and a `separateRestoreCount` no larger than it, `config`, `unknown`),
beside the unchanged exact `cascadeCount`. Optional so older fixtures parse; the domain emits it
on every section entry. Stored sections and `SCHEMA_VERSION` are untouched
([decision](../../decisions/2026-09-content-oriented-archive-policy.md)).

**A removal result can describe a deleted section.** `SectionRemovalResult.section` is the final archived-shaped operation result, not a guarantee that the row remains stored. The removal payload records the disposition so Undo recreates only a section that this operation deleted, and Redo deletes it again.

**A removal also states whether Archive will list it.** `SectionRemovalResult.archiveListed` is the domain's own `sectionRecoveryOf` verdict, required on every result. It is deliberately not `disposition`: a section kept only because a shortcut or an archived row still names it is retained *and* absent from Archive, so a surface offering an Archive route on the disposition sends someone to a page with no entry for their section ([decision](../../decisions/2026-09-recovery-routes-name-what-is-actually-there.md)).

**A conflict only ever describes a change outside the caller's history.** Under a cursor the caller's own later change is reached by undoing it first (`history_not_next`), so Slice 35 removed the `superseded` problem, `supersededBy` and the "use the later receipt" steps; a changed value someone else wrote gets `change-by-hand` or `change-by-hand-or-archive`, and a permanently unsatisfiable action retires ([decision](../../decisions/2026-09-operation-history-retired-actions.md)).
