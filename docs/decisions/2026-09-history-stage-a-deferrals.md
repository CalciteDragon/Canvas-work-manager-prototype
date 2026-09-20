# Stage A defers historical activity identity and the retry cache, and uses one transition route

**Question**

[Slice 34](../roadmap/planned/34-undo-redo-and-archive.md) assigns two pieces of work to Stage A that
[Slice 35](../roadmap/completed/35-operation-history-foundation.md)'s review argued belong later —
activity events that may name an absent target, and a persisted request-id cache that returns an
uncertain transition's original result. The plan also left two shape questions open: one transition
route with a direction or separate Undo and Redo routes, and whether a stale revision is a 409 or a
412.

**Options tested**

- *Relax activity target integrity now*: no Stage A operation can produce an absent target, because
  section events already target the project
  ([decision](2026-08-section-activity-targets-the-project.md)). The relaxation would permanently
  weaken a hand-edit check for a capability only Stage B's creation Undo uses. Deferred.
- *Persist a retry cache now*: `expectedRevision` already makes a blind retry safe — the replay
  refuses stale and executes nothing — so the cache buys a better message, not correctness, at the
  cost of a contract field, an integrity rule and a reopen test. Deferred to Stage C.
- *Separate `/undo` and `/redo` routes*: reads well, but splits the revision check. Rejected.
- *A 412 for a stale revision*: every other history refusal is already the 409 envelope with typed
  details; a stale revision is the same "read, then try again" answer. Rejected.

**What we learned**

The concurrency test against a real file store proved the safe-retry claim: two transitions at one
revision advance exactly once, and a replay refuses with a summary whose revision has moved and
whose Redo names the caller's own action, so a client can tell its first call landed without a
cache. The web store now reads exactly that: a stale refusal whose summary names the receipt as the
next Redo is treated as a completed Undo.

**Current decision**

- Activity integrity is unchanged in Stage A; the "a history may outlive its project" relaxation
  also waits for the stage that first deletes a project.
- No retry cache. A replayed transition refuses `history_revision_stale` (409) with the current
  summary.
- One route, `POST /api/history/:historyId/transition`, with a strict body
  `{ actionId, direction, expectedRevision }`; `GET /api/projects/:id/history` reads the summary.
  MCP keeps `undo_operation` and adds `redo_operation` (input `{ historyId, actionId,
  expectedRevision }`) and `get_operation_history`.
- Grants stay a static field per tool: nothing in Stage A distinguishes "the family's grant" from
  `projects.write`.

**Confidence**

Medium. Both deferrals are cheap to revisit; the route shape is behaviour-neutral.

**Revisit when**

Stage B's creation Undo needs a captured or tombstoned activity target, or Stage C's header control
cannot tell a landed transition from a lost one from the summary alone.

**Amended, 2026-09-18 — Slice 36.** Stage B reached both deferred questions. Activity now captures
the target identity on every event, rather than weakening missing-target integrity or keeping row
tombstones ([decision](2026-09-historical-activity-identity.md)). The retry cache remains deferred:
receipts and every transition result or refusal still carry the summary needed to chain or diagnose
a lost response. The one transition route and 409 stale-revision answer are unchanged. The static
grant statement no longer holds for the two transition tools: their required grant now follows the
stored operation family ([decision](2026-09-operation-family-permissions.md)).
