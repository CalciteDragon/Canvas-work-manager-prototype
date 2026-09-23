# Why core exists

## The problem it solves

§8 draws one line: the application must never depend on the prototype host, a JSON file,
or anything Supabase-shaped, so that the UI is the part of the prototype the MVP keeps
(§70, §72). `core/` is that line made concrete — the interfaces on the application's side,
the adapters on the prototype's side, and the shell that every route shares.

## Forces

- **A production adapter must be a drop-in.** Everything transport-shaped must sit in
  files that can be replaced wholesale.
- **Failures must reach the UI as one type.** A component that learns about a `Response`
  is a component that knows about HTTP.
- **Live frames and optimistic writes race.** A frame announcing your own write can
  arrive before your response does, because the host flushes at commit.
- **The panel must keep working at 100 % injected failure**, or it cannot turn the
  failures back off.
- **Theme and persona interact.** Switching persona must repaint from the persona's own
  preference, so the theme override must not persist.

## The shape, and the alternatives rejected

**Interfaces behind tokens; `app.config.ts` names the implementations.** Rejected:
Angular's `providedIn: 'root'` on the concrete classes — it would let a component inject
`PrototypeWorkManagerGateway` directly and nothing would stop it.

**The gateway grows with its implementations.** Slice 6 declared only `projects` and
`tasks` rather than stubbing §9's other members: six members nothing implements would
force every adapter to fake them ([decision](../../../decisions/2026-08-gateway-surface-grows-with-implementations.md)).

**`GatewayError` is the one failure**, built from the host's `{ error, message,
details }` envelope, with `details` preserved untrusted so a page can open the right
dialog. Slice 6 found the identity provider leaking a raw `TypeError` with the host
stopped; the unit tests could not see it.

**`LIVE_UPDATES` has an inert default and a test that it is not used.** Forgetting the
provider would leave a silently dead app rather than a broken one; `app.spec.ts` asserts
the token is provided.

**Live re-reads are quiet.** No loading flag, no cleared data, no error on failure —
an agent's write must not flicker a skeleton over a page someone is reading. Stores
defer re-reads behind an optimistic write in flight, since the host's frame lands before
the tab's own response ([decision](../../../decisions/2026-08-live-recovery-invalidates-derived-views.md)).

**Latency and failure injection sit in the adapter.** That is where §63's revert is
observable; the measurement that mattered — a row painted complete while the request had
not started for three seconds — came from here
([decision](../../../decisions/2026-08-latency-and-failure-live-in-the-client.md)).
`PROTOTYPE_CONTROL` is a separate port so the panel survives the failure rate it sets.

**Theme is session-only.** `ThemeService` owns `data-theme` and nothing persists it, so
switching persona repaints from `preferences.theme`; the panel deliberately keeps the
theme out of the `sessionStorage` it uses for its other settings
([decision](../../../decisions/2026-08-theme-selection-is-session-only.md)).

**The project tree in `ShellStore` is derived view state, not an entity.** §23's
"expand inline" is a rendering concern; it has no counterpart in contracts and must not
get one.

## Consequences

- Swapping in a real API is one adapter file per port and one edit in `app.config.ts`.
- Every component test uses `core/gateway/testing`'s fake and `core/live/testing`'s
  fake; none needs the host.
- A store author has three rules to remember: read through the interface, guard
  optimistic writes, re-read quietly on frames. Forgetting the second produced the
  defects that closed Slices 16 and 17.
- The `localStorage` read in the identity provider is guarded, because it throws in
  private browsing.

## Decisions that shape this system

- [The gateway interface grows with its implementations](../../../decisions/2026-08-gateway-surface-grows-with-implementations.md)
- [What an `Identity` is, and where it comes from](../../../decisions/2026-08-identity-contract-and-me-route.md)
- [Latency and failure injection live in the client, not the host](../../../decisions/2026-08-latency-and-failure-live-in-the-client.md)
- [How live reconnects recover derived project views](../../../decisions/2026-08-live-recovery-invalidates-derived-views.md)
- [A theme change lasts the session, not the persona](../../../decisions/2026-08-theme-selection-is-session-only.md)
- [Where the project navigation column lives](../../../decisions/2026-09-where-the-project-navigation-column-lives.md) — why it is *not* here
- [CORS on the host, not a dev-server proxy](../../../decisions/2026-08-host-cors-over-dev-proxy.md) — why the adapter talks to `:4310` directly
- [Disposable removal and immediate canvas Undo](../../../decisions/2026-09-disposable-removal-and-immediate-undo.md) — the receipt-driven Undo seam beside section removal
- [Explicit section edits reverse only their operation's changes](../../../decisions/2026-09-section-edit-undo-boundaries.md) — typed add/move/update envelopes
- [Undo and Redo follow one history per exact actor, per owning project](../../../decisions/2026-09-operation-history-scope.md) — `OperationHistoryGateway` and revision-ordered receipts
- [The project header offers Undo and Redo of the displayed project's history](../../../decisions/2026-09-project-header-history-controls.md) — why the reporter port is core's and its default is inert

## Spec sections

§8 core boundary · §9 gateway · §10 adapter · §18 identity · §19–§20 stores · §21–§23
tokens, themes, shell · §47 flags · §62–§63 live updates and optimistic UI.
