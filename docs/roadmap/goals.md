# Goals

What the prototype is for, which milestones it has reached, and what is being pursued now.
This is the living, high-level plan; slices are its units of work and live in the folders
beside this file. When the direction changes, this file changes — nothing else records
direction.

## Purpose

The prototype exists to answer one question (spec §1):

> What should this application actually feel like, and how should its concepts behave?

It optimises for **time to change an idea**, never time to production (§3, §84): real
product behaviour over fake infrastructure. Its output is not the code but the answers —
the [decision log](../decisions/README.md) is the raw material for the MVP specification
(§78), and §2 and §83 list the questions it must answer before that specification is
written.

## Milestones

### Done — First Prototype Milestone (§81)

Closed 2026-08-31 by [Slice 17](completed/17-design-lab-storybook-and-e2e.md). Every §81
bullet is demonstrable by a numbered step in the
[milestone walkthrough](../guides/first-milestone-walkthrough.md); both §69 end-to-end
tests pass from a clean checkout. Slices 1–17 are the build.

### Done — Friction-chosen phases

Three phases chosen the way §82 asks — by what using the prototype exposed, not by slice
order — closed between 2026-09-01 and 2026-09-04: container sections own their rows, a
section has a name, and archive keeps its promise. Records `U1`–`U3` on the
[board](progress.md).

### Done — Multi-page projects (Slices 25.0–25.8)

A **user-requested direction**, not a finding from use (§82 says so, deliberately): a root
project is a workspace with Home, Todos, Archive and Reflections pages; a subproject is a
single-canvas unit of work; Home can hold read-only shortcuts to sections elsewhere in its
tree. Closed 2026-09-08 by
[Slice 25.8](completed/25.8-integrated-acceptance-and-documentation-closure.md), whose
integrated browser and MCP journeys are the evidence that the model is *evaluable* and the
ownership seams hold. It is **not yet evidence from sustained use** that the full set
belongs in the MVP. Decision:
[project workspaces and subproject work units](../decisions/2026-09-project-workspaces-and-subproject-work-units.md).

### Candidate — Second Prototype Milestone (§82)

Not a plan. A list of things that become slices **only when observed use justifies them**.
The candidates are in [`planned/`](progress.md#planned), each with the spec sections it
would implement and the scope guards it inherits.

## Now

**Active: [Slice 27 — Direct canvas editing and navigation cleanup](active/27-direct-canvas-editing.md).**
The user approved its feature specification and recommendations on 2026-09-13, including
the existing width snaps and wrapping-grid insertion. The slice started the same day; its
implementation plan is in `active/`. The [decision](../decisions/2026-09-direct-canvas-editing-direction.md)
records the direction without claiming the new behavior is implemented.

**Use the prototype.** The standing instruction since Slice 17, restated after 25.8: load a
realistic seed, do real work in it, drive it through a real MCP client, and write the
friction down in `.prototype/notes.json` (§79). The next slice is chosen from that friction.

Signals worth watching for, because §83 needs them answered:

- Whether nesting and the root/subproject split are used, and at what depth it stops
  helping (§83 *Project model*).
- Which of flow and grid survives contact with heterogeneous sections; whether resizing is
  ever wanted (§83 *Project layout*; the
  [layout decision](../decisions/2026-08-flow-vs-grid-layout-experiment.md) is still open).
- Whether `blocked` and `cancelled` are ever chosen for a task (§83 *Tasks*).
- Which MCP tools agents reach for, which they misuse, and whether combined reads such as
  `get_project_todos` pay for their multi-grant cost (§2 *MCP*, §56).
- Whether any optional page — Todos, Archive, Reflections — earns its tab.

Known friction not yet promoted to a slice, carried in `.prototype/notes.json`:

- The header shows project status as a fact you cannot click, and the More menu is three
  forms; inline editing is the obvious shape
  ([entry](../decisions/2026-08-project-create-edit-archive-surface.md)).
- The shell's columns do not collapse at 375 px (`note-2026-09-06-007`).
- §46's failure-rate injection applies to reads as well as writes (`note-2026-09-06-009`).
- Storybook is limited to a handful of story sets; the Design Lab's *primitive* panels are
  the evidence for a shared component library that has not been extracted.

## How a candidate becomes a slice

1. A friction note, a §83 question or a user direction names the need. Write it down where
   it came from (a note, a decision entry, or this file's **Now**).
2. `node scripts/roadmap.mjs new <id> <slug> --title … --summary …` creates the short
   candidate in `planned/` — or reuse the existing candidate file.
3. When it is chosen, `roadmap.mjs start` moves it to `active/`, and the phase runs under
   [AGENTS.md](../../AGENTS.md) §3: full plan, reviewed to closure, tests first, reviewed
   diff, used in the real app, closed with an **Outcome**.
4. `roadmap.mjs complete` freezes the record. This file's **Now** is updated if the
   direction moved.

Numbering: slices 1–17 and 25.x are historical; new slices take the next free integer
(18–24 are reserved by the candidates that already carry those numbers). Unnumbered,
friction-chosen phases were recorded as `U1`–`U3`; new ones should take an integer instead.

## Standing constraints

These do not change per slice and are not restated in plans:

- The architectural boundaries and the *never build* list in [AGENTS.md](../../AGENTS.md).
- Every slice ends with `pnpm test` and `pnpm lint` green and the app starting.
- After every slice: load a seed and use it; try it through MCP; write the friction down;
  record any answered question as a decision entry; when intent changes, change the test,
  the implementation and the doc together (§77).
