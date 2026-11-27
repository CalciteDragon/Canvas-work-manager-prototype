# Slice 82 Gate 3

Gate 3 is awaiting the user's decisions. The C82 contact sheet is
`ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/contact-sheet.html` under `apps/e2e`.
Its heading still says “Gate 0” because the capture reporter uses that heading. The files and index are
from C82. See [core tasks](core-tasks.json), [updated themes](themes.json), [stop-rule tally](tally.json),
[Gate 1 ledger](ledger.json) and [reproduction verdicts](reproduction.json).

## Findings digest

Eleven independent auditor files produced 145 admitted records. Of these, 143 reproduced and two
reproduced partly. W1-013 confirmed the dashboard gutter only. W2-014 confirmed the drawer dismissal,
while toggling a page did show an Undo toast. The five S1 records describe one blocker, the absence of
Connect agent. It affects T10 and was open at Gate 1. There is no new S1 core-task blocker in 82.1.
The 37 unresolved Gate 1 S1/S2 IDs belong in the routing decision too. Counts are of records and preserve
both the Gate 1 and C82 IDs when a defect persists. The routing rows group repeated observations for one fix.

| Admitted | New | Still open | Regression | Introduced | Total |
|---|---:|---:|---:|---:|---:|
| S1 | 0 | 5 | 0 | 0 | 5 |
| S2 | 42 | 28 | 4 | 6 | 80 |
| S3 | 36 | 12 | 6 | 6 | 60 |

The fresh comb has 60 S3 of 145 (41.4%), so §8’s “mostly S3” criterion fails. The separate comb list
adds five S2 and sixteen S3 records. T11 and T12 extend the earlier T01–T10 walk coverage. W4’s run
was resumed after an interruption, as disclosed in the [Slice 82 plan](../../completed/82-overhaul-comb.md).

## Re-prioritised themes

Priority follows the highest current severity. TH12 leads because it includes the agent-connection
blocker. TH13 has the largest S2 count, followed by TH14. Their routes keep narrow-layout and vocabulary
work together. TH09 and TH15 cover the high-impact task-arrival and due-date flows proposed for 82.1.
The existing fifteen themes cover the new evidence. TH03 and TH04 have no open IDs.

| Theme | Priority | C82 S1 | C82 S2 | C82 S3 | Open Gate 1 S2 |
|---|---|---:|---:|---:|---:|
| TH01 Surfaces, spacing and alignment have no system | S2 | 0 | 1 | 1 | 1 |
| TH02 Colour alone carries state, and states collide | S2 | 0 | 2 | 2 | 8 |
| TH03 The token set stops short | none | 0 | 0 | 0 | 0 |
| TH04 No shared control primitives | none | 0 | 0 | 0 | 0 |
| TH05 No action hierarchy | S2 | 0 | 1 | 4 | 0 |
| TH06 Overlays and focus do not follow the user | S2 | 0 | 3 | 5 | 0 |
| TH07 Feedback is detached from the action | S2 | 0 | 4 | 0 | 1 |
| TH08 Section chrome is hidden yet heavy | S2 | 0 | 5 | 3 | 0 |
| TH09 The same object takes many shapes | S2 | 0 | 6 | 5 | 0 |
| TH10 Empty, loading, error and archived states are accidental | S2 | 0 | 2 | 5 | 0 |
| TH11 Two navigation trees and no single "you are here" | S2 | 0 | 9 | 6 | 1 |
| TH12 Prototype scaffolding inside the product | S1 | 5 | 8 | 8 | 6 |
| TH13 Narrow and touch layouts are squeezed desktop | S2 | 0 | 19 | 1 | 6 |
| TH14 System vocabulary leaks into the interface | S2 | 0 | 16 | 14 | 8 |
| TH15 Task-flow defaults work against the user | S2 | 0 | 4 | 6 | 1 |

## Proposed routing

Routes are proposals for Gate 3, with the comb-list assignment already decided by Q2 (c). Numbers
8 and 9 refer to redesign slices under the umbrella. The five C82 S1 records and their five Gate 1
predecessors all go to redesign slice 8. 82.1 comes first in the sequence under Q3 (b).

| Destination | Issue | C82 records |
|---|---|---|
| 8 | Existing agent-connection and revoke flow | C82-L7-006, C82-W1-001, C82-W2-012, C82-W3-008, C82-W4-010, C82-L6-008 |
| 9 | Drawer ids, enum labels and estimate units | C82-L2-004, C82-L6-001, C82-L6-003, C82-W1-006, C82-W2-007, C82-W3-004, C82-W4-003 |
| 9 | Timeline statuses, reflection dates, archive provenance, progress vocabulary and activity naming | C82-L6-004, C82-L6-005, C82-L6-010, C82-L6-012, C82-L6-015, C82-L6-017, C82-L6-019, C82-W1-005, C82-W2-009 |
| 81.1 | Existing Archive item title and dashboard task layout debt | C82-L1-001, C82-L1-002, C82-L2-007, C82-L3-008, C82-L6-009, C82-L7-010 |
| 81.1 | Extend the queued dashboard layout work to Recent Progress and Recent Agent Activity | C82-L1-009, C82-L2-006, C82-L2-008, C82-L3-009, C82-L3-010, C82-L4-005, C82-L4-006, C82-L5-009, C82-L5-010, C82-L6-018, C82-L6-020, C82-L7-009 |
| 81.1 | Archived Markdown recovery row at phone width | C82-W2-001 |
| Open by decision | Design Lab phone overflow and prototype scaffolding, including placeholder and seed guidance | C82-L1-003, C82-L2-010, C82-L3-006, C82-L4-007, C82-L5-011, C82-L7-005, C82-L7-008, C82-W4-011 |
| 82.1 | Date changes save partial years and fragment Undo | C82-W1-002, C82-W4-014 |
| 82.1 | Task links reach the owner, then leave the user to find the selected task again | C82-L7-002, C82-W1-003, C82-W2-006, C82-W3-010, C82-W4-005 |
| 82.1 | Section add and remove controls on touch, and adjacent Remove slides under the pointer | C82-L3-002, C82-L3-003, C82-W1-004, C82-W2-002, C82-W2-004 |
| 82.1 | Archive and shortcut links lead to a missing or imprecise destination | C82-L4-001, C82-L7-001, C82-L7-004 |
| 82.1 | Keyboard and drawer focus, skip label, radio-like state and save announcement | C82-L1-004, C82-L3-001, C82-L5-001, C82-L5-012, C82-L7-007, C82-W3-002, C82-W3-005 |
| 82.1 | Retry wording, failure recovery and draft validity | C82-L2-005, C82-L3-005, C82-L4-002, C82-L4-003, C82-L4-004 |
| 82.1 | Creation form flow, action order and cancelled task treatment | C82-L1-005, C82-L2-001, C82-L2-009, C82-L6-014, C82-W4-001 |
| 82.1 | Root canvas still called Home in page settings and shortcut sources | C82-L2-002, C82-L6-006, C82-L6-007, C82-L7-003 |
| 82.1 | Re-verified comb-list items | C82-CL-02 through C82-CL-22, including all five S2s |

| Destination | Unresolved Gate 1 S1/S2 IDs |
|---|---|
| 8 | L3-023, L7-015, W1-052, W1-053, W2-031, W3-020, W4-023 |
| 9 | L2-003, L2-004, L6-004, L6-005, L6-007, L6-011, L7-016, W1-025 |
| 81.1 | L1-004, L1-018, L5-018, W2-015, W2-022, W2-028 |
| Open by decision | L1-024, L6-001, L6-023, L7-011, L7-013, W4-022 |
| 82.1 | L1-011, L1-019, L3-004, L3-011, L3-022, L5-016, L5-017, L7-009, W1-020, W4-016 |

## §8 stop-rule results

| Criterion | C82 result |
|---|---|
| No S1 | **Fails.** Ten open records describe one missing agent-connection control. |
| S2 below the agreed number | **No number set.** 117 open records (32 Gate 1, 80 fresh, five comb-list). TH12 contributes 14 and counts in full. |
| Every task at or below baseline, zero dead ends | **Fails as written.** T08 takes four clicks against three (Slice 81 accepted the extra click). T10 still dead-ends at Connect agent. No regression against Slice 81. T11/T12 have no Gate 0 baseline. |
| Zero serious or critical axe in both themes | **Passes on what axe could decide.** Light 97 cells, zero serious and zero critical. Dark 97 cells, zero serious and zero critical. No cell with either impact. |
| Fresh comb mostly S3 | **Fails.** 60 of 145 admitted records are S3. |

Under Q8 (a), colour contrast evidence is reported outside the stop rule. Axe returned
`color-contrast` incomplete on 97/97 light and 97/97 dark captures (194/194). L5 measured
54 pairs per theme and found no failures. The minimum was 6.276:1 light and 5.992:1 dark,
both on Revoke Claude (required 4.5:1). These samples measure the tested pairs. The separate
W2-003 observation about faded section tools remains an S3 finding. The matrix had 40
moderate/minor axe violations in 16 cells. The eight additional runtime surfaces produced
20 frames and zero axe violations. The matrix has 194/194 cells, with gaps for Storybook,
controlled rare failures and transient drag/resize/move. The coverage report marks all 38
inventory rows as not individually verified by the capture rig.

## Comb list

One closed, one partly closed and 20 open. All 21 outstanding records go to 82.1 under Q2 (c).
The [comb list](comb-list.json) records the full wording and evidence for each item.

| # | Result | Evidence summary |
|---:|---|---|
| 1 | closed | Archived tree no longer shows a false empty message. |
| 2 | open | Undo refusal says Restore or move a new dependent about a live, pre-existing workstream. |
| 3 | open | Saved Markdown shows “Unsaved preview” after Discard draft. |
| 4 | open | Restore toasts differ between Archive and Settings. |
| 5 | open | Archived Todos still invites opening rows that are hidden. |
| 6 | open | History requires manual Retry after connectivity returns. |
| 7 | open | Undo refusal exposes nested quotes and a record ID. |
| 8 | partly-closed | Blocked history gained a headline and details. Restore feedback still needs work and three other variants were not reached. |
| 9 | open | Dashboard task rows have a 46 px empty control gutter. |
| 10 | open | Late archive refusal wording remains unclear. |
| 11 | open | Archive confirmation buttons touch at 1440 and 375. |
| 12 | open | MCP archive refusal lists a completed workstream as active. |
| 13 | open | MCP restore refusal exposes IDs in place of titles. |
| 14 | open | History says Reactivated while restore toasts say Restored. |
| 15 | open | On Hold and On hold differ across controls. |
| 16 | open | Live update rewrites the open archive confirmation without notice. |
| 17 | open | Visible Restore button omits the name of the root it restores. |
| 18 | open | Current Kitchen leaves its children collapsed. |
| 19 | open | Live Legacy shelving under an archived parent is reachable only by URL. |
| 20 | open | Undo and Redo of workstream creation lose focus. |
| 21 | open | Archive displays “1 items”. |
| 22 | open | Cabinets header still uses 202 of 812 px on touch. |

## Decisions for the user

1. **Approve or adjust routing and priority.** An S1 blocks T10, and task arrival and date Undo create the
   most consequential non-agent problems. Approve the table, or move particular IDs among 82.1, redesign
   slices 8 and 9, 81.1 and open by decision. Recommend the table, with date Undo and task arrival first in
   82.1, and all agent S1s first in redesign slice 8. Approve the three proposed dashboard/Archive layout
   groups in 81.1, including the additional surfaces, or put those additions in 82.1 to keep 81.1 at its
   original scope. The 21 comb-list routes are already settled. Leave other S3s recorded, or explicitly
   select any to include. Keeping the proposed split avoids spreading one layout fix across two slices.
2. **Set or defer the S2 number.** Propose **fewer than 15 open S2 records**. The tally has 117, of
   which 14 are the TH12 scaffolding findings proposed to stay open by decision. This number counts all
   14 and leaves no extra allowance if all 14 remain. Set 15, choose another exclusive ceiling, or defer
   until the final comb. Recommend setting 15 now. If accepted scaffolding changes, a later gate can revisit
   the number explicitly. The recorded tally and the other §8 requirements continue to apply.
3. **Amend the canonical task-arrival decision and direction principle 8.** Dashboard and digest task links
   send users to a section heading, sometimes above the fold from the intended row. Keep section-level
   arrival, or require task-title links to reveal and identify the exact task at its canonical owner,
   including a keyboard arrival target. Recommend exact-task arrival. It preserves the owning section and
   avoids forcing a second search for the task. If accepted, Gate 3 recording should append a dated amendment
   to [Rows open their canonical owner](../../../decisions/2026-10-rows-open-their-canonical-owner.md)
   and [the design direction](../direction.md), with 82.1 verifying intact and missing destinations.
4. **Amend the touch rule for section chrome, or keep the accepted rule.** Phone users see muted insertion
   marks and tools whose hover names they cannot read. Keep the current shared emphasis and rely on the
   end-of-canvas label, or require a visible label for insertion and a readable way to identify section tools
   on touch before they execute. Recommend the latter, preserving quiet desktop chrome. If accepted, append
   a dated amendment to [Section chrome is quiet at rest](../../../decisions/2026-10-section-chrome-is-quiet-at-rest.md)
   and principle 5 in [the direction](../direction.md). This gives 82.1 an observable touch acceptance
   check and may use more room at 375 px.
5. **Resolve T08 for the literal stop rule.** Slice 81 accepted four clicks for page settings, while §8
   still compares against the three-click baseline. Preserve that design and explicitly allow this one
   baseline exception, or keep the strict criterion and ask a later slice to recover the click. Recommend
   preserving the design and documenting the narrow exception if approved. The tally would still show 4 vs 3,
   and T10 and the other open criteria would still block closure.
6. **Choose what to do with the step 4b friction note.** A workstream’s own `/pages/archive` address
   silently shows its canvas (`note-2026-11-26-001`). Leave it in the friction log, or request a 82.1
   check alongside the incorrect Archive links. Recommend the check, with no added finding or severity
   until verified in that scope.

## Gate 3 answers

The product owner passed Gate 3 on 2026-11-26 and accepted all six recommendations.

1. Approved the proposed routing. Five C82 S1 records and their five Gate 1 predecessors go to redesign slice 8. Of 117 open S2 records, 51 go to 82.1, 25 to 81.1, 24 to redesign slice 9, three to redesign slice 8 and 14 stay open by decision. All 21 outstanding comb-list items go to 82.1, including five counted in its S2 total. Plan 82.1 next, with date Undo and exact task arrival first, then redesign slices 8 and 9. Slice 81.1 stays queued with all three dashboard and Archive layout groups. Other S3 observations stay in the ledger. [Comb routes and priority after Gate 3](../../../decisions/2026-11-comb-routes-and-priority.md).
2. Set the stop rule to **fewer than 15 open S2 records**, counting the 14 open-by-decision records. A later gate may explicitly revisit the threshold. [The overhaul stops below 15 open S2 records](../../../decisions/2026-11-overhaul-s2-stop-threshold.md).
3. Task-title links must reveal and identify the exact task at its canonical owner and provide a keyboard arrival target. Slice 82.1 verifies arrival with intact and missing destinations. [Rows open their canonical owner](../../../decisions/2026-10-rows-open-their-canonical-owner.md).
4. On touch, section insertion has a visible label, and users have a readable way to identify section tools before they act. Quiet desktop chrome stays. [Section chrome is quiet at rest](../../../decisions/2026-10-section-chrome-is-quiet-at-rest.md).
5. Keep the four-click T08 page-settings path as a narrow exception to the protocol §8 three-click baseline. The tally keeps the observed 4 vs 3. [T08 keeps its four-click page-settings path](../../../decisions/2026-11-t08-baseline-exception.md).
6. Slice 82.1 checks a workstream’s own `/pages/archive` fallback alongside the incorrect Archive links (`note-2026-11-26-001`). A finding and severity require verification in that slice. [Verify the workstream Archive fallback in Slice 82.1](../../../decisions/2026-11-check-workstream-archive-fallback.md).

## Evidence crops

The crop paths are relative to `apps/e2e`. Each admitted C82 S1/S2 and comb-list S2 has a crop
and its source frame below. A wide frame retains context where location, focus or a missing control
is the issue. The Gate 1 IDs above come from the reconciled ledger.

| Record | Severity | Crop | Source frame |
|---|---|---|---|
| C82-L1-001 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L1-001.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/overdue-chaos-dashboard-light-1024.png` |
| C82-L1-002 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L1-002.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/archive-light-375.scroll-0-1.png` |
| C82-L1-003 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L1-003.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/prototype-design-light-375.png` |
| C82-L1-004 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L1-004.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/comb/skip-link-focused-light-1440.png` |
| C82-L1-005 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L1-005.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/reflections-light-375.png` |
| C82-L1-009 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L1-009.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/agent-heavy-dashboard-light-375.scroll-0-4.png` |
| C82-L2-001 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L2-001.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/kitchen-project-details-dark-375.png` |
| C82-L2-002 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L2-002.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/kitchen-page-settings-dark-375.png` |
| C82-L2-004 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L2-004.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/comb/drawer-saving-saved-dark-375.png` |
| C82-L2-005 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L2-005.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/comb/row-failure-dark-375.png` |
| C82-L2-006 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L2-006.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/busy-week-dashboard-dark-1024.scroll-0-3.png` |
| C82-L2-007 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L2-007.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/archive-dark-375.scroll-0-1.png` |
| C82-L2-008 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L2-008.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/agent-heavy-dashboard-dark-375.scroll-0-5.png` |
| C82-L2-009 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L2-009.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/todos-dark-375.scroll-0-1.png` |
| C82-L2-010 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L2-010.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/prototype-design-light-375.png` |
| C82-L3-001 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L3-001.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/phone-menu-light-375.png` |
| C82-L3-002 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L3-002.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/kitchen-grid-dark-375.png` |
| C82-L3-003 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L3-003.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/kitchen-grid-dark-375.png` |
| C82-L3-005 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L3-005.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/comb/row-failure-dark-375.png` |
| C82-L3-006 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L3-006.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/prototype-design-dark-375.png` |
| C82-L3-008 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L3-008.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/archive-light-375.scroll-0-1.png` |
| C82-L3-009 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L3-009.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/agent-heavy-dashboard-light-1024.scroll-0-3.png` |
| C82-L3-010 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L3-010.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/agent-heavy-dashboard-light-375.scroll-0-5.png` |
| C82-L4-001 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L4-001.png` | `ux-output/walk/l4/015-hidden-reflections-shortcut-l4.png` |
| C82-L4-002 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L4-002.png` | `ux-output/walk/l4/005-dashboard-recovered-sidebar-failed.png` |
| C82-L4-003 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L4-003.png` | `ux-output/walk/l4/009-refused-task-draft-l4.png` |
| C82-L4-004 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L4-004.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/comb/section-failed-recovered-dark-375.png` |
| C82-L4-005 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L4-005.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/agent-heavy-dashboard-light-1024.scroll-0-3.png` |
| C82-L4-006 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L4-006.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/agent-heavy-dashboard-light-375.scroll-0-4.png` |
| C82-L4-007 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L4-007.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/prototype-design-light-375.png` |
| C82-L5-001 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L5-001.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/comb/skip-link-focused-light-1440.png` |
| C82-L5-009 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L5-009.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/busy-week-dashboard-light-1024.scroll-0-3.png` |
| C82-L5-010 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L5-010.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/agent-heavy-dashboard-dark-375.scroll-0-4.png` |
| C82-L5-011 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L5-011.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/prototype-design-light-375.scroll-0-14.png` |
| C82-L5-012 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L5-012.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/comb/drawer-saving-dark-375.png` |
| C82-L6-001 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L6-001.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/comb/drawer-saving-saved-dark-375.png` |
| C82-L6-003 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L6-003.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/comb/drawer-saving-saved-dark-375.png` |
| C82-L6-004 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L6-004.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/busy-week-project-light-1440.scroll-0-3.png` |
| C82-L6-005 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L6-005.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/reflections-dark-375.scroll-0-1.png` |
| C82-L6-006 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L6-006.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/kitchen-page-settings-dark-375.png` |
| C82-L6-007 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L6-007.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/kitchen-shortcut-picker-dark-375.png` |
| C82-L6-008 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L6-008.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/settings-agents-dark-375.scroll-0-3.png` |
| C82-L6-009 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L6-009.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/archive-dark-375.scroll-0-1.png` |
| C82-L6-010 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L6-010.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/archive-dark-375.scroll-0-1.png` |
| C82-L6-012 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L6-012.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/kitchen-grid-light-1440.scroll-0-1.png` |
| C82-L6-014 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L6-014.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/comb/edit-project-menu-open-light-1440.png` |
| C82-L6-015 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L6-015.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/kitchen-grid-light-1440.scroll-0-2.png` |
| C82-L6-017 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L6-017.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/busy-week-dashboard-dark-1440.scroll-0-1.png` |
| C82-L6-018 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L6-018.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/nested-projects-dashboard-light-1024.scroll-0-1.png` |
| C82-L6-019 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L6-019.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/kitchen-remove-feedback-light-1440.scroll-0-3.png` |
| C82-L6-020 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L6-020.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/agent-heavy-dashboard-dark-375.scroll-0-4.png` |
| C82-L7-001 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L7-001.png` | `ux-output/walk/l7/001-archived-markdown-origin-destination.png` |
| C82-L7-002 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L7-002.png` | `ux-output/walk/l7/006-overdue-task-destination.png` |
| C82-L7-003 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L7-003.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/kitchen-page-settings-dark-375.png` |
| C82-L7-004 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L7-004.png` | `ux-output/walk/l7/004-archive-hidden.png` |
| C82-L7-005 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L7-005.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/calendar-dark-375.png` |
| C82-L7-006 | S1 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L7-006.png` | `ux-output/walk/l7/010-settings-agent-connections.png` |
| C82-L7-007 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L7-007.png` | `ux-output/walk/l7/005-all-projects-expanded.png` |
| C82-L7-008 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L7-008.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/prototype-design-dark-375.png` |
| C82-L7-009 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L7-009.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/agent-heavy-dashboard-dark-1024.scroll-0-3.png` |
| C82-L7-010 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-L7-010.png` | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/archive-dark-375.scroll-0-1.png` |
| C82-W1-001 | S1 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-W1-001.png` | `ux-output/walk/w1/043-t10-01-agents.png` |
| C82-W1-002 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-W1-002.png` | `ux-output/walk/w1/023-t04-04-date.png` |
| C82-W1-003 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-W1-003.png` | `ux-output/walk/w1/049-t11-02-landed.png` |
| C82-W1-004 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-W1-004.png` | `ux-output/walk/w1/028-t05-01-hover-remove.png` |
| C82-W1-005 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-W1-005.png` | `ux-output/walk/w1/017-t03-05-created.png` |
| C82-W1-006 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-W1-006.png` | `ux-output/walk/w1/022-t04-03-drawer.png` |
| C82-W2-001 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-W2-001.png` | `ux-output/walk/w2/041-t09-archive.png` |
| C82-W2-002 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-W2-002.png` | `ux-output/walk/w2/028-t05-before-remove.png` |
| C82-W2-004 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-W2-004.png` | `ux-output/walk/w2/015-t03-kitchen-top.png` |
| C82-W2-006 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-W2-006.png` | `ux-output/walk/w2/048-t11-landed.png` |
| C82-W2-007 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-W2-007.png` | `ux-output/walk/w2/025-t04-drawer.png` |
| C82-W2-009 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-W2-009.png` | `ux-output/walk/w2/031-t05-bottom-toast.png` |
| C82-W2-012 | S1 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-W2-012.png` | `ux-output/walk/w2/045-t10-agents.png` |
| C82-W3-002 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-W3-002.png` | `ux-output/walk/w3/006-t02-renovation.png` |
| C82-W3-004 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-W3-004.png` | `ux-output/walk/w3/021-t04-drawer.png` |
| C82-W3-005 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-W3-005.png` | `ux-output/walk/w3/025-t05-after-remove.png` |
| C82-W3-008 | S1 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-W3-008.png` | `ux-output/walk/w3/039-t10-agents.png` |
| C82-W3-010 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-W3-010.png` | `ux-output/walk/w3/044-t11-landed.png` |
| C82-W4-001 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-W4-001.png` | `ux-output/walk/w4/015-t03-alex-two-tasks.png` |
| C82-W4-003 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-W4-003.png` | `ux-output/walk/w4/020-setup-t04-drawer.png` |
| C82-W4-005 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-W4-005.png` | `ux-output/walk/w4/023-t04-alex-opened.png` |
| C82-W4-010 | S1 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-W4-010.png` | `ux-output/walk/w4/053-t10-alex-agents.png` |
| C82-W4-011 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-W4-011.png` | `ux-output/walk/w4/053-t10-alex-agents.png` |
| C82-W4-014 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-W4-014.png` | `ux-output/walk/w4/074-t04-sam-undo-probe.png` |
| C82-CL-02 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-CL-02.png` | `ux-output/walk/repro/010-cl02-cl07-refusal.png` |
| C82-CL-11 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-CL-11.png` | `ux-output/walk/repro/016-cl11-cl16-confirm-before.png` |
| C82-CL-16 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-CL-16.png` | `ux-output/walk/repro/016-cl11-cl16-confirm-before.png` |
| C82-CL-19 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-CL-19.png` | `ux-output/walk/repro/001-cl01-legacy.png` |
| C82-CL-20 | S2 | `ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/gate3-crops/C82-CL-20.png` | `ux-output/walk/repro/005-cl20-after-redo-workstream.png` |
