# Prototype runtime

The host side of §46's development panel and §76's reset: the `/prototype/*` routes that
change the *rig* — which seed is loaded, what time it is, which AI provider answers —
without restarting anything, plus §79's friction notes. `PrototypeRuntime` holds the
same clock and provider instances the domain services were wired with, which is what
makes a change take effect immediately while the services never learn that any of this
exists. Deliberately disposable (§71): no auth, no layering; every mutating route answers
with the new state.

**Code:** `apps/prototype-host/prototype` (`runtime.ts`, `routes.ts`, `notes.ts`,
`switchable-ai-provider.ts`) · **Tests:** `prototype/routes.test.ts` · **Parent:**
[prototype-host](../overview.md) · **Browser side:**
[web / prototype-tooling](../../web/prototype-tooling/overview.md)

## Responsibilities

- `GET /prototype/state`: the loaded seed, the simulated clock, the AI provider, the
  personas, the valid seed names, and the agent-connection roster with its fixture
  tokens (a read-only roster — the permission grid lives in Settings).
- `POST /prototype/seed` (swap the document, through the unit-of-work lock),
  `/prototype/reset` (default seed *and* real time), `/prototype/clock` (a simulated
  `now`, or `null` for real time), `/prototype/ai-provider` (`mock` | `real`).
- `POST /prototype/notes`: append a §79 note — text, route, project, real timestamp,
  current slice — to `.prototype/notes.json`.
- Publish `prototype.reloaded` after any host-state change so other tabs reload.

## Not responsible for

- Network delay, failure rate and feature flags: those are client-side, in the gateway
  and `PrototypeSettings`, so the panel keeps working at 100 % injected failure
  ([decision](../../../decisions/2026-08-latency-and-failure-live-in-the-client.md)).
- Layout mode: a real project field written through the ordinary API, not a rig
  control.
- Writing seeds to disk from the CLI — [prototype-data](../../prototype-data/overview.md).

## Read next

- [Why it exists and is shaped this way](why.md)
- [What it is made of](what.md)
- [How it works and how to change it](how.md)
