<!-- plan id="<id>" status="planned" summary="<one line: what this slice delivers>" -->
# Slice <id> — <Title>

<!-- The first line is the state marker; scripts/roadmap.mjs owns it. While the plan is in
     planned/ keep only the first five sections and keep them short. When it starts (roadmap.mjs
     start), write the rest per AGENTS.md step 1, then revise it through review (step 2) and
     record the rounds under Revisions. Before roadmap.mjs complete, write Outcome. -->

## Goal

<One sentence.>

## Spec sections

§N, §N — <what each requires of this slice>.

## Build

- <The work, as bullets. Sketch while planned; concrete once active.>

## Done when

<The acceptance check, copied from the slice's definition and made executable.>

## Do not

- <Scope guards: what belongs to a later slice or to §80.>

<!-- ───────────── Written when the slice starts ───────────── -->

## Acceptance check

<Concrete, executable steps. Commands, seeds, URLs, what you must see.>

## File-level change list

| File | Change | Responsibility |
|---|---|---|
| `<path>` | create / modify | <one line> |

## Test plan — tests first

| Test | Proves |
|---|---|
| `<file>: <name>` | <what> |

## Boundaries touched

<Which AGENTS.md boundaries this comes near, and how it stays on the right side of each.>

## Explicit non-goals

- <…>

## Open questions

- <Resolve before implementing; escalate if the answer changes the shape of the work.>

## Revisions

- **Round 1 (YYYY-MM-DD):** <what the review found and what changed>.

<!-- ───────────── Written before roadmap.mjs complete ───────────── -->

## Outcome

**Deliverables** — <what now exists and works, with file links>.

**Deliberate choices** — <decisions made and why; options rejected; links to decision entries>.

**Deviations from the plan** — <what changed mid-implementation and what caused it>.

**Deferred** — <what was left out and which slice owns it>.

**Open questions** — <what the next phase or the user must answer>.

**Documentation updated** — <the architecture folders, decisions and guides touched>.
