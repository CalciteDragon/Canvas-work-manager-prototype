<!-- completed-record id="40" closed="2026-09-22" summary="ProjectService.update refuses, 409, a reparent that would carry an old-root Home shortcut's source across roots, sharing the check with the history executor." -->
# Slice 40 — Forward reparent refuses a cross-root Home shortcut

## Goal

`ProjectService.update` refuses, with a typed `DomainRuleError` before any write, a reparent that
would carry a Home shortcut's source section out of its root — the same rule the history executor
already applies to a reparent reversal, shared rather than restated.

## Spec sections

§26 — a sub-project may be reparented; §27 — a Home shortcut places a section from its own root's
tree only; §61 — a caller-caused refusal is a typed rule error (409), never a 500.

## Build

- Export the cross-root placement check from `project-history.ts` as one function both callers use.
- `ProjectService` reads sections and placements through repository interfaces and refuses with it.

## Done when

On seed `nested-projects`, with a second root created, `PATCH /api/projects/project-kitchen
{"parentProjectId": "<new root>"}` answers **409 `rule_violation`** naming
`shortcut-renovation-kitchen-tasks`, and the document is unchanged. It answered 500 before.

## Do not

- Add a service edge (no `SectionShortcutService` in `ProjectService`).
- Auto-remove or move placements on reparent — the caller removes them first.
- Change commit-time integrity in `data-store.ts`; it stays the backstop.

## Acceptance check

1. `pnpm --filter @cwm/domain test` — the new forward-reparent test passes (red before the change).
2. `pnpm --filter @cwm/prototype-host test` — the route test asserts 409, `rule_violation`, the
   shortcut id in the message, and an unchanged project and shortcut list.
3. `pnpm test` and `pnpm lint` green (lint includes `docs:check`).

## File-level change list

| File | Change | Responsibility |
|---|---|---|
| `packages/domain/src/project-history.ts` | modify | Export `shortcutsCarriedAcrossRoots` (returns the offending placements) over the existing `ProjectHistoryRepositories` type; the history preflight maps its result to `shortcut-reference` conflicts. |
| `packages/domain/src/project-service.ts` | modify | Add `sections` and `shortcuts` repository dependencies; after the parent checks, refuse a reparent whose move carries a placement, naming each. |
| `packages/domain/src/project-service.test.ts` | modify | Forward refusal test and the does-not-carry pass case. |
| `packages/domain/test/test-support.ts` | modify | Wire the two repositories into `ProjectService`. |
| `packages/mcp-tools/test/harness.ts` | modify | Same wiring. |
| `apps/prototype-host/api/services.ts` | modify | Same wiring. |
| `apps/prototype-host/api/routes.test.ts` | modify | Wiring, plus the 409-and-unchanged route test on `nested-projects`. |
| `docs/architecture/domain/how.md` | modify | The forward rule, the shared function and its ordering; correct the stale "only the project repository" line. |
| `docs/architecture/domain/what.md` | modify | `ProjectService` row gains the rule; the diagram's missing `project --> recorder` edge (stale since Slice 39). |
| `Canvas Work Manager — Prototype Product, Design & Development Specification.md` | modify | §27's same-root-tree rule says a reparent is refused while it would break it. |
| `docs/architecture/domain/why.md` | modify | Link the decision. |
| `docs/decisions/2026-09-forward-reparent-refuses-cross-root-shortcut.md` | create | The decision (§78 format). |
| `docs/decisions/README.md` | modify | Index it under Domain. |

## Test plan — tests first

| Test | Proves |
|---|---|
| `project-service.test.ts: names the placement of a descendant’s section, writes nothing, then moves once it is removed` | `DomainRuleError` naming the shortcut and "remove", no project write, no activity, no history action; succeeds once the placement is removed. |
| `project-service.test.ts: names every carried placement, refuses a combined edit whole, and leaves the cycle refusal first` | Several placements all named; a name + parent PATCH writes nothing; a destination inside the subject still reads as a cycle (the check runs after `assertParentIsUsable`). |
| `project-service.test.ts: allows a move within the root, and a cross-root move whose placements source work that stays` | An old-root placement of a section that stays behind does not refuse. |
| `routes.test.ts: answers 409 and changes nothing when a reparent would carry a Home shortcut across roots` | The seeded repro answers 409 `rule_violation`, not 500, names both placements, and the project and the Home's placements are unchanged (Activity/history non-writes are pinned in the domain test). |
| existing `project-history.test.ts` shortcut cases | The history executor still refuses/permits exactly as before through the shared function. |

## Boundaries touched

- *Domain services depend on repository abstractions only*: `ProjectService` gains two repository
  interfaces (`SectionRepository`, `SectionShortcutRepository`), no service edge — the graph is
  unchanged. `ProjectService` already imports the function module `project-history.ts`.
- *Contracts defined once*: no new types in contracts; the refusal is a message on `DomainRuleError`.

## Explicit non-goals

- Structured `details` on the forward refusal (the history path has `UndoConflict`; the forward path
  has no consumer for a typed payload yet).
- Any UI affordance for removing the placement from the move dialog.
- An MCP test: `update_project` calls the same service and carries rule-error text like every tool.
- The destination-root branch of the check (a placement already on the new root) is unreachable on
  an integrity-valid document and stays defensive; a broken or cyclic chain is refused earlier by
  `assertParentIsUsable`.

## Open questions

- None blocking. Assumed: the refusal names every offending placement, not only the first.

## Revisions

- **Round 1 (2026-09-22):** Reviewer found the seed has two Kitchen placements (acceptance and route
  test now assert both), asked for multi-placement, combined-edit and cycle-precedence cases (added),
  the §27 spec amendment and `domain/what.md` (added), and flagged a stale `how.md` line (fixed).
  Check order (after the parent checks, before `commit`) confirmed; construction sites complete; no
  boundary findings. MCP coverage and the unreachable destination-root branch recorded as non-goals.
- **Round 2 (2026-09-22, diff review):** No substantive findings. The plan named a
  `CrossRootShortcutRepositories` type the code does not have and two stale test names; corrected.
  The domain `what.md` diagram lacked `ProjectService`'s recorder edge from Slice 39; fixed here as a
  one-token doc correction in a touched file.

## Outcome

**Deliverables** — [`ProjectService.update`](../../../packages/domain/src/project-service.ts) now
refuses a reparent to another root while an old-root Home shortcut places a section from the moved
subtree, with a `DomainRuleError` naming every such placement and telling the caller to remove it
first; nothing is written. The check is one exported function,
[`shortcutsCarriedAcrossRoots`](../../../packages/domain/src/project-history.ts), which the history
executor's `shortcut-reference` preflight now maps instead of owning. The seeded repro
(`nested-projects`, `PATCH /api/projects/project-kitchen` to a new root) answers 409
`rule_violation` naming `shortcut-renovation-kitchen-tasks` and `shortcut-renovation-kitchen-reflections`,
where it answered 500.

**Deliberate choices** — Refuse rather than cascade-remove the placements, and keep commit-time
integrity as the backstop instead of mapping `DocumentIntegrityError` to 409
([decision](../../decisions/2026-09-forward-reparent-refuses-cross-root-shortcut.md)).
`ProjectService` reads `SectionRepository` and `SectionShortcutRepository` — no service edge. The
check runs after the parent checks (a cycle still reads as a cycle) and before `commit`.

**Deviations from the plan** — The function takes the existing `ProjectHistoryRepositories`, which
`ProjectServiceDependencies` satisfies structurally; a separate alias added nothing.

**Deferred** — Any move UI offering the placement removal inline; an MCP-level assertion (the tool
carries the service's rule-error text like every other).

**Open questions** — None.

**Documentation updated** — Spec §27's same-root-tree rule; `docs/architecture/domain/how.md`,
`what.md`, `why.md`; the new decision, indexed in `docs/decisions/README.md`.
