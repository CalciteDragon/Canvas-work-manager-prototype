# What `ActivityEvent.summary` is for, and what it is not

**Question**

`ActivityEventSchema` requires a non-empty `summary`, and §57's example shows a rendered
line — `Completed "Configure deployment"`. Slice 5 had to decide who writes that string,
and whether the activity feed should render *it* or compose its own line from the event's
parts.

**Options tested**

None in use; the feed itself is Slice 13. Considered:

- *`ActivityService` derives the summary from `action` + `entityType` + `entityId`.*
  Rejected: it would have to load the entity to know its title, at write time, inside the
  caller's unit of work — and the calling service already has it in hand.
- *Drop `summary` from the contract and let the feed compose everything.* Rejected: it is
  a required field on a schema Slice 2 settled, and a log line that is readable without a
  join is worth having in a JSON file people open by hand (§14).

**What we learned**

A single pre-rendered string cannot produce §57's layout, which shows actor, verb, entity
title, project name and time as separate elements. And the string freezes at write time:
rename a task and every past event still names the old title. Both are fine for a log
line; neither is fine for the thing the UI renders.

**Current decision**

- **The calling service writes `summary`** — it is the only layer that knows the entity's
  title at mutation time. `Created "X"`, `Updated "X"`, `Completed "X"`, `Archived "X"`.
- **`summary` is a denormalized, frozen log line**: a fallback and a debugging aid.
- **Slice 13's feed composes from `actor` / `action` / `entityId` / `projectId`**, not from
  `summary`. The event carries the structured parts precisely so it can.
- `projectId` is set on every event whose target has a project, because
  `validateDocumentIntegrity` requires it to match the target's project when present, and
  §57's example renders the project name.

**Confidence**

Medium. The split is right; whether `summary` earns its place in the contract at all is
open — if Slice 13's feed never reads it, it is a field that exists only for humans
reading `data.json`, which may still be reason enough (§14) or may be dead weight.

**Revisit when**

Slice 13, when the activity feed is built. If it renders `summary` directly, this entry is
wrong and the staleness-on-rename problem is real and visible. If it composes, ask whether
`summary` is still worth writing.
