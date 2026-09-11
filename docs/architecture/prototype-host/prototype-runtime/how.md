# How the prototype runtime works

## Runtime flow

1. `main.ts` constructs `new SimulatedClock()` and
   `new SwitchableAIProvider(aiProviderFor(process.env.PROTOTYPE_AI_PROVIDER))`, passes
   both to `createApi` and to `new PrototypeRuntime({ persistence, clock, ai, aiProvider })`,
   and mounts `createPrototypeRoutes(runtime, …)` beside the API routes.
2. `GET /prototype/state` reads the runtime and the document: current seed name, the
   clock's simulated `now` (or `null`), the provider mode, the personas, the valid seed
   names, and the agent connections with their fixture tokens.
3. `POST /prototype/seed` builds the named seed from `@cwm/prototype-data` and calls
   `replaceActiveDocument` inside a unit of work; `POST /prototype/reset` does the same
   with the default seed and clears the clock offset.
4. `POST /prototype/clock` calls `SimulatedClock.setNow` (or clears it); time runs on
   from the simulated moment, so timestamps in a session differ.
5. `POST /prototype/ai-provider` swaps the delegate inside the switchable provider; the
   `DashboardService` holding it is none the wiser.
6. Each of 3–5 publishes `prototype.reloaded` through the hub and answers with the new
   state, so the panel never has to ask twice.
7. `POST /prototype/notes` reads `.prototype/notes.json`, appends `{ id, note, route,
   projectId, slice, createdAt: real time }`, and writes it back atomically.

## Key symbols

| Symbol | Kind | Role | Reference |
|---|---|---|---|
| `PrototypeRuntime` | class | Holds and changes the runtime instances | [API](../../../api/classes/PrototypeRuntime.html) |
| `PrototypeRuntimeOptions` | interface | Persistence, clock, provider, initial mode | [API](../../../api/interfaces/PrototypeRuntimeOptions.html) |
| `createPrototypeRoutes` | function | The `/prototype/*` `RouteTable` | [API](../../../api/miscellaneous/variables.html#createPrototypeRoutes) |
| `SwitchableAIProvider` | class | An `AIProvider` whose delegate the panel swaps | [API](../../../api/classes/SwitchableAIProvider.html) |
| `SimulatedClock` | class (domain) | `setNow`; real time plus offset | [API](../../../api/classes/SimulatedClock.html) |
| `AppendNoteOptions`, `NotesFileOperations` | interfaces | Injectable file operations for the notes tests | [API](../../../api/interfaces/AppendNoteOptions.html) |

## Dependencies

**Depends on**

- [prototype-data](../../prototype-data/overview.md) — seed builders and the token
  table for the roster.
- [repositories](../../repositories/overview.md) — `replaceActiveDocument`.
- [domain](../../domain/overview.md) — `SimulatedClock`, `AIProvider`,
  `PrototypeAIProvider`.
- [live-updates](../live-updates/overview.md) — `prototype.reloaded`.
- [contracts](../../contracts/overview.md) — `prototype.ts` shapes.

**Depended on by**

- [web / prototype-tooling](../../web/prototype-tooling/overview.md) — the panel, through
  `PrototypeHttpControl`.
- [testing](../../testing/overview.md) — the e2e specs and acceptance scripts seed the
  host through `/prototype/seed` before each journey.

## Invariants and lints

- **The services hold the same instances the runtime changes** — asserted in
  `main.test.ts` / `routes.test.ts` by moving the clock and reading a derived value.
- **A swap never lands under a queued unit** — pinned in the repositories' tests.
- **Notes carry real time and the current slice** — `CURRENT_SLICE` in
  `dev-panel-store.ts` is bumped when a slice starts; a forgotten bump files notes under
  the wrong slice.
- **No auth, localhost only.**

## Commands

```bash
curl localhost:4310/prototype/state
curl -X POST -H "content-type: application/json" -d '{"seed":"overdue-chaos"}' localhost:4310/prototype/seed
curl -X POST -H "content-type: application/json" -d '{"now":"2026-08-18T09:00:00.000Z"}' localhost:4310/prototype/clock
curl -X POST localhost:4310/prototype/reset
pnpm --filter @cwm/prototype-host test -- prototype
```

## Changing it

- **A new control:** its shape in `packages/contracts/src/prototype.ts`; a method on
  `PrototypeRuntime`; a route that applies it, publishes `prototype.reloaded` if it
  changes derived reads, and answers the new state; then `PrototypeControlPort`,
  `PrototypeHttpControl` and `DevPanelControls` on the browser side.
- **The trap:** putting a client concern here. If the control's effect can be observed
  only in the browser (latency, failure, a flag), it belongs in `PrototypeSettings` or the
  gateway, not in a host route.
