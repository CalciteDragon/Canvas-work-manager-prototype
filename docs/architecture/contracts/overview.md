# Contracts

Slice 44 adds `ArchivedProjectsResultSchema` for the workspace recovery list and makes
`ProjectArchiveResultSchema` accept only currently restorable archived entries. Both reads
reuse canonical project and Archive breadcrumb shapes; neither adds persisted state.

`@cwm/contracts` is the one place every entity in the prototype is defined (§11): Zod
schemas with inferred types for users, workspaces, projects, pages, sections, shortcuts,
tasks, milestones, reflections, activity, agent connections, dashboard widgets, the
derived read models, the write inputs, the live-event frame, the prototype controls, Undo
records with their receipts and refusals, and the `data.json` document itself. Angular forms, the host's routes, the MCP tool input
schemas, the seeds and every test import from here; there is no second definition of any
of these shapes anywhere in the repository.

Operation history holds strict version-1 section, task, reflection, Home shortcut, optional-page
and project payloads under one per-actor, per-project cursor. Creation captures the project and its
canonical page as `project.add`; its directional results report removal or same-id recreation.
The public section-removal input is a strict empty object: transports need only the section id,
and new removal actions cascade live owned rows. The stored version-1 payload still includes its
applied policy so historical reassign actions remain executable without changing schema version 5.
Section, row, placement, page and project writes return `{ section|task|reflection|shortcut|page|project, operation }` (with
`operation: null` for a normalized no-op), and a shortcut removal names ids instead; the receipt names the history,
action and revision while captured fields, structural effects and optional implicit containers
stay server-side. Public history shapes live apart from stored actions so browser consumers do not
pull in inverse payloads. Activity carries durable captured identity; project absence is anchored
separately by its creation lifecycle and retained undone history action. `SCHEMA_VERSION` stays 5.

**Code:** `packages/contracts/src` · **Tests:** `packages/contracts/src/*.test.ts`
(vitest) · **Package:** `@cwm/contracts` · **Depends on:** `zod` only

## Responsibilities

- Define each entity once, as a schema that parses at every boundary — HTTP body, MCP
  input, seed file, data file — so a malformed value fails where it enters.
- Define the write inputs separately from the entities: inputs carry only what a caller
  may set; ids and timestamps come from the domain (§45). In updates `null` clears and
  `undefined` leaves alone.
- Own `SCHEMA_VERSION` (currently `5`) and `PrototypeDocumentSchema`, so a stale
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
