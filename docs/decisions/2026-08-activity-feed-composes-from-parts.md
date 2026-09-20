# The activity feed composes its line; `summary` stays a log line

**Question**

`docs/decisions/2026-08-activity-summary-ownership.md` predicted, in Slice 5, that Slice 13's
feed would compose §57's card from the event's structured parts rather than render its stored
`summary` — and asked to be revisited here, with a second question attached: *if the feed
never reads `summary`, is it still worth writing?*

This is that revisit.

**Options tested**

- *Render `summary` directly.* Tried first, in the Slice 13 plan's first draft, and caught in
  review as a contradiction with the earlier entry. It is also visibly wrong: a task renamed
  after an event was recorded keeps printing its old name in the feed forever.
- *Compose in the UI from `action` / `entityId` / `projectId`.* Rejected: three callers (the
  section, the dashboard tile, and Slice 14's tools) would each join events against projects
  and connections, fetching collections they otherwise have no use for.
- *Compose in the domain, into a resolved feed entry.* Adopted.

**What we learned**

The earlier entry was right, and for the reason it gave. §57's card shows actor, verb, entity
title, project name and time as **separate elements**, and a single pre-rendered string
cannot produce that layout. Resolving in the domain also put the fix in one place: the
`ActivityFeedEntry` reads the entity's title *now*, so a rename is reflected everywhere the
feed appears.

Building it surfaced two things the plan had not:

- **Not every event has every part.** `agent_connection.updated` and `.revoked` belong to no
  project, and a section has no title of its own — §31's frame heads it from the *registry's*
  display name, which is a UI concern the domain has no business guessing. So `entityTitle`
  and `projectName` are both optional, and the card degrades rather than showing a gap.
- **The verbs cannot be enumerated.** §57 names no action list and `ActivityActionSchema` is
  deliberately an open string, so the feed de-snake-cases whatever it is handed
  (`task.completed` → `Completed`) rather than keeping a closed map in step with every later
  slice.

**Current decision**

- `ActivityFeedEntrySchema` = the event's own shape + `actorName` (required),
  `entityTitle` and `projectName` (both optional). `ActivityService.list` returns these.
- The UI renders the entry's parts. Nothing in `apps/web` reads `summary`.
- **`summary` is kept**, and the earlier entry's open question is answered: it earns its
  place as the human-readable line in `data.json`, which §14 says people open by hand. It is
  explicitly *not* what the UI renders, and a domain test asserts both at once — the frozen
  summary naming a task's old title while the resolved `entityTitle` names its new one.
- The card shows a **date as well as a time**, though §57 draws only `11:32 AM`: Slice 11
  learned this the expensive way when overdue rows printed the due time and five-day-old work
  all read as "23:00" tonight. A feed is mostly history.

**Confidence**

High. The staleness problem is demonstrated by a test rather than argued about, and the
optional fields are forced by the slice's own data.

**Revisit when**

*Answered by Slice 16.* Events now arrive over SSE, and the answer was the re-fetch: a frame
is a notification, not a payload, so `ActivityStore` re-asks `activity.list` and gets fully
resolved entries exactly as before. The frame carries `{ type, entityType, entityId,
projectId }` — the two extra fields are for *routing* (which store cares), never for
rendering, so nothing about this entry's composition rule changed.

Revisit if the feed ever needs to render an event the host cannot resolve on re-read, or if
the re-fetch per frame becomes too chatty for a busy agent — at which point the answer is
coalescing in the store, not a fatter frame.

**Amended, 2026-09-18 — Slice 36.** The first revisit condition is now real: Undo of a task or
reflection creation deletes the event's canonical target. `ActivityFeedEntry` therefore carries
the event's required historical context. The domain still prefers current entity and project names
when available, but falls back to the captured labels when they are gone; the UI composition rule
and the live-frame re-fetch rule stay unchanged
([decision](2026-09-historical-activity-identity.md)).
