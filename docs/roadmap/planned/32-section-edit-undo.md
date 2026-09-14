<!-- plan id="32" status="planned" summary="Extend typed operation Undo to section add, move and settings updates" -->
# Slice 32 — Section creation, movement and settings Undo

## Goal

Extend operation-level Undo to the other section writes named in the proposal.

## Spec sections

[Refactor specification](../../specifications/archive-removal-undo-refactor-spec.md) and
[main specification](../../../Canvas%20Work%20Manager%20%E2%80%94%20Prototype%20Product,%20Design%20&%20Development%20Specification.md):
Refactor §§10–13, 17, 23 phase 4, 25–27; main §§11–12, 20, 27, 31–32, 45, 57, 63.
See [goals](../goals.md) for sequence and the activation/review protocol.

## Build

- Depends on Slice 31. Extend the same versioned union for explicit section add, move/reorder and editable settings (title, config, collapse and span); share the existing receipt/executor and browser surface.
- Gate before implementation: define user-operation boundaries for blur/autosave/drag, duplicate and implicitly created containers. Only explicit section actions in the current UI are included by default. No-op/cancelled gestures create no record.
- An add inverse must refuse if later content/shortcuts make removal destructive; it must not cascade newly authored work. A settings inverse changes only fields touched by the operation and validates their postconditions. A move inverse uses combined neighbors without overwriting unrelated inserts/moves.
- Keep existing minimal grants and retry/expiry/conflict semantics; test interleaved agent and user writes. Record any newly needed decisions; extend public API/MCP/gateway results consistently with working implementations.
- Update contracts/domain, host/API, MCP and web/core/projects docs and main §32 as behavior lands. Reserve versioned inverse extension for future Redo; no redo stack is required.

## Done when

Failing tests first cover each explicit action and no-op, exact field restoration, add followed by new content, intervening edits, combined shortcut order, missing neighbors/page, conflicts and permission revocation. Browser and MCP journeys exercise add/move/settings then Undo with reload verification and one record/event per operation. Run pnpm test, pnpm lint and relevant pnpm e2e journeys. Refactor §23 phase 4's four operation families are implemented without broadening removal's guarantees.

## Do not

- Undo row CRUD, project/page changes, implicit container creation, shortcut-only actions, or every historical activity; build Redo, generic middleware or a global mega-store.
