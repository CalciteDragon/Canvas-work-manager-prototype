# Live updates

§62 on the host side: `GET /prototype/events` is a Server-Sent Events stream that
announces every committed activity record as one small frame — `type`, `entityId`,
`entityType`, `projectId`, `rootProjectId` — scoped to a persona's workspace. The
`LiveEventHub` implements the domain's `LiveEventPublisher` port; frames are held until
the unit of work that produced them commits, so a browser that re-reads on a frame always
reads the new value. There is no sync infrastructure: no CRDTs, no presence, no conflict
resolution (§62).

**Code:** `apps/prototype-host/events` (`hub.ts`, `sse.ts`) · **Tests:** `events/hub.test.ts`,
`events/sse.test.ts`, `live-updates.test.ts` at the host root, and
`scripts/live-acceptance.mjs` · **Parent:** [prototype-host](../overview.md) ·
**Browser side:** [web / core](../../web/core/overview.md)

## Responsibilities

- Accept a `LivePublication` from `ActivityService.record`, hold it with its unit of
  work, and deliver it to subscribers after commit.
- Deliver the same one-frame signal for a forward write and for its Undo or Redo. Row
  transitions retain their `task.*` or `reflection.*` family; section transitions use
  `project.*`, and a compound row Add still tells an open page to re-read section existence.
- Filter by persona: `?user=<personaId>` scopes a subscription to one workspace; without
  it (`curl` debugging) the stream carries everything. The workspace id itself never
  travels to the browser.
- Send the SDK-independent SSE framing, including a `retry` hint so the reconnect cadence
  is the host's decision.
- Announce `prototype.reloaded` when the document, clock or provider is replaced, so
  other tabs reload themselves.

## Not responsible for

- Deciding *when* an event exists — that is the domain's `ActivityService`
  ([decision](../../../decisions/2026-08-live-events-ride-the-activity-record.md)).
- What the browser does with a frame — [web / core](../../web/core/overview.md).
- Stdio: a stdio process has its own store and no hub
  ([decision](../../../decisions/2026-08-live-updates-are-http-only.md)).

## Read next

- [Why it exists and is shaped this way](why.md)
- [What it is made of](what.md)
- [How it works and how to change it](how.md)
