# How live updates work

## Runtime flow

1. `main.ts` constructs one `LiveEventHub` and passes it to `createApi` as the
   `LiveEventPublisher` the `ActivityService` publishes to, and to
   `createEventStreamHandler` as the source the raw route `/prototype/events` reads.
2. A browser opens `GET /prototype/events?user=<personaId>`. The handler answers
   `text/event-stream`, writes the `retry` hint, registers a subscription for that
   persona's workspace, and unregisters it when the socket closes.
3. Inside a unit of work, `ActivityService.record` calls `publish` with a
   `LivePublication`; the hub associates it with the open unit rather than sending.
4. When the store commits, it releases the unit's frames; the hub writes each as one
   SSE `data:` line to every subscriber whose workspace matches (or to everyone, for an
   unscoped subscription). A discarded unit releases nothing.
5. `/prototype/seed`, `/prototype/reset`, `/prototype/clock` and `/prototype/ai-provider`
   publish `prototype.reloaded` after they apply, so tabs other than the one that pressed
   the button reload themselves.

## Key symbols

| Symbol | Kind | Role | Reference |
|---|---|---|---|
| `LiveEventHub` | class | Subscriptions, holding, release, scoping | [API](../../../api/classes/LiveEventHub.html) |
| `createEventStreamHandler` | function | The SSE raw route | [API](../../../api/miscellaneous/variables.html#createEventStreamHandler) |
| `EventStreamOptions` | interface | Hub and the persona resolution the handler uses | [API](../../../api/interfaces/EventStreamOptions.html) |
| `LiveEventPublisher` | interface (domain) | The port the hub implements | [API](../../../api/interfaces/LiveEventPublisher.html) |
| `LivePublication` | interface (domain) | Workspace + frame | [API](../../../api/interfaces/LivePublication.html) |

## Dependencies

**Depends on**

- [domain](../../domain/overview.md) — the port and the publication shape; the
  `ActivityService` that calls it.
- [repositories](../../repositories/overview.md) — commit is what releases frames.
- [contracts](../../contracts/overview.md) — `LiveEventSchema`.

**Depended on by**

- [web / core](../../web/core/overview.md) — `PrototypeLiveUpdates` is the
  `EventSource` client; feature stores subscribe through the `LIVE_UPDATES` token.
- [prototype-runtime](../prototype-runtime/overview.md) — publishes `prototype.reloaded`.

## Invariants and lints

- **At most one frame per operation, never before commit** — `live-updates.test.ts`
  drives a real service through a real store and asserts both.
- **No workspace id on the wire**; scoping happens in the hub.
- **A no-op announces nothing**, because it records nothing.
- **A history transition adds no extra frame.** A retained section removal publishes
  `project.section_archived`, a safely deleted disposable publishes `project.section_removed`,
  explicit add, move and settings writes publish their usual one frame (a no-op publishes none), and
  each section transition publishes one
  `project.section_{removal,addition,move,update}_{undone,redone}` frame. Task and reflection
  transitions publish the equivalent `task.*_{undone,redone}` and
  `reflection.*_{undone,redone}` action. A compound Add still publishes only that one row frame;
  its project context also invalidates section existence in the browser. The direction is in the
  type. A retirement commits but records no activity, so it
  publishes nothing. The history action and its payload never reach a frame. `live-updates.test.ts`
  pins, for section, task and reflection families, that the forward, Undo and Redo frames arrive only once
  the bytes on disk hold the change and the action's new state, and that an action-insert failure,
  forward-persistence failure or transition-persistence failure delivers nothing;
  `section-service.test.ts` pins the retained-removal action at the domain.
- **Frames carry ids, never entities.** The browser re-reads through the gateway; a
  frame is "go and look", not a state delta (§62).

## Commands

```bash
curl -N "localhost:4310/prototype/events"                 # everything, for debugging
curl -N "localhost:4310/prototype/events?user=user-demo"  # one persona's workspace
pnpm --filter @cwm/prototype-host live-acceptance         # timed, with a real MCP client
pnpm --filter @cwm/prototype-host test -- events          # hub and SSE suites
```

## Changing it

- **A new event type** needs nothing here: `type` is the activity action, and the browser
  routes on `type` and `projectId`. Make sure the domain records it through
  `ActivityService.record`.
- **A new field on the frame:** `LiveEventSchema` in contracts, the publication in the
  domain, then the browser's routing. `rootProjectId` is the precedent — added because
  a root-wide page could not otherwise tell which root a deep change concerned.
- **The trap:** publishing from inside the unit of work. The in-process test fails on it;
  in a browser it looks like the feature is broken.
