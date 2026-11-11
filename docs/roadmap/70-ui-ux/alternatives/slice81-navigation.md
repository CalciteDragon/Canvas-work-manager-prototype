# Slice 81 — navigation alternatives: summary and recommendation

**Status: picked (2026-11-10). The user chose B**, not the recommended A: "they liked B best on
seeing it", after this sheet and a set of question mockups. With it: no underlined blue links in the
navigation (themed controls instead), the tree's actions as a back-chevron and a pencil "Edit project"
menu on one row, and no visible Close in the phone drawer. Q4–Q11, Q14 and Q16 took the
recommendations below, re-read for B; Q7 and Q8 became "pencil menu + More". The pick is recorded in
the [decision](../../../decisions/2026-10-one-navigation-tree.md)'s 2026-11-10 amendment and the
plan's R1 outcome.

This is the committed summary of Slice 81's step 2
([plan](../../active/81-one-navigation-tree.md), R1). It compares three live specimens of the
[one navigation tree](../../../decisions/2026-10-one-navigation-tree.md) and recommends one. The
recommendation was the developer's; the user overruled it. Step 3 deleted the specimens, their rig
and the sheet builder; they remain in the history at `ea12164`.

## Evidence

- **Specimens:** `/prototype/navigation/:option` (`a`, `b`, `c`; query `at`, `keys=links|tree`, `home`,
  `q16`, `menu=open`), lazy and disposable, over the real seeds. A stand-in workspace (a static copy of
  the project header with Q10's fold, an `h1` per Q6 (i), three grey frames) is the same in every
  option, so differences are the navigation's.
- **Sheet:** `apps/e2e/ux-output/slice81-alternatives/index.html` (git-ignored). **68 comparison rows ×
  3 options** (11 contexts × light and dark × 1440, 375 with Menu closed, 375 with Menu open; plus
  `renovation-root` at 1024), 204 option captures, and four extra panels (Q4's two keyboard models,
  Q5's four namings, Q16's three options in A and C, and forced colours), 224 images in all.
- **Rig (deleted at step 3; at `ea12164`):** `apps/e2e/ux/navigation-alternatives.ts` under
  `ux/slice81-alternatives.config.ts` (ports 4257/4357), built from `f10ee16` plus this step's rig;
  Chromium 151. The builder was `docs/roadmap/70-ui-ux/tooling/build-navigation-alternatives.mjs`. To
  re-run, check out `ea12164`, then `pnpm --filter web build`,
  `cd apps/e2e && pnpm exec playwright test --config ux/slice81-alternatives.config.ts`, and the builder.

## Measurements

From Cabinets (depth 2 in nested-projects) to Garden / to the root's Todos / to Website launch's first
page (a second root the rig creates, since nested-projects has one root for the demo persona). Clicks
and keys at 1440; taps at 375 count Menu. Keys start with focus on the document and count every Tab,
arrow and Enter.

| Option · keyboard model | Clicks | Keys | Taps | Tab to first content (no skip / skip) | Header at 375 ends at | Targets < 44 px at 375 |
|---|---|---|---|---|---|---|
| A · links (Q4 a) | 1 / 1 / 1 | 15 / 9 / 18 | 2 / 2 / 2 | 24 / 6 | 274 px (34 %) | 0 |
| A · treeview (Q4 b) | 1 / 1 / 1 | 4 / 7 / 7 | 2 / 2 / 2 | 6 / 6 | 274 px (34 %) | 1 |
| B · links | 1 / 1 / 2 | 13 / 7 / 8 | 2 / 2 / 3 | 16 / 6 | 274 px (34 %) | 0 |
| B · treeview | 1 / 1 / 2 | 4 / 7 / 15 | 2 / 2 / 3 | 6 / 6 | 274 px (34 %) | 0 |
| C · links | 1 / 1 / 1 | 12 / 21 / 14 | 2 / 1 / 2 | 24 / 11 | 378 px (47 %) | 0 |
| C · treeview | 1 / 1 / 1 | 4 / 8 / 6 | 2 / 1 / 2 | 11 / 11 | 378 px (47 %) | 1 |

In every option and model the deepest path (Home renovation › Kitchen › Cabinets) is fully visible at
1440 and in the open drawer (3/3). At Cabinets (light, 1440 and the open 375 drawer) axe finds no serious
or critical node in either model. Under forced colours the current item stays distinct: the indicator
bar (the row's `::before`, `Highlight`) and the bold weight survive, the tint does not. The one small
target in the treeview is the "Projects" group label, which becomes a 28 px `treeitem`.

Every context capture (68 per option, links model) also records its own axe scan and, at 375, its small
targets. **No control under 44 px at 375 in any context or option.** axe's only serious nodes are
`color-contrast` on the muted archived rows in the open 375 drawer: **A none; B 2** (`legacy-archived`,
light); **C 4** (`legacy-archived` light; `legacy-shelving` light and dark). Q11's muted "Archived" row
needs a contrast-safe colour rather than reduced opacity whichever option is picked.

B's treeview figure to another root (15 keys) is partly an artefact: after "‹ All projects" changes the
level, the specimen drops focus to the document, so the count includes a Tab back into the tree. A product
build would keep focus on the level's first row, which would put it nearer the links model's 8.

## What the captures show

- **A, one expanded tree.** Everything is one tree: destinations, the current root's pages, its
  workstreams to full depth, then "Pages of Home renovation…" and "Add workstream". Every destination
  is one click away and other roots stay visible. Its costs: in the links model it has the most Tab
  stops before the content (24; the skip link brings it to 6), and at the 240 px sidebar "Pages of Home
  renovation…" and, with its disclosure, an archived row and its mark ("Legacy attic · Archived" in
  `legacy-shelving`) wrap to two lines.
- **B, a focused tree that drills in.** Inside a project the sidebar holds only that root, so it is the
  shortest list and the cheapest by keyboard within a project. But another root costs one more
  activation ("‹ All projects"), the tree loses the whole-workspace view the decision asked for, and the
  level is a mode the person has to track (the drawer opens at the current level).
- **C, pages in the header.** Root pages read as tabs beside the content (L7-018, L7-020), and the tree is
  short. But it amends the decision three times (R1), the header carries the tab row on every workstream
  of the root, so at 375 the header ends at 47 % of the screen even with Q10's fold, reaching root Todos
  by keyboard is the dearest of all (21 in the links model), and its first tab still needs a name:
  Q5 (d) ("no separate row") does not apply to C, which would need (a) or (b).

## Recommendation

**A, with Q4 (a) disclosure links.** It keeps the decision as written, is one activation to every
target, shows the whole workspace and the full depth of the current root, and its one real cost (Tab
stops) is answered by the skip link. B's drill-in hides other roots behind a mode; C is attractive for
root pages at 1440 but costs the phone header and three amendments. The treeview's key savings are real
(4 against 15 to Garden), but it adds a key manager, a 28 px item and 1–2 kB, and links stop being
links; the plan's Q4 reasoning stands.

What the specimens showed that step 3 must carry into the plan if A is picked: the folded header at
375 still ends at 34 % of the screen, not inside the top quarter Q10 aimed for (the stand-in puts
Details and the history and More buttons on rows of their own); the two-line wraps of the root-scoped
control and of an archived row with a disclosure at 240 px; the muted archived row's contrast; and the action rows (`Pages of …`, `Add workstream`) lose their
link colour under forced colours, so they need a shape cue as well.

The per-question recommendations, as they stand after the specimens, are in the plan's Open questions
and the step 2 report.
