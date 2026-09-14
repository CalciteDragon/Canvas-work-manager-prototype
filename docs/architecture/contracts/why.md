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

**`ActivityAction` is an open `entity.verb` string**, not an enum: §57 names no action
list and every slice adds verbs. `LiveEvent.type` reuses it so a frame is the
announcement of the activity record that was just written, not a parallel type.

**Versioning without a migration runner.** `SCHEMA_VERSION` went 1 → 2 (rows name their
section) with a reset, and 2 → 3 (kinds and pages) with one bounded converter because a
real file was by then worth keeping. A chain of converters was rejected as a framework
for a chain of one (§14, §71).

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

## Spec sections

§11 shared contracts · §14 local storage and the document · §25 widget model · §26–§27
pages and ownership · §33 task model · §35 milestones · §36 reflections · §52 agent
connections · §57 activity events · §62 the live frame.

**Archive section entries carry recovery metadata, optionally.** `ProjectArchiveSectionItem.recovery`
is a discriminated union (`owned-content` with a positive `contentCount` and a `separateRestoreCount` no larger than it, `config`, `unknown`),
beside the unchanged exact `cascadeCount`. Optional so older fixtures parse; the domain emits it
on every section entry. Stored sections and `SCHEMA_VERSION` are untouched
([decision](../../decisions/2026-09-content-oriented-archive-policy.md)).
