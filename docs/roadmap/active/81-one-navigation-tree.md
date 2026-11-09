<!-- plan id="81" status="active" summary="Redesign slice 7: the global sidebar and the project column become one navigation tree with one you-are-here, one phone pattern, breadcrumbs, document titles, a skip link and Add workstream from the open work" -->
# Slice 81 — One navigation tree

**State (2026-11-09):** first draft written (S81PLAN), not yet reviewed. No implementation; the only code change
is `CURRENT_SLICE = 81` (`14ea6ec`). Next: review round 1 (AGENTS.md step 2), then the user's acceptance and
answers to the Open questions, then step 0. Initial bundle measured at the plan's start: 1,139.28 kB.

## Goal

Replace the global sidebar's Projects tree and the project navigation column with **one navigation tree**
that marks exactly one "you are here". The page heading, the breadcrumb and the document title agree with
it. Phones get one navigation pattern, keyboard users get a skip link, and Add workstream starts from the
open workstream and opens what it created. The tree's exact shape is chosen by the user from two or three
built alternatives before the slice commits to it.

**Settled and not re-opened here:**
- The user chose this slice next (2026-11-09). The §8 comb and redesign slice 8 stay pending, in that order.
- One tree, not two marked trees (Gate 1, 2026-10-14, [decision](../../decisions/2026-10-one-navigation-tree.md)).
- Add workstream's Parent defaults to the open workstream, and the root on root pages. A new workstream
  opens itself ([decision](../../decisions/2026-10-creation-defaults-follow-the-open-work.md), user
  confirmation 2026-10-14).

## Spec sections

- **§23 Application Shell.** The sidebar, the project column, the phone drawer, the Gate 1 correction.
  This slice replaces the two-column text with what is built, and keeps §23's keyboard and token rules.
- **§26 Project Page Design.** The Project Header and its relation to navigation: breadcrumbs, the page's
  heading, the header at phone width, and Add workstream.
- **§20 State boundaries.** Root-page state must not move into the store every route pays for (the reason
  the column lived in the feature; see R2).
- **§21 Design tokens.** No literal colours, spacing or radii in the new styles.
- **§47 One prototype-mode flag.** The alternatives route is prototype tooling and adds no scattered checks.
- **§68 Fallback redirects and §34 drawer focus hand-offs.** These must keep working once the column's focus
  request is gone.
- **§77 Intent changes.** Tests, implementation and docs change together, and real use comes after.
- **§78 Decisions.** The pick, and every answer below, become decision entries or dated amendments.

## Build

### R1 — Alternatives first (Gate 1 style)

The [decision](../../decisions/2026-10-one-navigation-tree.md) leaves open the tree's shape, how pages
appear under a root, whether "Home" is renamed, and where page settings sit. Steps 1–2 build **three live
specimens** behind a lazy prototype route and capture them. The user picks one at a `CHAIN: STOP`. The
specimens are disposable prototype tooling (AGENTS.md "Deliberately disposable"), deleted at step 3.

- **Route.** `/prototype/navigation/:option` (`option` ∈ `a`, `b`, `c`) with query `at=<app URL>`, for
  example `at=/projects/project-cabinets`. It is a `loadComponent` route, so it adds nothing to the initial
  bundle. It reads the real `ShellStore` projects and the current root's page records through the existing
  gateway interface, so it shows whatever seed is loaded. Links inside a specimen rewrite `at`, so the user
  can click and tab around in it. The workspace beside the tree is a **stand-in**: the header with its
  breadcrumb, an `h1`, the facts line, and three grey section frames. It does not render the real canvas.
- **What every specimen shows:** one current item with `aria-current="page"`; the breadcrumb; root-scoped
  page settings and Add workstream, each labelled with the root's name; a header at 375; the phone pattern
  (Menu closed and open); an archived workstream while it is current; Settings › AI & agents.
- **Option A — One expanded tree in the sidebar.** Home (or its new name, Q5), Calendar, Search, then
  Projects. Each root has a disclosure. The current root opens to its enabled pages, then its workstreams to
  full depth; other roots stay collapsed until opened. "Pages…" and "Add workstream" are labelled rows at
  the end of the current root's group. Keyboard: disclosure navigation (links and expand buttons in Tab
  order; Q4 (a)). Phone: the same tree in the existing Menu drawer.
- **Option B — A focused tree that drills in.** Outside a project, the sidebar lists destinations and roots.
  Inside one, it shows "‹ All projects", the root's name with its "Pages…" and "Add workstream" controls,
  its pages, and its workstream hierarchy; the other roots are one level up. Keyboard: an ARIA treeview with
  one Tab stop and arrow keys (Q4 (b)). Phone: the drawer opens at the current level.
- **Option C — Work in the tree, pages in the header.** The sidebar tree holds roots and workstreams only
  (each expandable). A root's pages become a labelled tab row in the project header ("Home renovation
  pages"), with "Pages…" at its end. Keyboard: disclosure navigation. Phone: the drawer for the tree, a
  scrolling tab row in the header. **C amends the decision's "each root expands to its enabled pages"**;
  it is built because the column's audit (L7-018, L7-020) suggests pages may read better beside the content.
- **Comparison sheet.** `apps/e2e/ux/navigation-alternatives.ts` captures each option over the contexts in
  the table below, light and dark, at 1440 and 375 touch, plus `renovation-root` at 1024. A builder,
  `docs/roadmap/70-ui-ux/tooling/build-navigation-alternatives.mjs`, writes
  `apps/e2e/ux-output/slice81-alternatives/index.html` (git-ignored): one row per context, one column per
  option, and a measured table per option. The committed summary is
  `docs/roadmap/70-ui-ux/alternatives/slice81-navigation.md`: the measurements, the trade-offs, and a
  recommendation that the user is free to overrule.

| Context | Seed | `at=` | Shows |
|---|---|---|---|
| `dashboard` | busy-week | `/app` | Workspace destination current; "Home" naming |
| `renovation-root` | nested-projects | `/projects/project-renovation` | Root Home page; pages under a root |
| `renovation-todos` | nested-projects | `/projects/project-renovation/pages/todos` | A root page other than Home |
| `kitchen` | nested-projects | `/projects/project-kitchen` | Depth 1; root-page scope (L7-020) |
| `cabinets` | nested-projects | `/projects/project-cabinets` | Depth 2; breadcrumb ends at current |
| `legacy-archived` | nested-projects | `/projects/project-legacy` | Archived current item (L7-008) |
| `settings-agents` | agent-heavy | `/settings/agents` | Settings child marked (L7-010) |
| `many-roots` | busy-week | `/projects/<first root>` | Collapsed roots with a long list |
| `empty` | empty | `/app` | No projects |

**Measured per option**, from the captures: Tab presses from load to the first content control on
`cabinets`; the navigation's width as a share of 1024; rows visible without scrolling at 1440 on
`many-roots`; serious and critical axe nodes; touch targets under 44 px at 375; whether the current place is
visible at 375 with Menu closed.

### R2 — Where the tree's data comes from (architecture)

The tree belongs to the shell, because it is on every route. A root's page records and a workstream's
ancestry are project-route state. The [column decision](../../decisions/2026-09-where-the-project-navigation-column-lives.md)
kept them out of `ShellStore` on §20 grounds, and that reason still holds.

- **`core/shell/navigation-context.ts`** (new): a root-provided holder of one signal, `projectPlace`. It is
  plain view data: root id and name, the enabled and renderable pages (kind, label, URL), the current page
  kind or project id, whether the current project is archived, and whether the root is archived. It also
  carries two command signals, `pageSettingsRequested` and `addWorkstreamRequested`. There are no gateway
  calls in it and no knowledge of features.
- **Writer:** `ProjectWorkspaceShell` publishes `projectPlace` from `ProjectWorkspaceStore` and clears it on
  destroy. The page-settings popover and the Add workstream dialog stay in `features/projects`, still inside
  the workspace shell's `@defer` chunk, and open on the command signals.
- **Reader:** the tree, in `core/shell/sidebar/` (renamed if the pick warrants it). The workstream hierarchy
  still comes from `ShellStore.projectTree`, which already nests to full depth.
- **The one new dependency is feature → core**, which is already allowed. `core/` gains no import from
  `features/` or `prototype/`. The context's types use `packages/contracts` page kinds and define nothing
  parallel.
- **Freshness:** a workstream created through Add workstream must appear in the tree. Today `ShellStore` is
  not refreshed by that path. Step 5 has `createWorkstream` ask `ShellStore` to reload (through the existing
  `SHELL_COMMANDS` direction, or a `reloadProjects` on the store), and tests it.

A decision entry records this ("The navigation tree reads project place from a context the project route
publishes").

### R3 — Behaviour that does not depend on the pick

- **One current item.** Exactly one link in the navigation has `aria-current="page"` on every route,
  including `/settings/agents` and `/settings/archived-projects`, which today mark nothing (L7-010, L1-026).
  The indicator is shape, not only hue (direction principle 4). An archived project is marked while current,
  under its parent, with the word "Archived" (L7-008; Q11).
- **Breadcrumb** (`shared/components/breadcrumb/`, new): `nav aria-label="Breadcrumb"` with an `ol`, every
  ancestor as a link, and the current item last as text with `aria-current="page"`. It sits above the page
  heading in the project header and on Settings children. It names the current workstream (L7-004, W1-016).
  Inline links inside it do not grow to 44 px on touch; the row as a whole meets the target
  (`note-2026-10-15-004`).
- **Document titles** (L7-019): a `TitleStrategy` in `core/` builds the title from route data and from
  `projectPlace`, in the format chosen in Q6. The page heading agrees with it (principle 8, L7-018; Q6).
- **Skip link** (L5-014, W3-001): "Skip to content", the first focusable element, visible on focus, moving
  focus to `<main>`.
- **One `main`** (L5-011, W3-009, W1-006, W2-033, W4-026): the dashboard's inner `<main>` becomes a `section`.
- **Heading outline** (L5-015, W1-049, W2-030): navigation has no headings that outrank or precede the page's
  `h1`; Archive's duplicate "Archive" heading and region go.
- **Add workstream** (W1-008, W2-004, W3-010, W4-029, W1-014, W2-007): Parent defaults to the open
  workstream, or the root on a root page. After a successful create the app navigates to the new workstream,
  focuses its `h1`, and the tree shows it under its parent. The receipt's feedback is unchanged. The refusal
  path keeps the draft, as now.
- **Page settings** (W1-044, W2-026, W4-017, L7-020): reachable from a visible, text-labelled control that
  names the root ("Pages of Home renovation…"), and from the project's More menu on root and workstream
  routes (Q7). The popover's behaviour is unchanged (fixed Home, pending, refusal, Escape focus return).
- **Phone** (L7-005, L7-006): one pattern. The project column's "Show project navigation" toggle and its
  re-collapse focus request (`ProjectColumnFocusRequest`) are deleted. The drawer keeps every rule of the
  [phone drawer decision](../../decisions/2026-09-phone-navigation-drawer.md): trap, Escape, Close,
  backdrop, inert workspace, focus to `<main>` after a choice, resize resets. When it opens, the current item
  is scrolled into view. The current place is visible with the drawer closed, through the breadcrumb (Q9).
- **Header at phone width** (L1-014): the project header takes at most a quarter of the first screen at
  375×812 (Q10). This is also where the header's own left edge is aligned with the content (L1-006, carried
  from Slice 76).
- **Width at 1024** (L7-007, W1-055, L1-013): with one column, the navigation takes at most 25 % of 1024.
- **Deep trees.** Ancestors of the current item are always expanded. Indentation stops growing after four
  levels; deeper rows keep the fourth indent, and the breadcrumb carries the full path. Long names wrap, they
  do not truncate. (A default, not a question: AGENTS.md §4.)
- **New workstreams look like their siblings** (W1-011): one row component draws every workstream.
- **Group headings** (L2-016, carried from Slice 71): the tree's group labels share one style.
- **Comb item 1** ("No workstreams yet" over archived workstreams) closes, because the tree draws no empty
  sentence under a root; an empty root shows only its pages and "Add workstream".

### R4 — Paying for the bundle

Initial is **1,139.28 kB** at the plan's start, so the headroom is **10.7 kB**.

- **What goes:** the project column is already in a `@defer` chunk, so deleting it frees little initial code.
  The workspace shell's column logic (collapse signals, `ProjectColumnFocusRequest`, link-selected focus)
  is initial, estimated at **2–3 kB**. The sidebar's current tree (12.05 kB in the esbuild metafile) is
  rewritten, not removed.
- **What comes:** the tree's disclosure state, pages and current marking (+3–5 kB over today's sidebar), the
  breadcrumb (+1–2 kB), the title strategy (+1 kB), the skip link and header disclosure (+1 kB), the
  navigation context (+0.5 kB). Option B's treeview keyboard adds an estimated 1–2 kB more.
- **Estimate:** net **+4 to +8 kB**, ending at 1,143–1,147 kB. That fits, but with little to spare.
- **The rule:** every web step runs `pnpm --filter web build` and records the figure in the State header.
  A step that would cross 1,150 kB stops with `CHAIN: STOP`. The alternatives route is lazy, and step 1
  verifies that it adds nothing to the initial bundle.
- **Fallbacks, measured at step 0** in a temporary build that is then reverted: lazy `/settings` (its page is
  2.89 kB in the metafile) and lazy `/search`. They are listed in Q12 for the user to pre-approve. Nothing
  here raises the ceiling.

## Done when

The user has picked an alternative, and the picked tree is the only navigation hierarchy on every route, at
every width. Every in-scope finding below is closed or explicitly advanced, with its pair on the sheet.
§77's test changes are made. The sheet has zero gate failures and passes the user's Gate 2. The initial
bundle stays under 1,150 kB.

## Do not

- Change the agent connections page beyond its breadcrumb and current marking (slice 8). Rename product words
  beyond navigation labels (slice 9), except the "Home" answer in Q5. Touch TH12 scaffolding.
- Fix the TH13 content-layer findings unless Q1 says so.
- Add a projects index page, a history page (L7-021) or an archive merge (L7-009) unless Q1 says so.
- Add routes for nested workstreams. A workstream stays `/projects/:id`.
- Change any domain, contract, host or MCP behaviour. This slice is web-only.
- Add Angular CDK Tree or a key manager to the initial bundle without measuring it first.
- Raise the bundle ceiling.

## Scope check

**A redesign slice under the overhaul protocol, with the §6 extras.** It is the shell layer: it changes the
chrome on every route. The sheet is therefore every matrix cell, but the gate compares only the navigation and
header regions as changed; the content regions must not change apart from the width the second column frees.
To keep the sheet to one screen of review, Q1 recommends taking TH13's content-layer findings out.

## Findings closed

**In scope if Q1 is answered (a):** 43 findings, plus 4 carried items.

| Group | Findings | How |
|---|---|---|
| One tree, one current place | L7-001, L7-002, W1-015, W4-004, W1-046, L7-008, L7-020, W1-011 | R1 pick, R3 current item |
| "Home" means two places | L7-003, W4-005, L6-006 | Q5 |
| Breadcrumb and page identity | L7-004, W1-016, L7-018, W1-049, W2-030 | R3 breadcrumb, Q6 |
| Settings children | L7-010, L1-026 | R3 current item and breadcrumb |
| Width at 1024 | L7-007, W1-055, L1-013 | One column |
| Titles | L7-019 | R3, Q6 |
| Skip link, landmarks, outline | L5-014, W3-001, L5-011, W3-009, W1-006, W2-033, W4-026, L5-015 | R3 |
| Phone | L7-005, L7-006, L1-014 | R3, Q9, Q10 |
| Projects group | L7-022 (partly: per-project disclosure; no index page) | R1 |
| Add workstream | W1-008, W2-004, W3-010, W4-029, W1-014, W2-007 | R3 |
| Page settings | W1-044, W2-026, W4-017 | R3, Q7 |
| Carried | L1-006 (header edge, Slice 76), L2-016 (group headings, Slice 71), `note-2026-10-15-004` (breadcrumb touch targets, Slice 72), comb item 1 | R3 |

**Not closed here (Q1 (a)):** L7-009 and L7-021 (concepts, not navigation: the comb re-judges them after this
slice); L1-004, L1-018, W2-015, W2-022, W2-028, L5-018 (TH13 content layouts: a follow-on slice 81.1); W1-041,
W4-016 (shortcut discoverability, TH15's canvas part: slice 9 or the comb). W1-026, W3-012, W2-009 and W4-008
closed in Slices 74–75.

Step 0 re-checks every in-scope finding against the current build and records which still reproduce. A
finding that no longer reproduces is listed as "closed earlier" with its evidence, not claimed by this slice.

## Acceptance check

Run in this order on the slice's final commit. Items marked **(pick)** are firmed up at step 3.

1. `pnpm test`, then `pnpm lint` (which runs `pnpm docs:check`), never concurrently with the root docs tests.
2. `pnpm --filter web build`: initial total under 1,150 kB, and `git diff 14ea6ec -- apps/web/angular.json`
   is empty.
3. `pnpm --filter @cwm/e2e exec playwright test navigation-tree.spec.ts phone-layout.spec.ts work-navigation.spec.ts web.spec.ts lifts.spec.ts page-history.spec.ts project-creation-history.spec.ts project-history.spec.ts canvas-editing.spec.ts placement.spec.ts states.spec.ts empty-archived-editing.spec.ts cascading-archive.spec.ts archived-projects.spec.ts`
   passes, and one full `pnpm e2e` passes. The Outcome says if any part was not re-run after a later fix.
4. **`apps/e2e/navigation-tree.spec.ts`**: journeys on `nested-projects` unless named. Each reseeds. All at
   1440 with a mouse; journeys 1, 4, 5, 7 and 8 again at 375 by touch; journeys 3, 5, 6 and 9 by keyboard
   alone.
   1. **One current item.** On `/app`, `/calendar`, `/search`, `/settings`, `/settings/agents`,
      `/settings/archived-projects`, root Home, Todos, Archive, Reflections, Kitchen, Cabinets and Legacy
      attic: exactly one element in the page has `aria-current="page"` inside navigation, and its accessible
      name matches the `h1` and is contained in `document.title`.
   2. **One tree.** On Kitchen, the page has exactly one link to `/projects/project-kitchen` inside any
      `navigation` landmark (the breadcrumb's ancestor links excepted, by landmark name), and no element
      named "Show project navigation".
   3. **Skip link.** From a fresh load of Cabinets, the first Tab focuses "Skip to content"; Enter moves
      focus into `main`; every route above has exactly one `main` landmark.
   4. **Breadcrumb.** Cabinets shows "Home renovation › Kitchen › Cabinets"; the last item is current text;
      Kitchen's link opens Kitchen.
   5. **Add workstream from Kitchen.** The control is reachable from the tree **(pick)**. Parent is
      preselected "Kitchen"; on a root page it is "Home renovation". Create "Pantry": the URL becomes
      Pantry's, its `h1` has focus, the tree shows Pantry under Kitchen, marked current, and the receipt's
      Open link and toast are as before. A refused create (host fault) keeps the dialog, draft and focus.
   6. **Page settings.** The control's accessible name includes "Home renovation"; it is also in More on
      Kitchen. Enabling Reflections adds it to the tree **(pick: under the root, or in the header tabs)**;
      Escape returns focus to the control.
   7. **Phone.** At 375 there is one navigation control, Menu. With it closed, the breadcrumb shows the
      current place on Cabinets. Opening it shows the tree with Cabinets current and in view. Choosing Garden
      closes it and focuses `main`. Escape returns focus to Menu. A resize to 1440 closes it.
   8. **Archived current.** Legacy attic is marked current, under Home renovation, with "Archived"; leaving
      it removes it from the tree.
   9. **Keyboard model (pick, Q4).** (a): Tab reaches each link and expand button in order, and Enter or
      Space toggles a root. (b): one Tab stop; arrows, Home, End, and Right/Left to expand or collapse.
   10. **Deep tree.** Five nested workstreams created through the host API under Cabinets: the deepest is
       marked current, its ancestors are expanded, indentation stops at the fourth level, and the breadcrumb
       names all seven levels.
   11. **1024.** On root Home at 1024×768, the navigation's width is at most 256 px.
   12. **Titles.** `document.title` for Cabinets and for root Todos equals the format chosen in Q6.
5. `apps/e2e/phone-layout.spec.ts` keeps every drawer rule from the phone decision (trap, Escape, Close,
   backdrop, inert, resize, failed create reopening the form), rewritten only where the column is gone.
6. The sheet (Capture scope) has zero gate failures and goes to the user for **Gate 2**.
7. **Real use** after Gate 2: `nested-projects` and `busy-week` at 1440 mouse, 1440 keyboard and 375 touch,
   with notes in `.prototype/notes.json` under slice 81. (No MCP surface changes; one MCP `create_project`
   under Kitchen checks that the tree refreshes from a live frame.)

## Capture scope

Rig: `apps/e2e/ux/slice81.config.ts` on ports 4257 and 4357 (never 4200 or 4310; the Slice 80 rig never runs at
the same time), `.prototype/ux-slice81.json`, a baseline build at the accepted plan's commit in
`apps/e2e/ux-output/slice81-baseline-web/`, and `build-sheet.mjs --profile 81`. At most two browser jobs at once;
`route.fallback()` in routes, never `route.continue()`.

**Must change (light and dark, 1440 and 375; 1024 where the matrix has it):** the navigation and header regions
of every matrix cell. **(pick)** fixes the region selectors.

**Newly captured, no "before"** (runtime verification contexts in `ux/navigation-tree-verification.ts`, light at
1440, dark at 375): `drawer-open-cabinets`, `skip-link-focused`, `add-workstream-kitchen`,
`page-settings-open`, `legacy-archived-current`, `settings-agents-current`, `deep-tree`.

**Must not change:** the content region of every cell (below the header), compared by the profile's DOM census
(roles, names, text) rather than pixels, because the freed width reflows it; the Design Lab panels other than
`navigation`; every dialog, toast and lift that is not navigation's.

## Visual acceptance

| Pair | What it shows |
|---|---|
| `renovation-root` 1440 before/after | Two trees → one, with the root's pages (L7-001) |
| `kitchen` 1440 | Kitchen marked; root-page scope labelled (L7-002, L7-020) |
| `cabinets` 1440 | Breadcrumb ends at Cabinets, above the `h1` (L7-004, W1-016) |
| `renovation-root` 1024 | Content takes most of the width (L7-007) |
| `kitchen` 375, Menu closed and open | One pattern; current place visible closed (L7-005, L7-006) |
| `renovation-root` 375 | Header within a quarter of the screen (L1-014) |
| `settings-agents` 1440 | Settings child marked, breadcrumb back (L7-010) |
| `legacy-archived` 1440 | Archived current item in the tree (L7-008) |
| `dashboard` 1440 | Renamed or kept "Home" (L7-003) |
| `add-workstream-kitchen` | Parent "Kitchen" (W1-008) |
| `page-settings-open` | Labelled control naming the root (W1-044) |
| `skip-link-focused` | The skip link visible on focus (L5-014) |

## Behaviour vs. appearance

**Behaviour changes**; this is an intent change under §77.

**Tests that change with intent** (rewritten in the step that changes their behaviour):
- `core/shell/sidebar/sidebar.spec.ts` (23 tests): Projects-tree cases move to the tree spec; the create form,
  loading, failure and empty cases stay.
- `core/shell/app-shell.spec.ts` (30): drawer cases stay; skip link and `main` cases added.
- `features/projects/project-page-navigation.spec.ts` (20): deleted with the component; its gear and page
  cases move to the page-settings host's spec, its tab cases to the tree spec.
- `features/projects/project-workspace-shell.spec.ts` (79): column collapse, `ProjectColumnFocusRequest` and
  column-focus cases are deleted; context publication and command cases added.
- `features/projects/work-create-dialog.spec.ts` (8): the root-default case becomes the open-workstream case.
- `features/projects/project-workspace-store.spec.ts` (77): `createWorkstream` returns the new id and asks the
  shell to reload.
- `app.routes.spec.ts` (4): titles.
- `apps/e2e/phone-layout.spec.ts:228, 274, 299` (column re-collapse, gear and Work from the column), and
  `work-navigation.spec.ts` (all 4, including "Work plus creates once without navigation", which reverses).
- Locator updates only (the journeys' intent is unchanged): `web.spec.ts`, `page-history.spec.ts`,
  `project-creation-history.spec.ts`, `lifts.spec.ts`, `canvas-editing.spec.ts`, `project-history.spec.ts`,
  `placement.spec.ts`, `states.spec.ts`, `empty-archived-editing.spec.ts`, `primitives.spec.ts`,
  `cascading-archive.spec.ts`, `archived-projects.spec.ts`, `feedback.spec.ts`, `mcp.spec.ts`,
  `task-lifts.spec.ts`. New locators are role-based.
- Stories: `sidebar.stories.ts` (tree states), `project-page-navigation.stories.ts` (deleted),
  `work-create-dialog.stories.ts` (Parent default); Design Lab's `navigation` panel.

**Must stay green untouched:** every domain, contract, host and MCP test; the four acceptance scripts; every
canvas, section, task and dashboard component spec except the dashboard's landmark.

**Earlier evidence tools:** `apps/e2e/ux/*-verification.ts` for Slices 73–80 locate the column. They run only
under their own configs, not in `pnpm test` or `pnpm e2e`, and stay as their frozen records' tools with a
one-line header note each.

## File-level change list

Paths marked **(pick)** are confirmed or renamed at step 3.

### Steps 1–2 — alternatives (deleted at step 3)

| File | Change | Responsibility |
|---|---|---|
| `apps/web/src/app/prototype/navigation-alternatives/navigation-alternatives-page.ts`, `.html`, `.scss` | create | Lazy route page: reads `at`, current place, stand-in workspace |
| `apps/web/src/app/prototype/navigation-alternatives/option-a.ts`, `option-b.ts`, `option-c.ts` (+ `.html`/`.scss`) | create | The three specimens |
| `apps/web/src/app/prototype/navigation-alternatives/navigation-alternatives-page.spec.ts` | create | One smoke spec per option: renders, marks one current item |
| `apps/web/src/app/app.routes.ts` | modify | `/prototype/navigation/:option`, `loadComponent` |
| `apps/e2e/ux/navigation-alternatives.ts`, `apps/e2e/ux/slice81-alternatives.config.ts` | create | Captures and measurements |
| `docs/roadmap/70-ui-ux/tooling/build-navigation-alternatives.mjs` | create | The comparison sheet |
| `docs/roadmap/70-ui-ux/alternatives/slice81-navigation.md` | create | Committed summary and recommendation |
| `docs/architecture/web/prototype-tooling/{overview,how}.md` | modify | The route while it exists, then its removal |

### Core (steps 4, 6, 8)

| File | Change | Responsibility |
|---|---|---|
| `apps/web/src/app/core/shell/navigation-context.ts` (+ `.spec.ts`) | create | R2's project-place holder and commands |
| `apps/web/src/app/core/shell/sidebar/sidebar.ts`, `.html`, `.scss`, `.spec.ts`, `.stories.ts` **(pick)** | modify | Becomes the one tree: destinations, roots, pages, workstreams, current item, settings children |
| `apps/web/src/app/core/shell/sidebar/project-tree-item.ts`, `.scss` **(pick)** | modify or replace | One row for every workstream; disclosure; depth cap |
| `apps/web/src/app/core/shell/shell-store.ts` (+ spec) | modify | `reloadProjects()` for R2's freshness |
| `apps/web/src/app/core/shell/app-shell.ts`, `.html`, `.scss`, `.spec.ts` | modify | Skip link; drawer opens with current in view; header slot unchanged |
| `apps/web/src/app/core/shell/top-bar/top-bar.*` | modify only if Q9 (b) | Current place beside Menu |
| `apps/web/src/app/core/navigation/document-title.ts` (+ spec) | create | `TitleStrategy` per Q6 |
| `apps/web/src/app/app.config.ts` | modify | Provide the `TitleStrategy` (no adapter change) |
| `apps/web/src/app/app.routes.ts`, `app.routes.spec.ts` | modify | Route `title` data |

### Shared (step 7)

| File | Change | Responsibility |
|---|---|---|
| `apps/web/src/app/shared/components/breadcrumb/breadcrumb.ts`, `.html`, `.scss`, `.spec.ts`, `.stories.ts` | create | The breadcrumb |

### Features (steps 5, 7, 8)

| File | Change | Responsibility |
|---|---|---|
| `features/projects/project-workspace-shell.ts`, `.html`, `.scss`, `.spec.ts` | modify | Publish `projectPlace`; host page settings and Add workstream on commands; delete the column, its collapse and `ProjectColumnFocusRequest` |
| `features/projects/project-page-navigation.ts`, `.html`, `.scss`, `.spec.ts`, `.stories.ts` | delete | The column |
| `features/projects/project-work-item.ts`, `.scss` | delete | The column's work row |
| `features/projects/page-settings-popover.ts`, `.html`, `.scss`, `.spec.ts` | create | The gear's popover, moved out of the column unchanged |
| `features/projects/work-create-dialog.ts`, `.spec.ts`, `.stories.ts` | modify | Parent default from the open workstream |
| `features/projects/project-workspace-store.ts`, `.spec.ts` | modify | `createWorkstream` returns the id, reloads the shell's projects; the shell navigates and focuses |
| `features/projects/project-header.ts`, `.html`, `.scss`, `.spec.ts` | modify | Breadcrumb slot; phone compaction (Q10); left edge (L1-006); C's tab row if picked |
| `features/projects/project-more-menu.ts` (+ spec) | modify | "Pages…" item (Q7) |
| `features/projects/pages/archive-page.*` or `archived-region/*` | modify | One Archive heading and region (W1-049, W2-030) |
| `features/projects/project-page-registry.ts` | modify only if Q5 renames the page | Label |
| `features/dashboard/dashboard-page.html` (+ spec) | modify | `main` → `section` |
| `features/settings/settings-page.ts`, `agents/agent-connections-page.*`, `archived-projects/archived-projects-page.*` | modify | Breadcrumb "Settings › …" |
| `prototype/design-lab/panels/live-panels.html` | modify | The tree's states |

### E2E and evidence (steps 0, 5–9, 11)

| File | Change | Responsibility |
|---|---|---|
| `apps/e2e/navigation-tree.spec.ts` | create | Acceptance item 4 |
| `apps/e2e/phone-layout.spec.ts`, `work-navigation.spec.ts` | modify | §77 rewrites |
| The fifteen specs listed under Behaviour vs. appearance | modify | Locators |
| `apps/e2e/ux/slice81.config.ts`, `ux/navigation-tree-verification.ts` | create | Rig and runtime contexts |
| `apps/e2e/ux/*-verification.ts` (73–80) | modify | One-line frozen-tool header note |
| `docs/roadmap/70-ui-ux/tooling/build-sheet.mjs`, `build-sheet.test.mjs` | modify | Profile 81 |

### Documentation (in the step that changes the behaviour; step 10 sweeps)

| File | Change |
|---|---|
| Spec §23, §26 | Replace the two-column text with the picked tree; breadcrumbs, titles, skip link, phone, Add workstream |
| `docs/decisions/2026-10-one-navigation-tree.md` | Amendment: the pick, and Q4–Q11's answers |
| `docs/decisions/2026-09-phone-navigation-drawer.md`, `2026-09-where-the-project-navigation-column-lives.md`, `2026-09-project-navigation-gear-and-work-create.md`, `2026-09-optional-page-management-lives-in-project-navigation.md`, `2026-10-creation-defaults-follow-the-open-work.md` | Dated amendments |
| `docs/decisions/2026-11-navigation-reads-project-place-from-a-context.md` | New (R2) |
| `docs/decisions/2026-11-document-titles-and-skip-link.md` | New (Q6, R3) |
| `docs/decisions/README.md` | Index |
| `docs/architecture/web/{overview,why,what,how}.md`, `web/core/*`, `web/projects/*`, `web/dashboard/how.md`, `web/prototype-tooling/*`, `testing/{what,how}.md` | What is now true |
| `docs/guides/first-milestone-walkthrough.md`, `README.md` | Where they name the column or the gear |
| `docs/roadmap/active/70-ui-ux-overhaul.md`, `docs/roadmap/goals.md` | Handoff |

## Implementation sequence

One fresh session per step. Each ends green, commits, updates the State header, and records the bundle after
any web change.

0. **Rig and "before"** (after Q1–Q3 and Q12 are answered). `slice81.config.ts`; baseline build at the accepted
   plan's commit; the "before" matrix. Re-check each in-scope finding against the baseline and record the
   result. Measure lazy `/settings` and lazy `/search` in a temporary build, then revert it.
1. **Alternatives: specimens.** R1's route and options A–C, with their smoke spec. Verify the initial bundle
   is unchanged.
2. **Alternatives: captures and sheet.** Capture, build the comparison sheet, write the summary and its
   recommendation. **End with `CHAIN: STOP`.** The user picks an option and answers Q4–Q11.
3. **Firm up the plan.** Record the pick and answers (decision amendments). Rewrite every **(pick)** item and
   steps 4–12 concretely. Run one review round on the changed plan. Delete the alternatives route and its
   files.
4. **The tree in core** (tests first): `navigation-context`, the tree, current marking, settings children,
   disclosure, depth cap, archived-current row, Lab panel and stories.
5. **Project wiring** (tests first): publish the context; move page settings and Add workstream; Parent
   default; navigate and focus after create; reload the shell's projects; delete the column. Rewrite
   `work-navigation.spec.ts`.
6. **Phone**: one pattern; delete the column's toggle and focus request; current item in view; rewrite the
   `phone-layout.spec.ts` cases.
7. **Breadcrumb and header**: the component; the project header and Settings children; phone compaction;
   the header's edge.
8. **Titles, skip link, landmarks and outline**: `TitleStrategy`, skip link, the dashboard's `main`, Archive's
   heading, navigation without headings above the `h1`; "Home" per Q5.
9. **Journeys**: `navigation-tree.spec.ts`; the locator sweep; the full `pnpm e2e`.
10. **Docs sweep**: spec, decisions, architecture, guides, README; `pnpm docs:check`.
11. **Sheet**: profile 81, the verification contexts, the "after" capture, zero gate failures.
12. **Review**: diff reviews (correctness, spec, boundaries, acceptance, docs), fixes, re-capture. **Stop for
    Gate 2.**
13. **After Gate 2**: real use (Acceptance item 7), Outcome, `roadmap.mjs complete`, the umbrella's handoff.

## Test plan — tests first

Steps 4–8 write these first and watch each fail for the right reason. **(pick)** cases are firmed at step 3.

| Test | Proves |
|---|---|
| `navigation-context.spec.ts`: publishes and clears a project place | The context holds no stale root after leaving a project |
| `navigation-context.spec.ts`: commands reach a subscriber once | Page settings and Add workstream open once per request |
| `sidebar.spec.ts`: exactly one `aria-current` per place (dashboard, settings child, root page, workstream, archived) | R3's one current item |
| `sidebar.spec.ts`: current root expands; others collapse; toggling keeps the current one | The disclosure model |
| `sidebar.spec.ts`: ancestors of current are expanded; depth 6 indents as depth 4 | Deep trees |
| `sidebar.spec.ts`: archived current shown with "Archived"; gone when not current | L7-008 |
| `sidebar.spec.ts`: page settings and Add workstream controls name the root; archived root's Add stays focusable with its reason | Scope labels; the existing unavailable rule |
| `sidebar.spec.ts`: no heading in navigation outranks the page's `h1` | L5-015 |
| `sidebar.spec.ts`: keyboard model (pick) | Q4 |
| `shell-store.spec.ts`: `reloadProjects` re-reads once and keeps the tree on failure | Freshness without losing the list |
| `project-workspace-shell.spec.ts`: publishes pages, current kind and archived state; clears on destroy | R2's writer |
| `project-workspace-shell.spec.ts`: a page-settings command opens the popover; Escape returns focus to the requesting control | Gear behaviour carried over |
| `work-create-dialog.spec.ts`: Parent defaults to the open workstream; to the root on a root page | W1-008 |
| `project-workspace-store.spec.ts`: `createWorkstream` returns the new id and requests a shell reload; a refusal keeps the draft | W1-014; refusal path |
| `project-workspace-shell.spec.ts`: after create, navigates to the new workstream and focuses its `h1` | W2-007 |
| `breadcrumb.spec.ts`: ancestors as links, current as text with `aria-current` | L7-004 |
| `project-header.spec.ts`: breadcrumb on a workstream; at narrow width the facts fold behind a disclosure (Q10) | L1-014 |
| `document-title.spec.ts`: titles for a static route, a root page, a workstream and an unavailable project | L7-019 |
| `app-shell.spec.ts`: the first focusable is the skip link; activating it focuses `main` | L5-014 |
| `app-shell.spec.ts`: the drawer opens with the current item in view; every earlier drawer case still passes | Phone pattern |
| `dashboard-page.spec.ts`: no nested `main` | L5-011 |
| `archive-page` spec: one Archive heading and region | W1-049 |

Failure and permission paths covered: a failed projects read (the tree's existing failure state); a refused
or failed workstream create; a page-settings write refused or pending; an archived root's unavailable Add; a
project the actor cannot see (the unavailable page sets the title and leaves nothing current in the tree).

## Boundaries touched

- **Components depend on gateway interfaces.** The tree reads `ShellStore` and the context; the popover and
  dialog keep their store. `app.config.ts` gains a `TitleStrategy` provider, which is not an adapter.
- **`core/` never depends on `prototype/` or `features/`.** The context is in `core/`, written by the
  feature. The alternatives live in `prototype/` and import core, never the other way.
- **§20, no mega-store.** No page records enter `ShellStore` (R2).
- **Contracts once.** Page kinds come from `packages/contracts`; the context's view type is not a contract.
- **Tokens.** No literal colours, spacing or radii; the token lint runs on the new styles, including styles
  held in TypeScript.
- **One prototype flag.** The alternatives route adds no `if (prototypeMode)`.
- **Domain, MCP, repositories, `Clock`:** untouched.

## Explicit non-goals

- The TH13 content layouts, L7-009, L7-021, W1-041 and W4-016 (Q1).
- A projects index page, drag-to-reorder in the tree, favourites, or search inside the tree.
- New routes for workstreams, or a change to the URL scheme.
- The agent connections card (slice 8) and product vocabulary (slice 9) beyond Q5.
- Any comb item other than item 1.

## Open questions

**Answer before step 0:** Q1, Q2, Q3, Q12. **Answer at the pick (after step 2):** Q4–Q11, with the specimens
in front of you. Each has a recommendation; the specimens show the recommended answer unless the question says
otherwise.

**1. What does this slice close?**
- *Context.* TH11 (33), TH13 (9) and TH15's Add workstream and gear part (9) are 51 findings. Six of TH13's are
  content layouts, not navigation (dashboard gutters, the Today widget, archive rows, the Markdown editor at 375,
  reflow at 320). L7-009 (where archived things go) and L7-021 (history has no place) are concepts, not tree
  shape. W1-041 and W4-016 are TH15's shortcut half, which the brief did not include.
- *Options.* (a) Take the navigation and header findings (the table above); put the six TH13 content layouts in
  a follow-on slice 81.1; let the comb re-judge L7-009 and L7-021; send W1-041 and W4-016 to slice 9 or the comb.
  (b) Take all of TH13 here. (c) Also take L7-009 (add "Archived projects" to the tree) and L7-021.
- *Recommendation.* (a). The protocol asks for a sheet that fits one review screen, and a shell slice already
  changes every cell's navigation.
- *Impact.* (a): 43 findings plus 4 carried items here, and a small slice 81.1 queued before the comb. (b): six
  more content regions change, so the "content must not change" gate goes, and the sheet roughly doubles.
  (c): two concept designs added to a shape decision.

**2. What form do the alternatives take?**
- *Options.* (a) Live specimens behind a lazy `/prototype/navigation/:option` route over the real seeds, with a
  stand-in workspace (R1). (b) Static HTML mockups, like Gate 1. (c) Storybook stories with fixture data.
- *Recommendation.* (a). You can use the keyboard and touch in each and see the real trees, and the code is
  disposable and lazy, so it costs no initial bundle.
- *Impact.* (a): two sessions (steps 1–2). (b): one session, but the keyboard models and real depth cannot be
  tried. (c): similar cost to (a), but Storybook has no shell, so the phone pattern cannot be shown.

**3. Which alternatives are built?**
- *Options.* (a) A, B and C as in R1. (b) A and B only, which keeps the decision's "pages under the root". (c)
  Different options you name.
- *Recommendation.* (a). C contradicts one line of the decision, but L7-018 and L7-020 point at pages beside
  the content, and the decision invites two or three shapes.
- *Impact.* (a): three specimens. (b): about a third less work in steps 1–2. Picking C needs a decision amendment.

**4. The tree's keyboard model and ARIA pattern.**
- *Context.* Today the sidebar and the column are plain link lists.
- *Options.* (a) Disclosure navigation: nested lists of links, expand buttons with `aria-expanded`, all in the
  Tab order. Collapsed roots and the skip link keep Tab counts low. (b) An ARIA treeview (`role="tree"`,
  `treeitem`, `aria-level`, roving tabindex): one Tab stop, arrows, Home, End, type-ahead.
- *Recommendation.* (a). Links stay links (middle click, the screen reader's link list), the code is smaller,
  and it needs no key manager in the initial bundle. Option B shows (b) so you can try it.
- *Impact.* (a): Acceptance 4.9 (a). (b): about 1–2 kB more and a harder §77 rewrite of every keyboard journey.

**5. Does "Home" keep its name?**
- *Context.* The workspace dashboard and each root's first page are both "Home" (L7-003, W4-005, L6-006). In the
  one tree they would be one row apart, and the seed root is called "Home renovation".
- *Options.* (a) Keep the dashboard as "Home", rename the root page "Overview" (label only; the `home` page kind
  in contracts and MCP is unchanged). (b) Rename the dashboard "Dashboard" and keep the root's "Home". (c) Keep
  both.
- *Recommendation.* (a). "Home" for the workspace start is the common convention, and a project's first page as
  "Overview" reads well under the project's name.
- *Impact.* (a): label, spec §26 and e2e locators that say Home on project pages. (b): the sidebar, the dashboard
  `h1` and their locators. (c): three findings stay open.

**6. Document titles, and the page heading on root pages.**
- *Context.* Every route is "Canvas Work Manager" (L7-019). Every root page's `h1` is the project name, so the
  page is named only by the highlighted tab (L7-018). Principle 8 asks the title and heading to agree with the
  current item.
- *Options.* Title: (a) "Todos · Home renovation · Canvas Work Manager", most specific first; (b) "Home
  renovation – Todos | Canvas Work Manager". Heading: (i) the `h1` names the page ("Todos"), with the project in
  the breadcrumb above it; root Home's `h1` stays the project's name; (ii) the `h1` stays the project's name and
  the page name becomes a subtitle.
- *Recommendation.* (a) and (i): the tab's name leads, and the heading equals the current item.
- *Impact.* (i) changes the `h1` on Todos, Archive and Reflections, which several e2e journeys locate by name.

**7. Where page settings live.**
- *Options.* (a) A labelled control in the tree's root group ("Pages of Home renovation…") **and** a "Pages…"
  item in More. (b) Only in More. (c) Only in the tree.
- *Recommendation.* (a). The findings ask for "where the page is, or in the project's actions menu"; both cost
  one item.
- *Impact.* (b) or (c) save one control; (b) hides the setting from the tree it changes.

**8. Where Add workstream starts.**
- *Options.* (a) A labelled "Add workstream" row at the end of the current root's workstreams in the tree. (b) An
  item in More ("Add workstream under Kitchen"). (c) Both.
- *Recommendation.* (a). It is where the result appears, and the dialog states the Parent.
- *Impact.* (b) takes it out of navigation; (c) is one more menu item.

**9. The phone pattern.**
- *Context.* Today: a Menu drawer for the sidebar, and a separate inline column toggle (L7-006).
- *Options.* (a) The tree in the existing Menu drawer; the column toggle goes; the breadcrumb under the top bar
  shows the current place. (b) As (a), plus the current place's name beside Menu in the top bar. (c) A bottom
  sheet.
- *Recommendation.* (a). It keeps the phone decision's tested focus rules, and the breadcrumb already answers
  L7-005.
- *Impact.* (b): a top-bar change and its spec. (c): a new lift and new focus rules.

**10. The project header at 375.**
- *Context.* It takes about 40 % of the first screen (L1-014): icon, name, description, Status, Progress, Target
  date, history controls and More.
- *Options.* (a) Below 48rem, the description and facts fold behind a "Details" disclosure; name, breadcrumb,
  history and More stay. (b) Facts on one line, the description hidden on phones. (c) No change.
- *Recommendation.* (a). Nothing is lost, and the content starts in the top half.
- *Impact.* (a): one disclosure and its spec. (b): the description becomes unreachable on phones.

**11. Archived work in the tree.**
- *Options.* (a) Not listed, except the current item, which is listed under its parent and marked "Archived"
  while current. (b) Listed always, muted. (c) Never listed.
- *Recommendation.* (a). It mirrors "Archive is listed while current", and keeps the tree to live work.
- *Impact.* (b): a long tree on agent-heavy, and it contradicts Slice 79's "the sidebar lists live projects
  only". (c): L7-008 stays open.

**12. What pays for the bundle?**
- *Context.* 10.7 kB of headroom; the estimate is +4 to +8 kB (R4).
- *Options.* (a) Fit within the headroom; pre-approve lazy `/settings` and then lazy `/search` as payment, used
  only if a step's build would end above 1,148 kB. (b) As (a), but also `@defer` the task-details drawer (14.7 kB
  in the metafile), which delays its first open by one chunk load. (c) Raise the ceiling: your call alone; the
  plan never does this.
- *Recommendation.* (a). Both routes are rarely the first page, and each is one `loadComponent` line.
- *Impact.* (a): the first open of Settings or Search loads a small chunk. (b): a measurable delay on the first
  task selection, and a lift journey to re-check.

## Revisions

- **First draft (2026-11-09, S81PLAN):** written from the code, the spec, the findings and the decisions.

## Outcome

<!-- Written at step 13. -->
