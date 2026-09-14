<!-- plan id="30" status="planned" summary="Persist and execute one scoped inverse per section removal in the existing unit of work" -->
# Slice 30 — Atomic, placement-aware section removal Undo

## Goal

Reverse one section removal atomically, with exact affected content and historical placement where possible.

## Spec sections

[Refactor specification](../../specifications/archive-removal-undo-refactor-spec.md) and
[main specification](../../../Canvas%20Work%20Manager%20%E2%80%94%20Prototype%20Product,%20Design%20&%20Development%20Specification.md):
Refactor §§10–13, 17–21, 25–27; main §§8, 11–15, 18, 27, 31, 45, 53, 57, 62.
See [goals](../goals.md) for sequence and the activation/review protocol.

## Build

- Depends on Slice 29. Add shared Zod schemas for versioned inverse operations, placement snapshots, receipts and typed outcomes; start with section removal only. Store records through a repository interface inside the caller-owned UnitOfWork, with injected Clock. Neither ActivityEvent nor live frames contain inverse snapshots.
- Capture section/config, exactly the rows changed by cascade or reassignment (including moved pre-archived rows), cascade markers and combined section/shortcut placement before mutation. Pair inverse data with sufficient postconditions to detect conflicting later writes.
- Implement a narrow Undo recorder/executor in domain. Keep the graph acyclic: SectionService may use a recorder, but Undo must not call back through public methods that start nested units or compose TaskService/ReflectionService back into SectionService. Prefer pure internal mutation helpers over a generic command bus.
- Gate before implementation: settle storage version/compatible upgrade of existing v3 files (preserve user data), retention/expiry bounds, consumption/retry result, actor-versus-agent connection ownership, current minimum grants, conflict refusal and disabled/missing-page behavior. Undo may not silently overwrite later edits or bypass an archived-ancestor freeze. Document these decisions and dependency edges before code.
- Use the combined order in `page-placements.ts`: previous surviving neighbor, else next, else clamped index. A missing original page uses a deterministic same-project, type-compatible fallback with a partial result; unavailable/forbidden recovery refuses atomically. Preserve unrelated siblings' edit timestamps.
- Wire a receipt and undo execution through host and transport-free MCP services with shared contracts. Do not promise a receipt before commit; no-op/refused operations create neither history nor undo. Keep snapshot storage separate from live-reference integrity checks so retained inverses can name later-deleted sections.
- Update contracts, domain, repositories, prototype-data, host API/live-updates and MCP architecture; upgrade/seed guidance and main spec where adopted. Include recorder failure and persistence rollback seams in the active file list.

## Done when

Tests first prove one receipt per multirow removal; rollback on recorder, validation and persistence failures; one committed activity/live publication; no publication on rollback; exact cascade/reassignment inverse; unchanged independently archived states; previous/next/fallback placement with shortcut neighbors; page fallback/refusal; stale content conflict; foreign user/workspace/connection and revoked/minimal grants; consumed/expired receipt behavior. Verify a v3 fixture upgrades without loss and reload preserves usable records. Run pnpm test, pnpm lint and host/MCP acceptance. Refactor §26 criteria 7–12 have domain evidence before deletion starts.

## Do not

- Hard-delete sections yet, add the browser Undo surface, implement Redo, event sourcing, arbitrary JSON commands, a parallel datastore, unlimited history or undo every mutation.
