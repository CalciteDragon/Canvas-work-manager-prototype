# Contracts

`@cwm/contracts` is the one place every entity in the prototype is defined (§11): Zod
schemas with inferred types for users, workspaces, projects, pages, sections, shortcuts,
tasks, milestones, reflections, activity, agent connections, dashboard widgets, the
derived read models, the write inputs, the live-event frame, the prototype controls, Undo
records with their receipts and refusals, and the `data.json` document itself. Angular forms, the host's routes, the MCP tool input
schemas, the seeds and every test import from here; there is no second definition of any
of these shapes anywhere in the repository.

Slice 35 puts every section operation into a per-actor, per-project **operation history**
(`operation-history.ts`): strict version-1 `section.add`, `section.move`, `section.update` and
`section.remove` payloads held by `OperationAction`s under an `OperationHistory` cursor. Explicit
section writes return `{ section, operation }` (or `operation: null` for a normalized no-op); the
receipt names the history, the action and the history's `revision`, while the captured footprint
stays server-side. A transition returns the discriminated `UndoResult` or `RedoResult` plus the
refreshed, snapshot-free summary. `SCHEMA_VERSION` is 4.

**Code:** `packages/contracts/src` · **Tests:** `packages/contracts/src/*.test.ts`
(vitest) · **Package:** `@cwm/contracts` · **Depends on:** `zod` only

## Responsibilities

- Define each entity once, as a schema that parses at every boundary — HTTP body, MCP
  input, seed file, data file — so a malformed value fails where it enters.
- Define the write inputs separately from the entities: inputs carry only what a caller
  may set; ids and timestamps come from the domain (§45). In updates `null` clears and
  `undefined` leaves alone.
- Own `SCHEMA_VERSION` (currently `3`) and `PrototypeDocumentSchema`, so a stale
  `.prototype/data.json` fails at load rather than mid-session.
- Own the small pure functions that several layers need to agree on: `nameOf` for a
  section's display name, `SECTION_CAPABILITIES` (and the derived `SECTION_OWNERSHIP` /
  `ownedKindOf`) for which section types own rows and what removing one could leave to recover, `isRootProject`, `NAVIGABLE_PAGE_KINDS`.

## Not responsible for

- Rules that need state or a clock — status transitions, archive guards, scoping — which
  live in [domain](../domain/overview.md).
- Seed *names*, which are deliberately `string` here so the contracts never depend on the
  seed builders ([prototype-data](../prototype-data/overview.md)).
- Repository query shapes' *semantics* — the shapes are here, how filters combine is a
  [repositories](../repositories/overview.md) decision.

## Read next

- [Why it exists and is shaped this way](why.md)
- [What it is made of](what.md)
- [How it works and how to change it](how.md)
