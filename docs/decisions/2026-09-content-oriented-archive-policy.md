# Content-oriented Archive policy

## Question

Which removed sections should the existing root Archive project, and how can it exclude
disposable views without stranding independently archived rows?

## Options tested

Planning review of the current code and Refactor specification; no implementation or browser
experiment is claimed yet. Compared: all tombstones; only cascade-marked containers; a new
blocker-recovery operation; and content-based entries that retain necessary owner containers.
For uncertain rich-text config, compared treating it as empty with retaining it conservatively.

## What we learned

`ProjectArchiveService` already returns canonical rows, origins, causes and typed blockers.
`SectionService.restoreSection` restores only rows carrying its cascade marker. Independently
archived rows still need their owner section restored first. `settleRows` moves all rows during
reassignment when live rows exist, but returns immediately when only archived rows remain.
The web editor falls back to empty text for malformed config; that display fallback is not
evidence that the stored config has nothing worth keeping.

## Current decision

**Planning choice, 2026-09-13 — pending Slice 29 implementation.** The
[active plan](../roadmap/active/29-recovery-policy-and-archive.md) specifies one contracts
capability source, a pure domain recovery policy, and the existing Archive projection.
Current runtime continues to list section tombstones until that implementation lands.

Task List and Reflections own rows and are included when any canonical rows remain assigned,
including pre-archived-only content. Their section entry is the dependency recovery path:
restore it, then independently restore archived rows. Show total content separately from exact
cascade count; section Restore must not silently restore preexisting archives.

Rich Text with only a string `text` key is meaningful when JavaScript `trim()` leaves text.
Whitespace-only text is empty. Missing/non-string text or extra config keys are uncertain and
retained visibly without coercion or rewriting. The domain inspects recovery-relevant keys;
the section folder keeps its editor schema and whole-config replacement behavior.
Unknown section types are also included conservatively and never treated as known disposable
types. Progress, Timeline, Recent Activity and Sub-Projects views have no recoverable content,
regardless of display config; actual subproject records and their work remain recoverable.

Empty containers after reassignment have no section entry. Archived-only containers remain
visible even if a caller supplies reassign, because the current mutation moves no rows on that
branch. No ownership or mutation semantics change, no hard deletion, no Undo record, and no
new recovery service or automatic dependency restore are part of Slice 29.

The planned metadata extends the existing section item; storage stays at schema version 3.
Existing origins, scope, grants, highest blockers, row-level entries, deterministic append
placement and idempotent Restore remain. Main §§29–32 and §54 will be reconciled when the
projection lands, not described as implemented during this planning session.

## Confidence

High that visible owner containers preserve existing recovery paths without new write rules.
Medium for the conservative text threshold and display density until implementation tests
and a realistic Archive browser/MCP pass provide evidence.

## Revisit when

Slice 29 browser use finds confusing counts or recovery steps, unknown config becomes common,
or a later slice introduces hard deletion or typed rich-text formats. Append implementation
evidence after acceptance; do not infer deletion eligibility from this projection alone.

**Amended, 2026-09-13 — landed in Slice 29.** The planning choice above is now runtime
behavior. `SECTION_CAPABILITIES` in `packages/contracts/src/section.ts` declares the seven
registered types, with `SECTION_OWNERSHIP` derived from it and unknown/prototype-key types left
undeclared. `sectionRecoveryOf` (`packages/domain/src/section-recovery-policy.ts`) is the pure
policy; `ProjectArchiveService` filters only section entries through it and emits
`recovery` metadata on each. `ArchivedRegion` words that metadata, including the two-step
guidance for archived zero-cascade containers and reactivation-only guidance for live containers
beneath an archived project.

Evidence: contract tests for capabilities and metadata; a policy table covering disposable
views, empty/whitespace/Unicode-whitespace prose, literal markup, missing/non-string text, extra
keys, unknown and prototype-key types; projection tests over the `nested-projects` seed for
legacy view tombstones, cascade versus total counts, reassignment with archived subtrees,
archived-only containers under a requested reassign, the section-then-row recovery chain,
highest-ancestor blockers, exact read grants refused before any repository call, and root scope;
host route and MCP contract cases showing the metadata passes through unchanged; web component,
store and page specs. One refinement found while implementing: when an archived container's
cascade is non-zero but smaller than its content, the copy says how many other rows stay
archived and need their own Restore, rather than showing two-step copy only at zero.

Not yet evidence: the extended `archive.spec.ts` browser/MCP journey and the real-application
pass could not be run in this session because a developer `pnpm dev:host` held the e2e port. The
confidence levels above therefore stand until that journey and real use are recorded here.

**Amended, 2026-09-14 — two refinements after review, at the user's request.**

1. *Count Restores, not rows.* "N other tasks stay archived" counted subtasks that come back with
   their parent, overstating the work. `owned-content` now carries `separateRestoreCount`: archived
   rows whose marker does not name this section and whose `archivedWithTaskId` parent is not
   archived in the same container. The copy uses it; `contentCount` and `cascadeCount` are
   unchanged. Chosen over UI-side counting so eligibility-like arithmetic stays in the domain, and
   over dropping the number, because the count is what tells someone how much is left to do.
2. *An empty Rich Text config is empty.* `create_section` without `config` stores `{}` (the web's
   default is `{ text: '' }`), so agent-created Notes removed untouched were listed as unknown
   content. A config with **no keys** holds nothing to lose and is now excluded, like blank prose.
   Non-string `text` and extra keys remain unknown. This narrows the earlier "missing text is
   uncertain" rule only for the zero-key object; it was preferred over giving the domain a
   default config per type, which would put section-folder knowledge in domain.
