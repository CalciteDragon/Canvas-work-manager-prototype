<!-- completed-record id="55" closed="2026-09-29" summary="Section updates name the recorded edit in header Undo and Redo, with browser and domain evidence" -->
# Slice 55 — Section history labels

## Goal

Close [Slice 46 finding 8](../active/46-slice-34-closeout-follow-up.md#build) by making a section update's stored history label name the edit that committed.

## Spec sections

§26 requires header Undo/Redo controls to name their available step; §31 records one section update with an exact field footprint and a stable history label; §32 defines title, configuration, collapse and width edits; §§69, 77–79 require executable verification, real use and a recorded product decision.

## Build

- Derive the label in domain code from `SectionFieldChange[]`, the existing before/after section, and `nameOf`, then record it with the existing `section.update` action. Use a single-field verb for rename, rich-text prose, collapse/expand and resize; use a truthful general label for combined fields or other configuration. The prose verb applies only when `config.text` is the sole changed config key; text plus another key, other-key-only and non-rich-text config use general wording. Resolve a cleared title against the resulting display name. Keep the captured label stable through Undo, Redo and reload.
- Leave normalized no-ops without a receipt. One changed update call still records one action, including when multiple fields changed. Label computation adds no read, grant or refusal.
- Verify the stored receipt and summary plus the header's accessible name through the existing section-edit browser journey. Update the decision and living docs when implementation lands.

## Done when

Renaming, editing rich-text prose, collapsing, expanding and resizing a section each show a distinct, accurate `Undo: …` label in the project header; Undo offers the same text under `Redo: …`, including after reload. Combined changes receive one truthful label and one action. A normalized no-op receives no action or new label. Keyboard and pointer commits use the same server-owned label; the header remains the only Undo/Redo surface.

## Do not

- Do not change operation kinds, payloads, grants, Activity wording, retention, history scope, stored labels of older actions or the schema version.
- Do not add a browser label mapper or a second Undo surface. Leave Slice 46 findings 9–14 for later phases.
- Do not broaden this phase to every section-specific configuration editor or a general localization framework.

## Acceptance check

1. Run focused domain tests for the label helper and `SectionService.update`: inspect receipt, stored action and summary for title rename/clear, rich-text `config.text` alone, text plus another config key, collapse in both directions, resize, combined title+collapse, other config and normalized no-op. Confirm each changed call increases its history revision by exactly one, while the no-op does not.
2. Run `apps/e2e/section-edit-undo.spec.ts` on isolated `nested-projects` data. Commit a prose edit, collapse and keyboard resize on a section; assert the exact header `aria-label`, Undo, Redo and reload text. Check the existing pointer resize flow in both flow and grid layouts. Verify the header alone offers Undo.
3. Run `pnpm test`, `pnpm lint`, `pnpm docs:check` and the focused Playwright file. Use an isolated browser/HTTP project journey on `nested-projects`, record any new friction in `.prototype/notes.json`, and report results and limits in the Outcome.

## File-level change list

| File | Change | Responsibility |
|---|---|---|
| `packages/domain/src/section-edit-undo.ts` | modify | Export one pure section-update label helper over recorded field changes. |
| `packages/domain/src/section-edit-undo.test.ts` | modify | Test each verb, title-clear fallback and combined/unrecognized-field wording first. |
| `packages/domain/src/section-service.ts` | modify | Use the helper when recording the existing action. |
| `packages/domain/src/section-service.test.ts` | modify | Prove receipt, stored label, summary, one-action granularity and no-op behavior. |
| `packages/domain/src/operation-history-service.test.ts` | modify | Replace the old generic rename-label expectation with the new captured wording while preserving the cursor assertion. |
| `apps/e2e/section-edit-undo.spec.ts` | modify | Assert accessible header labels on browser prose, collapse and resize commits, Undo/Redo and reload. |
| `apps/e2e/project-history.spec.ts` | modify | Update real resize/collapse label expectations in the integrated history and concurrent-tab journeys. |
| `docs/decisions/2026-09-section-update-history-labels.md` | create on implementation | Record the wording choice and its evidence in §78 form. |
| `docs/decisions/README.md` | modify on implementation | Index the decision. |
| `docs/architecture/domain/why.md`, `docs/architecture/domain/how.md` | modify on implementation | Explain captured section wording and link the new helper and decision. |
| `docs/architecture/web/projects/how.md` | modify on implementation | Describe the server label shown by existing header controls. |
| `Canvas Work Manager — Prototype Product, Design & Development Specification.md` | modify on implementation | Clarify the §26/§31 section label behavior real use exposed. |
| `docs/roadmap/planned/46-slice-34-closeout-follow-up.md`, `docs/roadmap/goals.md` | modify on closure | Link finding 8 to the completed slice and keep remaining findings accurate. |
| `.prototype/notes.json` | modify only if real use finds friction | Record an observed issue, not a synthetic completion note. |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` | modify when implementation starts | Set `CURRENT_SLICE` to 55 for real-use notes. |

`docs/roadmap/active/55-section-history-labels.md` and generated `docs/roadmap/progress.md` are this phase's plan and board; the latter is updated only by `roadmap.mjs`.

## Test plan — tests first

| Test | Proves |
|---|---|
| `section-edit-undo.test.ts: sectionUpdateLabel names each single-field edit` | Rename uses before/after names; a cleared override uses the resulting fallback; rich-text prose, collapse/expand and width each get an accurate verb; text plus another config key, other config and combined fields use one honest general label. |
| `section-service.test.ts: update stores the label from its actual normalized changes` | A changed call returns one receipt and persists one matching action/summary; Undo/Redo retain that label; a normalized no-op writes none. |
| `section-edit-undo.spec.ts: header words section changes across transitions and reload` | A real write reaches the header accessible name; keyboard and pointer resize share server wording, with no extra Undo control. |
| `operation-history-service.test.ts`, `project-history.spec.ts`: existing renamed/resize/collapse assertions | Keep cursor, summary, integrated UI and concurrent-tab behavior pinned under the new stored labels. |

Write each test first and observe the intended label assertion fail before changing its implementation. Existing action execution and permission tests remain regression coverage; label generation has no new authorization path.

## Boundaries touched

- Domain label selection stays a pure function of contract types and the write's existing state, called inside the current unit of work. It imports no UI, HTTP or JSON adapter and adds no service edge or clock call.
- Contracts remain defined once in `packages/contracts`; no new operation or duplicate shape is introduced. The web component keeps reading the server summary through its gateway and does not derive a label itself.
- Activity text is a separate contract. Label changes affect newly recorded actions only, so persisted actions and older clients remain readable. Browser styles and the central prototype flag are untouched.

## Explicit non-goals

- Slice 46 findings 9–14 and final umbrella closure.
- Editing historic action labels, Activity messages, section names themselves, or MCP conflict text.
- A new configuration taxonomy: only `rich-text` `config.text` alone is called prose; other config changes receive general wording.

## Open questions

None blocking. The wording policy for a cleared title, multi-field edit and non-prose config is made explicit above and will be checked against existing section display names in tests and recorded in the implementation decision.

## Revisions

- **Initial plan (2026-09-29):** Bounded Slice 46 finding 8 to a domain label and existing header projection; listed test-first and browser evidence before implementation.
- **Review round 1 (2026-09-29):** Added the existing domain summary and integrated browser tests that still assert generic labels. Tightened prose wording to require a text-only config change, since `config` is captured as a whole object and the current e2e fixture also changes `tone`.
- **Review round 2 (2026-09-29):** Re-review found no remaining substantive findings across spec, boundaries, tests, acceptance or living documentation.
- **Diff review round 1 (2026-09-29):** Three independent reviewers found no behavior or boundary defect, but found browser evidence gaps: expansion was not committed in the journey, Redo text after reload was checked only for resize, and the test did not count the header's Undo control. Added the expansion path, exact Redo assertions after reload for each named edit, and a single-header-control assertion.
- **Diff review round 2 (2026-09-29):** The same three reviewers checked the revised diff and focused Playwright result; all prior findings were resolved and no substantive new finding remained.

## Outcome

**Deliverables.** `SectionService.update` now captures a label from its normalized `SectionFieldChange[]`: title rename or clear, Rich Text prose, collapse or expand, and target column width have distinct wording. Mixed changes and other configuration changes keep a truthful general label. The existing project header reads it through the server summary on Undo and Redo; older stored labels remain untouched. The domain tests verify receipts, stored actions, summary revisions, no-ops and transitions. The `nested-projects` browser journeys verify exact accessible names, the sole header controls, keyboard and pointer resize in Flow and Grid, Undo, Redo and reload.

**Choices and deviations.** The [section label decision](../../decisions/2026-09-section-update-history-labels.md) keeps the mapping in the domain and calls a config edit prose only when `text` is its sole changed key. Review expanded the browser assertions beyond the initial file list's examples; no operation shape, Activity wording, grant or schema changed. The first sandboxed `pnpm test` and Playwright starts were denied Angular source and SCSS reads; rerunning those gates with filesystem access passed. No new product friction was observed in the isolated browser and HTTP journey, so `.prototype/notes.json` was not given a synthetic note.

**Verification.** `pnpm test` passed across the workspace; `pnpm lint` and `pnpm docs:check` passed; the two focused Playwright files passed 16/16, and the amended section journey passed 6/6 on rerun. The built Compodoc reference was regenerated for the new public helper. No tests were skipped. This slice leaves Slice 46 findings 9–14 and the umbrella closure for their planned phases.

**Documentation updated.** The spec's §26, domain `why.md` and `how.md`, web projects `how.md`, the indexed decision, and the Slice 46 ledger and goals record the current behavior and remaining work.
