<!-- plan id="81" status="active" summary="Redesign slice 7: the global sidebar and the project column become one navigation tree with one you-are-here, one phone pattern, breadcrumbs, document titles, a skip link and Add workstream from the open work" -->
# Slice 81 — One navigation tree

**State (2026-11-10):** **step 1 (alternatives: specimens) done; step 2 (captures and sheet) is next.** Plan accepted on 2026-11-09 with Q1 (a), Q2 (a),
Q3 (a), Q12 (a), Q13 (b) and Q15 (a); Q4–Q11, Q14 and Q16 are answered at the pick after step 2. Plan review: six cold rounds (`ba4a454` … `af3f373`)
plus two on the acceptance amendment. `CURRENT_SLICE = 81` is `14ea6ec`. Done in step 0:
- *Rig* (`d3aa6d7`): `apps/e2e/ux/slice81.config.ts` (4257/4357, `.prototype/ux-slice81.json`, seeded from
  `prototype/seeds/empty.json`); `ux/navigation-tree-verification.ts` with only the core-task test; `navLocators`
  in `ux/tasks.ts` (gear and Add workstream keyed on `UX_BEFORE`; "after" names per J5/J6, made exact at step 3),
  used by `capture.ts`; T02 skips "Choose Kitchen as parent" when Parent already shows it; `kitchen-collapsed`
  scoped to `main`. Line citations elsewhere in this plan (`capture.ts:34`, `:48`, `:169`, `tasks.ts:117`) refer
  to `1a0fb0d`; they are now `capture.ts:35`, `:50`, `:171` and `tasks.ts:129`.
- *Baseline:* built in a temporary worktree at `1a0fb0d` (the accepted plan's commit), copied to
  `apps/e2e/ux-output/slice81-baseline-web/` (git-ignored), worktree removed. Initial total **1,139.37 kB**.
- *"Before" capture:* `UX_BEFORE=1a0fb0d98fb9c324e9db96dee2ab80f4778e24eb` into
  `apps/e2e/ux-output/1a0fb0d98fb9c324e9db96dee2ab80f4778e24eb/`: 194/194 matrix cells captured (two halves,
  `UX_MATCH='^[a-m]'` 5.7 min and `'^[n-z]'` 7.4 min). Core-task counts (clicks/keystrokes): T01 2/16, T02 3/19,
  T03 10/38, T04 1/0, T05 2/0, T06 2/16, T07 3/0, T08 3/0, T09 1/0, T11 1/0, T12 1/0; T10 blocked as in every
  earlier baseline (no Connect agent control; slice 8). These equal Slice 79's recorded counts.
- *Q12 (a) fallbacks measured* (temporary `app.routes.ts` change, reverted): lazy `/settings` **1,137.10 kB**
  (−2.27 kB; chunk 2.62 kB); lazy `/settings` and `/search` **1,136.00 kB** (−3.37 kB in all).
- *Trap:* Playwright's headless shell was missing; `pnpm exec playwright install chromium` fixed it.
- *Rerun recipe:* `cd apps/e2e && UX_BEFORE=<sha> pnpm exec playwright test --config ux/slice81.config.ts
  navigation-tree-verification.ts` (tasks), and `capture.ts` with `UX_MATCH` halves (merge into `index.json`).
- *Finding re-check:* all in-scope ids reproduce; L2-012, L2-016, L1-006 and `note-2026-10-15-004` only in
  part (Findings closed, "Step 0's re-check"). None is "closed earlier".
- *Review* (one cold reviewer over `1a0fb0d..faa6ae9`): no substantive findings. Minor, fixed: the core-task test
  allows T10's dead end only at "Find Connect agent control"; `testing/how.md` says an "after" run fails until the
  tree's "Pages of Home renovation…" exists (T08 and `kitchen-page-settings`). Noted: Acceptance item 6's "no dead
  end" is read against the baseline, where T10 is already a dead end (slice 8's); the click comparison is step 13's.
**Step 0 is complete** (bundle 1,139.37 kB, no web code). Done in step 1 (commits in the Revisions entry):
- *Specimens:* `/prototype/navigation/:option` (`loadComponent`; `app.routes.spec.ts` counts it) loads
  `prototype/navigation-alternatives/`: `NavigationAlternativesPage` (the layer, `inert` on the shell's top bar
  and sidebar, skip link, stand-in header with breadcrumb, Q6 (i) `h1`, Q10's Details fold at 375, three frames,
  phone Menu and drawer, one lift), `SpecimenModel` (parses `at`; current chain and root pages through the
  gateway interface; rows from `ShellStore`), `SpecimenTree` (rows in `keys=links` or `keys=tree`), and
  `OptionA`, `OptionB`, `OptionC` + `OptionCTabs`. Query: `at`, `keys`, `home=a|b|c|d` (Q5, default d),
  `q16=a|b|c` (default b; a and c read no pages), `menu=open` (drawer open on load, for captures).
  Data attributes for step 2's measurements: `data-specimen-nav`, `-header`, `-heading`, `-breadcrumb`,
  `-page-tabs` (C), `-first-content`, `-skip-link`, `-menu`, `-lift`, `-action="page-settings|add-workstream|new-project"`.
- *Smoke spec:* `navigation-alternatives-page.spec.ts` (7 cases: one per option, C's tab row and `location`,
  the treeview's one tab stop, the root-labelled controls, a project read landing after leaving marks nothing).
- *Rig:* `apps/e2e/ux/slice81-alternatives.config.ts` (4257/4357, `.prototype/ux-slice81-alternatives.json`,
  serves `apps/web/dist/web/browser`, so build first) and `ux/navigation-alternatives.ts`: a browser smoke
  (every option × keyboard model over nested-projects) and the probe. Run: `pnpm --filter web build`, then
  `cd apps/e2e && pnpm exec playwright test --config ux/slice81-alternatives.config.ts`. Step 2 adds captures here.
  The probe asserts its findings, so a Chromium that changes them fails the probe and step 6's mechanism is re-checked.
- *Probe (Chromium 151.0.7922.34; `ux-output/slice81-alternatives/popover-probe.json`):* `showPopover({ source })`
  sets the implicit anchor, but the initial `position-anchor` is **`normal`**, under which `.lift--popover`'s
  `anchor()` ignores it and the lift falls to the viewport corner (this is Slice 73's invoker trap too); with
  `position-anchor: auto` it sits under the opener. The `source` is **not** exempt from light dismiss: a pointer
  press on the opener closes the lift and its click reopens it. A `commandfor` + `command="toggle-popover"`
  invoker is exempt and anchors the same way. The specimen uses `source` + `position-anchor: auto` + a
  remembered pointer press. R2's "keeps the light-dismiss exemption" is therefore wrong; step 3 picks step 6's
  mechanism (R2, "Probe result").
- *Bundle:* initial **1,139.85 kB** (+0.48 kB: the route entry, 0.17 kB in `main`, and 0.34 kB of export names
  in a shared initial chunk for eager symbols the lazy chunk reuses). The specimen chunk is lazy (45.49 kB raw).
  It returns to the baseline when step 3 deletes the route. R1's "adds nothing" is corrected.
- *Traps:* the alternatives rig serves the last build, so rebuild after any web change; `cdkTrapFocusAutoCapture`
  grabs focus at init even while the trap is off (not used); `(pointerdown.capture)` is not an Angular event
  modifier (a native capture listener is used).
**Next is step 2** (captures, sheet, summary, recommendation; ends with `CHAIN: STOP`).

## Goal

Replace the global sidebar's Projects tree and the project navigation column with **one navigation tree**
that marks exactly one "you are here". The page heading, the breadcrumb and the document title agree with
it. Phones get one navigation pattern, keyboard users get a skip link, and Add workstream starts from the
open workstream and opens what it created. The tree's exact shape is chosen by the user from three built
alternatives before the slice commits to it.

**Settled and not re-opened here:**
- The user chose this slice next (2026-11-09). The §8 comb and redesign slice 8 stay pending, in that order.
- One tree, not two marked trees (Gate 1, 2026-10-14, [decision](../../decisions/2026-10-one-navigation-tree.md)).
  Root-scoped controls stay reachable from the tree, labelled with their scope.
- Add workstream's Parent defaults to the open workstream, and the root on root pages. A new workstream
  opens itself ([decision](../../decisions/2026-10-creation-defaults-follow-the-open-work.md), user
  confirmation 2026-10-14).

## Spec sections

- **§23 Application Shell.** The sidebar, the project column, the phone drawer, the Gate 1 correction.
  This slice replaces the two-column text with what is built, and keeps §23's keyboard and token rules.
- **§26 Project Page Design.** The Project Header ("describes the project, not the page"), breadcrumbs, the
  page's heading (Q6 may correct §26), the header at phone width, and Add workstream.
- **§20 State boundaries.** Root-page state must not move into the store every route pays for (R2).
- **§21 Design tokens.** No literal colours, spacing or radii in the new styles.
- **§47 One prototype-mode flag.** The alternatives route adds no scattered checks.
- **§62 Live updates.** The tree keeps re-reading on `project.*` frames.
- **§68 Fallback redirects and §34 focus hand-offs.** They must keep working once the column's focus request
  is gone (R2).
- **§77 Intent changes.** Tests, implementation and docs change together, and real use comes after.
- **§78 Decisions.** The pick and every answer below become decision entries or dated amendments.

## Build

### R1 — Alternatives first (Gate 1 style)

The [decision](../../decisions/2026-10-one-navigation-tree.md) leaves open the tree's shape, how pages
appear under a root, whether "Home" is renamed, and where page settings sit. Steps 1–2 build **three live
specimens** behind a lazy prototype route and capture them. The user picks one at a `CHAIN: STOP`. The
specimens are disposable prototype tooling (AGENTS.md "Deliberately disposable"), deleted at step 3.

- **Route.** `/prototype/navigation/:option` (`option` ∈ `a`, `b`, `c`) with query `at=<app URL>` (for
  example `at=/projects/project-cabinets`) and `keys=links|tree` (the keyboard model, Q4, independent of the
  shape). It is a `loadComponent` route, so the specimens stay out of the initial bundle; step 1 measured the
  route entry itself at +0.48 kB (State header), which step 3's deletion returns.
- **It covers the shell.** `App` always wraps routes in `AppShell`, so the specimen is a fixed, full-viewport
  layer. While mounted it sets `inert` on the shell's own top bar and sidebar and removes it on destroy, so Tab
  counts and the phone captures measure only the specimen. This is a prototype-only hack, deleted at step 3.
- **Data.** It injects `ShellStore` (provided by `AppShell`) and reads the current root's pages through the
  `WorkManagerGateway` interface, so it shows whatever seed is loaded. Disposable code is allowed this
  shortcut; product code is not (`shell-commands.ts:4-8`). Links rewrite `at`, so the user can click and
  tab around in it.
- **Stand-in workspace.** A static copy of the real project header at its real size (icon, name, description,
  facts, history and More buttons), with Q10's fold applied at 375 in every option so header height differs
  only by what the option adds. Below it, an `h1` per Q6's recommendation and three grey section frames.
- **Every specimen shows:** the skip link; one current item with `aria-current="page"`; the breadcrumb;
  root-scoped page settings labelled with the root's name (in the tree, or in C's tab row) and Add workstream
  described with it (R3); the phone pattern (Menu closed and open); the archived cases of Q11; Settings children (AI & Agents and
  Archived projects, as children of Settings only, not a new archive destination); the archived-only empty state.
- **Option A — One expanded tree in the sidebar.** Home, Calendar, Search, then Projects as a group label
  (not a heading, so nothing precedes the page's `h1`) with New project. Each root has its own disclosure (replacing the all-or-nothing Projects toggle, L7-022).
  The current root opens to its pages, then its workstreams to full depth; other roots stay collapsed until
  opened, and stay as the person left them across navigation. "Pages of X…" and "Add workstream" are labelled
  rows at the end of the current root's group. Phone: the same tree in the existing Menu drawer.
- **Option B — A focused tree that drills in.** Outside a project, the sidebar lists destinations and roots.
  Inside one, it shows "‹ All projects", the root's name with its "Pages of X…" and "Add workstream"
  controls, its pages and its workstream hierarchy; other roots are one level up. Phone: the drawer opens at
  the current level.
- **Option C — Work in the tree, pages in the header.** The tree holds roots and workstreams only. A root's
  pages become a labelled tab row in the project header ("Home renovation pages"), with "Pages of X…" at its
  end. **C amends the decision three times**: pages are not under the root; page settings are not in the tree;
  and the tab row holds `aria-current="page"` while the tree marks the project as the current location with
  `aria-current="location"`, so "exactly one current item" becomes one per landmark. It is built because L7-018
  and L7-020 suggest pages may read better beside the content.
- **Contexts** (light and dark; 1440 and 375 touch; `renovation-root` also at 1024. 768 px is inside the
  48rem drawer breakpoint, so it is the phone pattern, not a second inline width):

| Context | Seed | `at=` | Shows |
|---|---|---|---|
| `dashboard` | busy-week | `/app` | Workspace destination current; "Home" naming |
| `renovation-root` | nested-projects | `/projects/project-renovation` | Root's first page; pages under a root |
| `renovation-todos` | nested-projects | `/projects/project-renovation/pages/todos` | Another root page |
| `kitchen` | nested-projects | `/projects/project-kitchen` | Depth 1; root-page scope (L7-020) |
| `cabinets` | nested-projects | `/projects/project-cabinets` | Depth 2; breadcrumb ends at current |
| `legacy-archived` | nested-projects | `/projects/project-legacy` | Archived current item (L7-008) |
| `legacy-shelving` | nested-projects | `/projects/project-legacy-child` | Live work hidden under an archived parent, while current |
| `settings-agents` | agent-heavy | `/settings/agents` | Settings child (L7-010) |
| `many-roots` | busy-week | `/projects/project-launch` | Several roots, most collapsed |
| `archived-only` | nested-projects, every root archived through the host API | `/app` | "No active projects. View archives" |
| `empty` | empty | `/app` | No projects |

- **Measured per option and keyboard model** (in the comparison sheet): activations (clicks, or keys by
  keyboard) from Cabinets to Garden, to root Todos, and to Website launch's first page; Tab presses from load to
  the first content control, with and without the skip link; header height at 375 as a share of 812; rows of
  the deepest path visible at 1440 and in the open 375 drawer; touch targets under 44 px at 375; serious and
  critical axe nodes; whether the current item is distinct under forced colours (Playwright `forcedColors:
  'active'`).
- **Comparison sheet.** `apps/e2e/ux/navigation-alternatives.ts` and `slice81-alternatives.config.ts` (ports
  4257 and 4357, the same ports as Slices 79 and 80's rigs, which never run at the same time) capture and
  measure. `docs/roadmap/70-ui-ux/tooling/build-navigation-alternatives.mjs` writes
  `apps/e2e/ux-output/slice81-alternatives/index.html` (git-ignored): one row per context, one column per option.
  The committed summary is `docs/roadmap/70-ui-ux/alternatives/slice81-navigation.md`: measurements,
  trade-offs, and a recommendation the user is free to overrule.

### R2 — Where the tree's data comes from (architecture)

The tree belongs to the shell, because it is on every route. A root's page records and a workstream's
ancestry are project-route state. The [column decision](../../decisions/2026-09-where-the-project-navigation-column-lives.md)
kept them out of `ShellStore` on §20 grounds, and that reason holds.

- **`core/shell/navigation-context.ts`** (new): a root-provided holder of plain view data, `projectPlace`:
  root id and name; the enabled and renderable pages (kind, label, URL; Archive listed while current even when
  hidden, as Slice 74 decided); the current page kind; the current project (id, name, status) and its ancestors
  (id, name, status, root first); a `missing` state for a failed or not-found load; and `addBlockedReason`, the
  sentence the feature already builds for an archived root (`project-workspace-shell.ts:162-165`). The
  ancestors and current project matter because the domain drops live work under an archived ancestor from
  the projects read (`project-service.ts:98-112`), so only the context can draw Legacy shelving while it is
  current (Q11), and the title needs the names. Archived projects themselves are in `ShellStore`'s read; the
  web filters them out of the tree at `shell-store.ts:66`. No gateway calls, no knowledge of
  features.
- **Keyed, not cleared.** `/projects/:id` and `/projects/:id/pages/:kind` are two route configs, so moving
  between them destroys and re-creates `ProjectWorkspaceShell`. The context is therefore replaced when the new
  shell publishes, and cleared only on a `NavigationEnd` outside `/projects/`. While a new project loads, the
  tree keeps the previous root's rows if the root is the same, and otherwise shows the new root's row alone
  until its pages arrive. A failed or not-found load clears the root's pages and marks nothing in it.
- **Commands are handlers, not signals.** The feature registers `{ openPageSettings(request), openAddWorkstream(request) }`,
  where `request` is `{ source: HTMLElement | null; returnFocus: HTMLElement }` (the trigger for both at desktop;
  no source and Menu as `returnFocus` from the phone drawer),
  with `NavigationContext.register()`, which returns a disposer called on the shell's destroy. A trigger calls
  the current handler with its own element. Nothing replays into a re-created shell. With no handler (not on
  a project route) the triggers are not rendered.
- **The sidebar stays presentational** (`sidebar.ts:22-27`). `AppShell` reads the context and passes
  `projectPlace` in as an input and turns the tree's outputs into handler calls, so the Design Lab can keep
  feeding the tree its inputs.
- **The popover and the dialog** stay in `features/projects`. Today the popover sits inside the column's
  `@defer` (`project-workspace-shell.html:47`) and the dialog already has its own `@defer (when
  workCreateOpen())` (`:148-152`) without an `@error`. The popover gets the same shape, `@defer (when
  pageSettingsRequested())`, opened after the block renders; both get an `@error` state ("Couldn't open page
  settings." / "Couldn't open Add workstream." with Reload page), so both stay out of the initial bundle.
  `on interaction` is not used: it cannot name an element in another component's template.
- **Opening the popover without an invoker.** Today the gear is a `popovertarget` invoker
  (`project-page-navigation.html:35`). From a handler, the popover opens with `showPopover({ source: opener })`,
  which keeps the implicit anchor and the light-dismiss exemption for the opener; the handler returns an
  open-state signal that the core trigger binds to `aria-expanded`, and a second press closes it.
  `LiftFocus` returns focus to the opener.
- **From the phone drawer.** `<main>` is inert while the drawer is open. The drawer is the same sidebar
  instance, hidden and inert, not removed, so its opener stays connected and a `focus()` on it would silently
  fail (`shared/lifts/lift-focus.ts:9-10`). So `AppShell` closes the drawer first and passes **Menu** as the focus-return
  target, not as the popover's `source`: a source is exempt from light dismiss, so tapping Menu would open the
  drawer under a popover still open. At 375 the popover opens with no `source` and an explicit placement (a
  sheet at the top of the viewport) instead of the hidden anchor, and `LiftFocus` returns focus to Menu.
  `showPopover({ source })` is typed in TypeScript 6's DOM lib; step 1's specimens probe its anchor and
  light-dismiss behaviour in the e2e Chromium before step 6 relies on it, and unit specs spy on it, because the
  unit DOM may lack it (`shared/feedback/toast.ts:47` calls `showPopover?.()`).
  **Probe result (step 1, Chromium 151):** the anchor holds only with `position-anchor: auto` on the popover
  (the initial value is `normal`), and the `source` is **not** exempt from light dismiss, so a second press would
  reopen. Step 3 chooses between `source` with `position-anchor: auto` and a remembered pointer press (what the
  specimen does), and a `commandfor`/`command="toggle-popover"` invoker, which is exempt but needs the popover's
  element to exist when pressed (it is deferred).
- **`closeWorkCreate`** (`project-workspace-shell.ts:466-474`) takes the handler's opener instead of searching
  its own host for the plus or the toggle; after a successful create it yields to the new `h1`.
- **Freshness.** `ShellStore` already re-reads on every `project.*` live frame (`shell-store.ts:154-155`). To
  make the order deterministic (the new row exists when focus lands), `ProjectWorkspaceShell` asks for the
  existing `ShellStore.refresh()` through a new `SHELL_COMMANDS.refreshProjects()` and awaits it before
  navigating. `ShellStore.refresh()` is private today (`shell-store.ts:163`) and becomes public.
  `ProjectWorkspaceStore` does not inject the shell's token.
- **`ProjectColumnFocusRequest` splits.** Its column half goes. Its `archiveUrl` half (Open archive landing on
  the Archive heading across shell instances, `project-workspace-shell.ts:535-552`) stays as
  `ArchiveFocusRequest`. The §68 fallback redirect carried the column request to its target (`:330-335`);
  with no column, a tree link that ends in a redirect keeps focus on the pressed link at desktop width (the
  tree persists across routes), and at 375 the drawer's rule sends it to `main`. `core/a11y/route-focus.ts`
  is unchanged: it only rescues focus lost to `body`.
- **The one new dependency is feature → core**, which is already allowed. `core/` gains no import from
  `features/` or `prototype/`. Page kinds come from `packages/contracts`.

A decision entry records this ("The navigation tree reads project place from a context the project route
publishes").

### R3 — Behaviour that does not depend on the pick

- **One current item.** Exactly one item in the tree's landmark has `aria-current="page"` on every route,
  including `/settings/agents` and `/settings/archived-projects`, which today mark nothing (L7-010, L1-026,
  L2-012). The marker is a shape (an indicator bar plus weight), not only hue, the same in both themes, and
  visible under forced colours (L5-008, L2-012, L5-017's navigation half; direction principle 4, Slice 71's
  deferral).
- **Breadcrumb** (`shared/components/breadcrumb/`, new, with a story and a Design Lab specimen before any page
  adopts it, protocol §7.1): `nav aria-label="Breadcrumb"`, an `ol`, each ancestor a link, the current item
  last as text with `aria-current="page"`. It sits above the page heading in the project header and on Settings
  children, and names the current workstream (L7-004, W1-016). On a root's first page there is no breadcrumb
  (a one-item trail repeats the `h1`); on root Todos it is "Home renovation › Todos". Its touch size is Q14.
- **Archive origin path** (W2-030, `note-2026-10-15-004`): the archived row's "Origin: …" reuses the
  breadcrumb's links and separators, so it reads as a path ("Home renovation › Legacy attic"); whether its
  links grow on touch is Q14.
- **Document titles** (L7-019): a `TitleStrategy` in `core/navigation/` sets static routes' titles from route
  data; on project routes an effect in the same service rebuilds the title whenever `projectPlace` publishes,
  including after the async load and a live rename. Q6 gives the format. Unavailable and not-found pages have
  their own titles.
- **Page heading** (L7-018): per Q5 and Q6. Todos's "What is coming up" heading goes either way, so a page is
  named once.
- **Skip link** (L5-014, W3-001): "Skip to content", the first focusable element, visible on focus, moving
  focus to `<main>`.
- **One `main`** (L5-011, W3-009, W1-006, W2-033, W4-026): the dashboard's inner `<main>` becomes a `section`.
- **Heading outline** (L5-015, W1-049): no navigation heading precedes or outranks the page's `h1`; Archive's
  nested "Archive" heading and region go.
- **Add workstream** (W1-008, W2-004, W3-010, W4-029, W1-014, W2-007): Parent defaults to the open
  workstream, or the root on a root page. When the open workstream is not an eligible parent (archived, or
  under archived ancestry, which the [gear decision](../../decisions/2026-09-project-navigation-gear-and-work-create.md)
  excludes), the default is the nearest eligible ancestor (Q15 (a)). An archived root keeps its focusable unavailable Add with its reason.
  After a create: await the shell's refresh, navigate to the new workstream, focus its `h1`. A refused create
  keeps the dialog, draft and focus, as now.
- **The create's toast and its Undo** (Q13 (b), workstream creation only; the full rule is under Q13): after
  the navigation the toast says "Created Pantry under Kitchen." with Undo and no "Open Pantry" link. Undo from
  that toast, once it commits, removes Pantry, returns to the parent (Kitchen) and focuses its heading; the
  parent's toast then says "Undone: Created “Pantry”." with the link "Open Pantry to redo" and no Undo; the
  landing is a push, so Back reaches Pantry's "Creation undone" with Redo after the toast has gone. A stale,
  gone, refused or failed Undo stays on Pantry, and one that lands after the person left Pantry moves nothing. The header's Undo on Pantry, and root creation, are unchanged: they
  land on "Creation undone" at the created project's URL.
- **Add workstream's control** (default; Q8 decides where): one control per tree, at the end of the current
  root's workstreams, visible text and accessible name "Add workstream" (T02's exact locator still matches),
  with the description "in Home renovation" (`aria-describedby`), because it creates inside this root while its
  Parent defaults to the open workstream. It does not say "to Home renovation", which would contradict the
  preselected Kitchen.
- **Page settings** (W1-044, W2-026, W4-017, L7-020): a visible, text-labelled control naming the root
  ("Pages of Home renovation…") in the tree, plus Q7's answer. Unchanged behaviour: fixed first page, pending,
  refusal, retry, Escape focus return; a kind with no renderer is not advertised.
- **Phone** (L7-005, L7-006): one pattern. The column's "Show project navigation" toggle and its re-collapse
  focus request go. The drawer keeps every rule of the
  [phone drawer decision](../../decisions/2026-09-phone-navigation-drawer.md). When it opens, the current item
  is scrolled into view. The breadcrumb shows the current place with the drawer closed (Q9). Slice 73's
  deferral, "the phone navigation drawer as a lift", is answered here: it adopts the lift tokens (plane, blur,
  z-index, motion) but keeps its own focus rules, because they are tested and decided.
- **Header at phone width** (L1-014): at most a quarter of the first screen at 375×812 (Q10). The header's
  own left edge aligns with the content's (L1-006, carried from Slice 76).
- **Width** (L7-007, W1-055, L1-013): one column; the navigation takes at most 25 % of 1024, and the first
  section of the opened project starts inside the first 768 px. It stays sticky and scrolls its own long list
  while the content scrolls, as the column did (§23, Slice 27). The 48rem drawer breakpoint is unchanged; it
  includes a 768 px viewport, so the phone decision's "a 768 px tablet keeps the inline sidebar" is stale and is
  corrected in its amendment.
- **Deep trees.** Ancestors of the current item are always expanded. Indentation stops growing after four
  levels; deeper rows keep the fourth indent, and the breadcrumb carries the full path. Long names wrap.
  (A default, AGENTS.md §4.)
- **One row component for every workstream** (W1-011, W1-015, W4-004, W1-046). Group labels share one style
  (L2-016, carried from Slice 71).
- **`nestedProjects` off.** Today the flag flattens every project to a top-level row (`shell-store.ts:86-90`).
  With one tree, workstreams appear only under their root, flag or not: a named behaviour change, and the flag
  then only hides the work hierarchy below the root's pages.
- **Archived current items, and live work hidden under an archived parent:** Q11. Both reach the tree only
  through the context, while current.
- **Comb item 1** ("No workstreams yet" over archived workstreams) closes: the tree draws no empty sentence
  under a root. The umbrella's comb list is updated.
- **Empty states keep their words** ([decision](../../decisions/2026-11-empty-workspace-offers-the-first-project.md)):
  "No projects yet", "No active projects." with View archives, loading and the failed read with Try again.

### R4 — Paying for the bundle

Initial is **1,139.28 kB** at the plan's start, so the headroom is **10.7 kB**.

- **What goes:** the column is already deferred, so deleting it frees little initial code. The workspace
  shell's column logic (collapse signals, the column focus request, link-selected focus) is initial, estimated
  at **2–3 kB**. The sidebar (12.05 kB in the esbuild metafile) is rewritten, not removed.
- **What comes:** the tree's disclosure, pages and marker (+3–5 kB over today's sidebar), the breadcrumb
  (+1–2 kB), the context and handler registration (+0.5–1 kB), the title strategy (+1 kB), the skip link and
  the header fold (+1 kB). A treeview keyboard (Q4 (b)) adds an estimated 1–2 kB. The popover and dialog stay
  deferred (R2), so they add nothing initial.
- **Estimate:** the items above sum to net **+3.5 to +8 kB** with Q4 (a), ending at 1,143–1,147 kB, and
  **+4.5 to +10 kB** with Q4 (b), up to about 1,149 kB. Q16 (b) adds about 1 kB.
- **The rule:** every web step runs `pnpm --filter web build` and records the figure in the State header. A
  step that would cross 1,150 kB stops with `CHAIN: STOP`. Q12 (a) pre-approves the payment: lazy `/settings`,
  then lazy `/search`, when a step's build would end above 1,148 kB.
- **Fallbacks, measured at step 0** in a temporary build that is then reverted: lazy `/settings` and lazy
  `/search`. Nothing here raises the ceiling.

## Done when

The user has picked an alternative, and the picked tree is the only navigation hierarchy on every route at
every width. Every in-scope finding is closed or explicitly advanced, with the evidence named in the table
under Findings closed. §77's test changes are made. Every core task is at or below its baseline click count.
The sheet has zero gate failures and passes the user's Gate 2. The initial bundle stays under 1,150 kB.

## Do not

- Change the agent connections page beyond its breadcrumb and current marking (slice 8). Rename product words
  beyond Q5's one label (slice 9). Touch TH12 scaffolding.
- Fix the TH13 content layouts (slice 81.1), L7-009, L7-021 (the comb), W1-041 or W4-016 (slice 9 or the comb)
  (Q1 (a)).
- Add a projects index page, routes for nested workstreams, favourites, drag in the tree, or search in it.
- Change any domain, contract, host or MCP behaviour. This slice is web-only.
- Add Angular CDK Tree or a key manager to the initial bundle without measuring it.
- Raise the bundle ceiling.

## Scope check

**A redesign slice under the overhaul protocol, with the §6 extras.** It is the shell layer and changes the
chrome on every route, so every matrix cell is in the sheet. The gate treats the navigation and header regions
as changing and the content regions as fixed, except for the listed content changes (Capture scope). Q1
(a) leaves TH13's six content layouts to a follow-on slice 81.1, keeping the sheet to one review screen.

## Findings closed

**Under Q1 (a), and if Q6 is answered (i): 42 closed and 1 advanced from TH11, TH13 and TH15 (under Q6 (ii), 41 and 2), plus 3 from TH02 and 4 carried
items.** Every id has its evidence: a journey in Acceptance item 4 (J*n*), a component test (T), or a visual
pair (P).

| Finding(s) | Sev | Evidence |
|---|---|---|
| L7-001, W1-015 (two trees) | S2, S3 | J2; P `nested-projects-project` 1440 |
| L7-002, W4-004, W1-046 (current project not marked) | S2, S3, S3 | J1; P `kitchen` 1440 |
| L7-008 (archived current place) | S2 | J8; P `kitchen-archived` |
| L7-020 (root scope inside a workstream) | S3 | J6; P `kitchen` 1440 |
| W1-011 (new workstream looks different) | S3 | J5; T one row component |
| L7-003, W4-005, L6-006 ("Home" twice) | S2 | J1 (names, Archive origin, fallback notice); P `nested-projects-dashboard`, `nested-projects-project` |
| L7-004, W1-016 (breadcrumb) | S3 | J4; P `cabinets` |
| L7-018 (page named once) | S3 | J1; P `todos`. **Closed only under Q6 (i)**; (ii) advances it |
| W1-049 (Archive's two headings) | S3 | T archive page; P `archive` |
| W2-030 (Archive heading and origin path) | S3 | T archived region; P `archive` 375 |
| L7-010, L1-026 (Settings children) | S3 | J1; P `settings-agents` |
| L7-007, W1-055, L1-013 (width at 1024) | S2 | J11 (width, first section in view); P `nested-projects-project` 1024 |
| L7-019 (titles) | S2 | J12 |
| L5-014, W3-001 (skip link) | S2 | J3; P `skip-link-focused` |
| L5-011, W3-009, W1-006, W2-033, W4-026 (one `main`) | S3 | J3; T dashboard |
| L5-015 (heading outline) | S3 | T tree; J3 |
| L7-005, L7-006 (phone) | S2 | J7; P `kitchen` 375 closed and open |
| L1-014 (header at 375) | S2 | J7 (height); P `nested-projects-project` 375 |
| L7-022 (Projects group) | S3 | **Advanced:** per-root disclosures, J9; no index page |
| W1-008, W2-004, W3-010, W4-029 (Parent default) | S2, S3 | J5; P `add-workstream-kitchen` |
| W1-014, W2-007 (new workstream opens) | S3 | J5 |
| W1-044, W2-026, W4-017 (page settings) | S2 | J6; P `page-settings-open` 1440 and 375 |
| L5-008, L2-012 (marker by hue only; unequal) — TH02, deferred by Slice 71 | S2, S3 | J1 (forced colours); P light and dark |
| L5-017 (forced colours) — **advanced**, navigation half only | S2 | J1 forced colours |
| Carried: L1-006 (header edge), L2-016 (group headings), `note-2026-10-15-004`, comb item 1 | — | P `nested-projects-project`; T tree; P `archive` 375; J8 |

**Not closed here (Q1 (a)):** L7-009 and L7-021 (concepts: the comb re-judges them); L1-004, L1-018, W2-015,
W2-022, W2-028, L5-018 (TH13 content layouts: slice 81.1); W1-041, W4-016 (TH15's shortcut half: slice 9 or
the comb). W1-026, W3-012, W2-009 and W4-008 closed in Slices 74–75.

Step 0 re-checks every in-scope finding against the baseline. One that no longer reproduces is listed as
"closed earlier" with its evidence, not claimed.

**Step 0's re-check (2026-11-10, against the `1a0fb0d` capture and source):** every id in the table still
reproduces, so none is "closed earlier". Four reproduce only in part, and the slice claims only the part that
remains:
- **L2-012:** the light theme's current item now has a visible fill, matching dark (`nested-projects-dashboard`
  light and dark 1440). What remains is the marker's absence on project pages and Settings sub-pages
  (`sidebar.html:113-115`'s `exact: true`), which L7-002 and L7-010 also carry.
- **L2-016:** `--font-weight-medium` now exists (`_tokens.scss:102`). The two columns' group headings still
  differ in weight and colour.
- **L1-006:** the 142 px gap between a section's title and body has gone. Three left edges remain at 1440
  (header text about 559, section title 529, body 505).
- **`note-2026-10-15-004`:** the Archive origin path no longer links "Home"; its "Work canvas" link still grows
  to 44 px on touch inside the sentence.
W1-055 was checked at 1024 on the root, not on Kitchen; the cause (the column's width) is the same, and J11
checks the root's first page.

## Acceptance check

Run in this order on the slice's final commit. **(pick)** items are made exact at step 3.

1. `pnpm test`, then `pnpm lint` (which runs `pnpm docs:check`), never concurrently with the root docs tests.
2. `pnpm --filter web build`: initial total under 1,150 kB, and `git diff 14ea6ec -- apps/web/angular.json`
   is empty.
3. `pnpm --filter @cwm/e2e exec playwright test navigation-tree.spec.ts phone-layout.spec.ts work-navigation.spec.ts web.spec.ts lifts.spec.ts page-history.spec.ts project-creation-history.spec.ts project-history.spec.ts canvas-editing.spec.ts placement.spec.ts states.spec.ts empty-archived-editing.spec.ts cascading-archive.spec.ts archived-projects.spec.ts feedback.spec.ts mcp.spec.ts task-lifts.spec.ts primitives.spec.ts`
   passes, and one full `pnpm e2e` passes. The Outcome says if anything was not re-run after a later fix.
4. **`apps/e2e/navigation-tree.spec.ts`**, on `nested-projects` unless named; each journey reseeds. All at
   1440 with a mouse; J1, J4, J5, J6, J7 and J8 again at 375 by touch; J3, J5, J6 and J9 by keyboard alone.
   1. **(pick) One current item.** On `/app`, `/calendar`, `/search`, `/settings`, `/settings/agents`,
      `/settings/archived-projects`, the root's first page, Todos, Archive, Reflections, Kitchen, Cabinets,
      Legacy attic and Legacy shelving: exactly one element inside the tree's landmark has `aria-current="page"`. Its name,
      less an "Archived" mark, equals the page's `h1` per Q5 and Q6 and is contained in `document.title`.
      Under `forcedColors: 'active'`, the current item's computed outline, border or bar differs from its
      neighbour's. Under Q5 (d), root Archive's origin links and a disabled page's fallback notice do not call
      the root's first page "Home".
   2. **One tree.** On Kitchen, the tree's landmark has exactly one link to `/projects/project-kitchen` and
      the page has no control named "Show project navigation".
   3. **Skip link, landmarks, outline.** From a fresh load of Cabinets, the first Tab focuses "Skip to
      content" and Enter moves focus into `main`. Every route in J1 has one `main`, and the first heading in
      document order is the `h1`.
   4. **Breadcrumb.** Cabinets shows "Home renovation › Kitchen › Cabinets"; the last item is current text;
      Kitchen's link opens Kitchen; on `/settings/agents` it shows "Settings › AI & Agents".
   5. **Add workstream.** From the tree's "Add workstream" control while on Kitchen **(pick)**, Parent is preselected "Kitchen"; on
      a root page it is "Home renovation"; on Legacy shelving it is "Home renovation" (Q15 (a): the nearest eligible ancestor, here the root). Create "Pantry": the
      URL becomes Pantry's, its `h1` has focus, the tree shows Pantry under Kitchen, current, with the same
      row shape as Cabinets; the toast says "Created Pantry under Kitchen." with Undo. Undo from the toast (Q13 (b)):
      the URL becomes Kitchen's, Kitchen's `h1` has focus, Pantry is gone from the tree, and the toast says
      "Undone: Created “Pantry”." with "Open Pantry to redo", which opens Pantry's "Creation undone" with Redo;
      after the toast has gone, Back from Kitchen reaches the same page.
      Escape from the dialog returns focus to the control at 1440
      and to Menu at 375 (R2). A refused create (host fault) keeps the dialog, the draft and focus.
   6. **Page settings.** The tree's control is named "Pages of Home renovation…" and, per Q7, More holds it
      on Kitchen. Enabling Reflections adds it **(pick: under the root, or in C's tab row)**; Escape returns
      focus to the opener. At 375, opening it from the drawer closes the drawer, and closing it returns focus
      to Menu.
   7. **Phone.** At 375 there is one navigation control, Menu. With it closed, Cabinets's breadcrumb shows the
      path and the header's height is at most 203 px. Opening it shows the tree with Cabinets current and in
      view. Choosing Garden closes it and focuses `main`. Escape returns focus to Menu. A resize to 1440
      closes it.
   8. **Archived (Q11).** Legacy attic is current and marked "Archived"; Legacy shelving, while current, is shown
      as Q11 says; leaving either removes it from the tree; Home renovation's group has no "No workstreams yet".
   9. **(pick, Q4) Keyboard and disclosure.** (a) Tab reaches each link and expand button in order; Enter or
      Space toggles a root; a root opened by hand stays open after navigating elsewhere. (b) One Tab stop;
      arrows, Home, End, Right and Left.
   10. **Deep tree.** Five nested workstreams created through the host API under Cabinets: the deepest is
       current, its ancestors are expanded, indentation stops at the fourth level, and the breadcrumb names
       all eight levels.
   11. **Width.** On the root's first page at 1024×768, the tree's landmark is at most 256 px wide, the first
       section frame's top is inside the viewport, and the tree stays in view while `main` scrolls.
   12. **Titles.** `document.title` for Cabinets, root Todos, `/settings/agents` and an unknown project id
       equals Q6's format.
5. `apps/e2e/phone-layout.spec.ts` keeps every drawer rule of the phone decision (trap, Escape, Close,
   backdrop, inert, resize, a failed create reopening the form); only its column cases change.
6. The core-task scripts (`apps/e2e/ux/tasks.ts`, T01–T12) run on the "after" build with no task above its
   baseline click count and no dead end. Each script takes before/after locators, keyed on `UX_BEFORE` directly as
   `cascading-archive-verification.ts:17` does, not on `legacyBefore`, which `UX_OBJECTS=1` always makes false
   (`tasks.ts:19`, `capture.ts:18`) (T08 and the `page-settings`
   state name the gear "Project page settings for Home renovation", `tasks.ts:117`, `capture.ts:34`), and
   T02's "Choose Kitchen as parent" step is skipped, at zero clicks, when Parent already shows Kitchen, so T02
   drops by one click on the "after" build.
7. The sheet (Capture scope) has zero gate failures and goes to the user for **Gate 2**.
8. **Real use** after Gate 2: `nested-projects` and `busy-week` at 1440 mouse, 1440 keyboard and 375 touch,
   with notes in `.prototype/notes.json` under slice 81. One MCP `create_project` under Kitchen checks that the
   tree refreshes from a live frame.

## Capture scope

Rig: `apps/e2e/ux/slice81.config.ts` on ports 4257 and 4357 (never 4200 or 4310; no other rig runs at the
same time), `.prototype/ux-slice81.json`, a baseline build at the accepted plan's commit in
`apps/e2e/ux-output/slice81-baseline-web/`, and `build-sheet.mjs --profile 81`. At most two browser jobs;
`route.fallback()` in routes, never `route.continue()`. The shared capture steps that open the column
(`ux/capture.ts:25`, `ux/tasks.ts:64`) already skip when the control is absent; the locators that name the gear
or "Add workstream" get before/after alternatives (Acceptance item 6).

**Must change (light and dark, at every width the matrix has):** the navigation region of every matrix cell,
and the header region of each project cell (profile 81 applies the header rule only to cells that have a
project header: not calendar, search, Settings, `/prototype/*` or `not-a-route`). **(pick)** fixes the region
selectors.

**Runtime contexts** in `ux/navigation-tree-verification.ts` (light at 1440, dark at 375), captured on both
builds unless marked after-only: `kitchen`, `cabinets`, `kitchen-menu-open` (375),
`add-workstream-kitchen`, `page-settings-open`, `legacy-shelving`, `forced-colours-kitchen`; after-only:
`deep-tree`, `skip-link-focused` (no skip link exists before). Matrix cells used as pairs: `nested-projects-project` (1440, 1024, 375), `todos`, `archive`,
`settings-agents`, `nested-projects-dashboard`, `kitchen-archived` (Legacy attic), `kitchen-page-settings`,
`kitchen-work-create`, `phone-menu`.

**Core tasks and runtime contexts.** As in Slices 77–80, the config sets `UX_OBJECTS=1`, so `capture.ts` skips
its legacy "core task baseline" (`capture.ts:169`; without the flag `legacyBefore` turns on, `tasks.ts:19`), and
the slice's verification file runs `runCoreTasks` (as `objects-verification.ts:167` does). Step 0 creates
`navigation-tree-verification.ts` with only that core-task test, and `testMatch` is `['capture.ts',
'navigation-tree-verification.ts']`. Step 13 adds the runtime contexts to the same file and runs them once with
`UX_BEFORE=1` against the baseline kept from step 0, then without it. That before run's core-task counts must
equal step 0's; a difference is a rig fault to fix, not a new baseline.

**`kitchen-collapsed`** clicks the first `button(/^Collapse /)` (`capture.ts:48`), a section's collapse. The
tree's disclosure buttons must not match it: their names are "Show/Hide … pages and workstreams", and the locator
is scoped to `main` on both builds.

**Census exceptions:** profile 81 retires `build-sheet.mjs:58`'s `project-nav__breadcrumb` exception (owned by
slice 7) and adds exceptions only as Q14 decides.

**Must not change:** the content region of every cell (below the header), compared by the profile's DOM census
(roles, names, text) rather than pixels, because the freed width reflows it, **except these expected census
differences:** the dashboard's `main` → `section`; Archive's nested heading and region; the Archive origin
path; Todos's "What is coming up"; the page `h1`s that Q6 changes; and the labels Q5 changes. Also unchanged:
the Design Lab panels other than `navigation` and the new breadcrumb specimen; every dialog, toast and lift that
is not navigation's.

## Visual acceptance

| Pair | What it shows |
|---|---|
| `nested-projects-project` 1440 before/after | Two trees → one, with the root's pages; header edge aligned (L7-001, L1-006) |
| `kitchen` 1440 | Kitchen marked; root-page scope labelled (L7-002, L7-020) |
| `cabinets` 1440 | Breadcrumb ending at Cabinets above the `h1` (L7-004) |
| `todos` 1440 | The page named once (L7-018) |
| `archive` 1440 and 375 | One Archive heading; origin path readable (W1-049, W2-030) |
| `nested-projects-project` 1024 | Content takes most of the width; first section in view (L7-007, L1-013) |
| `kitchen` 375 and `kitchen-menu-open` 375 | One pattern; current place visible closed (L7-005, L7-006) |
| `nested-projects-project` 375 | Header within a quarter of the screen (L1-014) |
| `settings-agents` 1440 | Settings child marked, breadcrumb back (L7-010) |
| `kitchen-archived`, `legacy-shelving` | Q11's archived cases (L7-008) |
| `nested-projects-dashboard` 1440 light and dark | "Home" per Q5; the same marker in both themes (L7-003, L2-012) |
| `forced-colours-kitchen` | Current item distinct (L5-008, L5-017) |
| `add-workstream-kitchen` | Parent "Kitchen" (W1-008) |
| `page-settings-open` 1440 and 375 | Labelled control naming the root (W1-044, W2-026) |
| `skip-link-focused` | The skip link on focus (L5-014) |

## Behaviour vs. appearance

**Behaviour changes**; this is an intent change under §77.

**Tests that change with intent** (in the step that changes the behaviour):
- `core/shell/sidebar/sidebar.spec.ts` (23): the Projects-tree cases move to the tree's; the create form,
  loading, failure and empty cases stay.
- `core/shell/app-shell.spec.ts` (30): drawer cases stay; skip link, context input and handler cases added.
- `features/projects/project-page-navigation.spec.ts` (20): deleted with the component; gear cases move to
  `page-settings-popover.spec.ts`, tab cases to the tree's spec.
- `features/projects/project-workspace-shell.spec.ts` (79): column collapse and column focus cases deleted;
  context publication, handler, `ArchiveFocusRequest`, deferred-lift and create-then-navigate cases added.
- `features/projects/work-create-dialog.spec.ts` (8): the root default becomes the open-workstream default.
- `features/projects/project-workspace-store.spec.ts` (77): `createWorkstream` returns the new id.
- `app.routes.spec.ts` (4): titles and the alternatives route (added at step 1, removed at step 3).
- `apps/e2e/phone-layout.spec.ts:228` (gear and Work in the column) and `:323` (column re-collapse).
- `apps/e2e/work-navigation.spec.ts`: all four; "Work plus creates once without navigation" reverses.
- Locators only (the journeys' intent is unchanged; each is fixed in the step that breaks it): `web.spec.ts`,
  `page-history.spec.ts`, `project-creation-history.spec.ts`, `lifts.spec.ts`, `canvas-editing.spec.ts`,
  `project-history.spec.ts`, `placement.spec.ts`, `states.spec.ts`, `empty-archived-editing.spec.ts`,
  `primitives.spec.ts`, `cascading-archive.spec.ts`, `archived-projects.spec.ts`, `feedback.spec.ts`,
  `mcp.spec.ts`, `task-lifts.spec.ts`. New locators are role-based.
- Stories and Lab: `sidebar.stories.ts`, `project-page-navigation.stories.ts` (deleted),
  `work-create-dialog.stories.ts`, the Lab's `navigation` panel (`live-panels.html` and `.ts`).

**Must stay green untouched:** every domain, contract, host and MCP test; the four acceptance scripts; the
canvas, section, task and dashboard component specs except the dashboard's landmark and Q5/Q6's labels.

**Earlier evidence tools:** `apps/e2e/ux/*-verification.ts` for Slices 73–80 locate the column. They run only
under their own configs, not in `pnpm test` or `pnpm e2e`, and stay as their frozen records' tools with a
one-line header note each.

## File-level change list

Paths marked **(pick)** are confirmed or renamed at step 3.

### Steps 1–2 — alternatives (deleted at step 3)

| File | Change | Responsibility |
|---|---|---|
| `apps/web/src/app/prototype/navigation-alternatives/navigation-alternatives-page.ts`, `.html`, `.scss` | create | Lazy page: full-viewport layer, `at` and `keys`, stand-in workspace |
| `apps/web/src/app/prototype/navigation-alternatives/option-a.*`, `option-b.*`, `option-c.*` | create | The three specimens |
| `apps/web/src/app/prototype/navigation-alternatives/navigation-alternatives-page.spec.ts` | create | One smoke case per option: renders, one current item |
| `apps/web/src/app/prototype/navigation-alternatives/specimen-model.ts`, `specimen-tree.*` | create (step 1) | The shared data and the row renderer for both keyboard models |
| `docs/architecture/web/prototype-tooling/what.md` | modify | The specimens' row while they exist |
| `apps/web/src/app/app.routes.ts`, `app.routes.spec.ts` | modify | `/prototype/navigation/:option`, `loadComponent`; the doc comment counting `prototype/*` routes |
| `apps/e2e/ux/navigation-alternatives.ts`, `apps/e2e/ux/slice81-alternatives.config.ts` | create | Captures and measurements |
| `docs/roadmap/70-ui-ux/tooling/build-navigation-alternatives.mjs` | create | The comparison sheet |
| `docs/roadmap/70-ui-ux/alternatives/slice81-navigation.md` | create | Committed summary and recommendation |
| `docs/architecture/web/prototype-tooling/{overview,how}.md` | modify | The route while it exists, then its removal |

### Core

| File | Change | Responsibility |
|---|---|---|
| `apps/web/src/app/core/shell/navigation-context.ts` (+ `.spec.ts`) | create | R2's keyed project place and handler registration |
| `apps/web/src/app/core/shell/sidebar/sidebar.ts`, `.html`, `.scss`, `.spec.ts`, `.stories.ts` **(pick)** | modify | The one tree: destinations, roots, pages, workstreams, settings children, marker, disclosures |
| `apps/web/src/app/core/shell/sidebar/project-tree-item.ts`, `.scss` **(pick)** | modify or replace | One row for every workstream; depth cap; archived marks |
| `apps/web/src/app/core/shell/root-pages.ts` (+ `.spec.ts`) | create only if Q16 (b) | On-demand page records for an opened non-current root, refreshed on its `project.page_*` frames |
| `apps/web/src/app/core/shell/shell-commands.ts`, `shell-store.ts` (+ specs) | modify | `refresh()` made public; `SHELL_COMMANDS.refreshProjects()` calls it |
| `apps/web/src/app/core/shell/app-shell.ts`, `.html`, `.scss`, `.spec.ts` | modify | Skip link; context input and handler calls; drawer closes before a lift; current item in view; lift tokens on the drawer |
| `apps/web/src/app/core/shell/top-bar/top-bar.*` | modify only if Q9 (b) | Current place beside Menu |
| `apps/web/src/app/core/navigation/document-title.ts` (+ spec) | create | `TitleStrategy` per Q6 |
| `apps/web/src/app/app.config.ts` | modify | Provide the `TitleStrategy` (no adapter change) |
| `apps/web/src/app/app.routes.ts`, `app.routes.spec.ts` | modify | Route `title` data |

### Shared

| File | Change | Responsibility |
|---|---|---|
| `apps/web/src/app/shared/components/breadcrumb/breadcrumb.ts`, `.html`, `.scss`, `.spec.ts`, `.stories.ts` | create | The breadcrumb and its inline links |
| `apps/web/src/app/prototype/design-lab/panels/live-panels.html`, `.ts` | modify | Tree states and the breadcrumb specimen |

### Features

| File | Change | Responsibility |
|---|---|---|
| `features/projects/project-workspace-shell.ts`, `.html`, `.scss`, `.spec.ts` | modify | Publish the context; register handlers; deferred popover and dialog hosts with `@error`; `closeWorkCreate` takes the opener; create → refresh → navigate → focus; the create's toast after the navigation and its Undo's return to the parent (Q13 (b)); delete the column and its collapse; `ArchiveFocusRequest` |
| `features/projects/project-page-navigation.ts`, `.html`, `.scss`, `.spec.ts`, `.stories.ts` | delete | The column |
| `features/projects/project-work-item.ts`, `.scss` | delete | The column's work row |
| `features/projects/page-settings-popover.ts`, `.html`, `.scss`, `.spec.ts` | create | The gear's popover, anchored to a given opener |
| `features/projects/work-create-dialog.ts`, `.html`, `.spec.ts`, `.stories.ts` | modify | Parent default from the open workstream; an ineligible one defaults to its nearest eligible ancestor (Q15 (a)) |
| `features/projects/project-workspace-store.ts`, `.spec.ts` | modify | `createWorkstream` returns the new id |
| `features/projects/history/project-history-store.ts` (+ spec), `core/history/receipt-undo.ts` | modify (Q13 (b)) | Mark a committed receipt Undo, which today is told from a stale one only by its message (both are `tone: 'status'`, `undoReceipt`): an optional field on `ReceiptUndoResult` |
| `features/projects/history/history-feedback.ts` (+ spec) | modify (Q13 (b)) | "Created Pantry under Kitchen." |
| `core/history/receipt-toast.ts` (+ spec) | modify only as the landing's focus needs (Q13 (b)) | `undo` resolves with its result, or leaves focus to the landing instead of the toast's Dismiss |
| `features/projects/project-header.ts`, `.html`, `.scss`, `.spec.ts` | modify | Breadcrumb slot; phone fold (Q10); left edge (L1-006); C's tab row if picked |
| `features/projects/project-more-menu.ts` (+ spec) | modify | "Pages…" (Q7 (a) or (b)) |
| `features/projects/pages/todos-page.html`, `reflections-page.html`, `archive-page.html`, `archive-page.ts` | modify | Page `h1`s per Q6; Todos's second heading; Archive's single heading |
| `features/projects/archived-region/archived-region.html`, `.ts` (+ spec) | modify | One region; origin path with breadcrumb links |
| `features/projects/project-page-registry.ts`, `shortcuts/shortcut-frame.ts`, fallback notice | modify only if Q5 renames | The page label everywhere it is hard-coded |
| `features/dashboard/dashboard-page.html` (+ spec) | modify | `main` → `section` |
| `features/settings/settings-page.ts`, `agents/agent-connections-page.*`, `archived-projects/archived-projects-page.*` | modify | Breadcrumb "Settings › …" |

### E2E and evidence

| File | Change | Responsibility |
|---|---|---|
| `apps/e2e/navigation-tree.spec.ts` | create | Acceptance item 4 |
| `apps/e2e/phone-layout.spec.ts`, `work-navigation.spec.ts` | modify | §77 rewrites |
| `apps/e2e/project-creation-history.spec.ts` | modify (step 7) | §77: the workstream half creates and lands on the new workstream; its toast assertion (`:101`) becomes "Created Field study under …", and the `[data-toast-open]` click and URL wait (`:103-105`) go, since the create already lands there; the header's Undo still lands on "Creation undone"; the root half is unchanged |
| The fifteen specs under Behaviour vs. appearance | modify | Locators |
| `apps/e2e/ux/capture.ts`, `ux/tasks.ts` | modify | Before/after locators for the gear and Add workstream; T02 skips choosing a parent already chosen |
| `apps/e2e/ux/slice81.config.ts`, `ux/navigation-tree-verification.ts` | create | Rig and runtime contexts |
| `apps/e2e/ux/*-verification.ts` (73–80) | modify | One-line frozen-tool header note |
| `docs/roadmap/70-ui-ux/tooling/build-sheet.mjs`, `build-sheet.test.mjs` | modify | Profile 81: region rules, content census exceptions, the retired `project-nav__breadcrumb` exception |

### Documentation (in the step that changes the behaviour; step 13 sweeps)

| File | Change |
|---|---|
| Spec §23, §26 | The picked tree; breadcrumbs, titles, skip link, phone, Add workstream; §26's header rule if Q6 (i) |
| `docs/decisions/2026-10-one-navigation-tree.md` | Amendment: the pick and the answers to Q4–Q11, Q14 and Q16 |
| Dated amendments: `2026-09-phone-navigation-drawer.md`, `2026-09-where-the-project-navigation-column-lives.md`, `2026-09-project-navigation-gear-and-work-create.md`, `2026-09-optional-page-management-lives-in-project-navigation.md`, `2026-10-creation-defaults-follow-the-open-work.md`, `2026-10-route-focus-lands-lost-focus.md`, `2026-09-project-header-history-controls.md`, `2026-11-empty-workspace-offers-the-first-project.md` | What changed for each |
| TH11's other reopened entries: `2026-09-reactivating-under-an-archived-ancestor.md`, `2026-09-actionable-archive-and-archived-projects.md`, `2026-09-project-workspaces-and-subproject-work-units.md` | An amendment where this slice changes them (Q11, origin path); otherwise a note that they stay as written |
| New: `2026-11-navigation-reads-project-place-from-a-context.md` (R2), `2026-11-document-titles-and-skip-link.md` (Q6, R3), `2026-11-undoing-a-new-workstream-returns-to-its-parent.md` (Q13 (b), written at step 7), and one for Q5 if a label changes | §78 entries |
| Dated amendment (step 7): `2026-09-project-creation-history.md` | The toast's Undo of a new workstream now leaves its URL for the parent; recovery at the URL (Redo) is unchanged and reached by the toast's link |
| `docs/decisions/README.md` | Index |
| `docs/architecture/web/{overview,why,what,how}.md`, `web/core/*`, `web/projects/*`, `web/dashboard/how.md`, `web/prototype-tooling/*`, `testing/{what,how}.md` | What is now true |
| `docs/guides/first-milestone-walkthrough.md`, `README.md` | Where they name the column or the gear |
| `docs/roadmap/active/70-ui-ux-overhaul.md`, `docs/roadmap/goals.md` | Handoff; comb item 1 closed; slice 81.1 queued (Q1 (a)) |

## Implementation sequence

One fresh session per step. **"Green" at the end of a step** means `pnpm test`, `pnpm lint`, and every e2e
spec the step touched or broke, fixed in that step. Each step commits, updates the State header and records
the bundle after any web change.

0. **Rig and "before"** (Q1, Q2, Q3, Q12, Q13 and Q15 answered on 2026-11-09): `slice81.config.ts`, copied from
   `slice80.config.ts` with its ports, `.prototype/ux-slice81.json` and `UX_BEFORE` serving
   `apps/e2e/ux-output/slice81-baseline-web/browser`; the baseline is built in a temporary `git worktree` at the
   accepted plan's commit (`pnpm install --offline`, `pnpm --filter web build`), its `dist/web/browser` copied
   there and the worktree removed; `UX_OBJECTS=1` and the `testMatch` from Capture scope; the before/after
   locators in `capture.ts` and `tasks.ts` (Acceptance item 6); `navigation-tree-verification.ts` with its
   core-task test; the "before" matrix and the core-task counts. `slice81-alternatives.config.ts` (step 2) uses
   `.prototype/ux-slice81-alternatives.json`. Re-check each in-scope finding against the baseline. Measure lazy `/settings` and lazy
   `/search` (Q12 (a)'s pre-approved payment) in a temporary build, then revert it.
1. **Alternatives: specimens.** R1's route, options A–C, both keyboard models, Q16's options for a non-current
   root, the `showPopover({ source })` probe, the smoke spec. Verify the
   initial bundle is unchanged.
2. **Alternatives: captures and sheet.** Capture, build the sheet, write the summary and its recommendation.
   **End with `CHAIN: STOP`.** The user picks and answers Q4–Q11, Q14 and Q16.
3. **Firm up the plan.** Record the pick and answers (decision amendments). Rewrite J1, J6 and the page-settings rows if C is picked. Make every **(pick)** item and steps
   4–15 exact. Review the changed plan until a round has no substantive findings (AGENTS.md step 2). Delete the
   alternatives route and files.
4. **Context and current place** (tests first): `navigation-context`, handler registration, `AppShell`'s input;
   the tree's data model, pages under the root (pick), settings children, the marker in both themes and forced
   colours. The column still exists; the tree uses its own data attributes, so the column's data-attribute
   locators do not collide, and any role-based locator that now matches twice is scoped in this step.
5. **Tree interaction** (tests first): disclosures, the keyboard model, depth cap, archived cases, sticky
   scrolling, Lab panel and stories.
6. **Lifts move** (tests first): the deferred popover and dialog hosts with `@error`, opened by handlers from
   the tree and More; anchoring, `aria-expanded` and focus return; from the drawer. The column's gear and plus
   are removed in this step, so there is one popover id; `phone-layout.spec.ts:228` and `work-navigation.spec.ts`'s
   gear case move to the tree's controls here.
7. **Create opens the workstream** (tests first): Parent default (Q15 (a)); `refreshProjects`; navigate and
   focus; Q13 (b)'s toast and the toast Undo's return to the parent; rewrite `work-navigation.spec.ts` and the
   workstream half of `project-creation-history.spec.ts`; the decision entry
   `2026-11-undoing-a-new-workstream-returns-to-its-parent.md` and the creation-history amendment.
8. **The column goes** (tests first): delete the column, its pages and work tree, collapse and focus request;
   `ArchiveFocusRequest`; the redirect focus case; rewrite `phone-layout.spec.ts:323` to its new intent (a
   chosen tree link closes the drawer and focuses `main`); fix every locator the deletion breaks.
9. **The phone pattern** (tests first): the drawer's current item in view, lift tokens on the drawer, Q9's
   answer; the phone journeys.
10. **Breadcrumb and header** (tests first): the component, story and Lab specimen; the header, Settings
    children and the Archive origin path; Q14's touch size; the phone fold; the header's edge.
11. **Titles, skip link, landmarks and headings** (tests first): `TitleStrategy` and its effect; skip link;
    dashboard `main`; Archive's heading; Q5's label and Q6's `h1`s.
12. **Journeys**: `navigation-tree.spec.ts`; the full `pnpm e2e`.
13. **Docs sweep and sheet**: spec, decisions, architecture, guides, README, `pnpm docs:check`; profile 81, the
    verification contexts, the "after" capture and core-task counts, zero gate failures.
14. **Review**: diff reviews (correctness, spec, boundaries, acceptance, docs), fixes, re-capture. **Stop for
    Gate 2.**
15. **After Gate 2**: real use (Acceptance item 8), Outcome, `roadmap.mjs complete`, the umbrella's handoff.

## Test plan — tests first

Steps 4–11 write these first and watch each fail for the right reason. **(pick)** cases are firmed at step 3.

| Test | Proves |
|---|---|
| `navigation-context.spec.ts`: a new shell for the same root replaces the place without an empty frame; a `NavigationEnd` outside `/projects/` clears it | No flicker across the two route configs |
| `navigation-context.spec.ts`: a handler registered then disposed is not called; a re-created shell's handler is the one called, once | No replayed commands |
| `navigation-context.spec.ts`: a failed or not-found load clears the root's pages and current | Unavailable projects mark nothing |
| `sidebar.spec.ts`: exactly one `aria-current` per place (dashboard, settings child, root page, workstream, archived) | One current item |
| `sidebar.spec.ts`: the current marker is a shape token in both themes | L5-008, L2-012 |
| `sidebar.spec.ts`: with `nestedProjects` off, workstreams no longer appear as top-level rows (a behaviour change) | The flag's new meaning |
| `sidebar.spec.ts`: Archive listed while current and hidden; a kind with no renderer not listed | Slice 74 and §23 rules |
| `sidebar.spec.ts`: current root expands; a root opened by hand stays open across a place change | Disclosures (L7-022) |
| `sidebar.spec.ts`: ancestors of current expanded; depth 6 indents as depth 4 | Deep trees |
| `sidebar.spec.ts`: Q11's archived cases | L7-008 |
| `sidebar.spec.ts`: page settings names the root and Add workstream is described by it; an archived root's Add is focusable with its reason; no triggers without a handler | Scope labels; unavailable rule |
| `sidebar.spec.ts`: no heading in the tree precedes or outranks the page's `h1`; empty, archived-only, loading and failed states keep their words | L5-015; the empty-workspace decision |
| `sidebar.spec.ts`: keyboard model (pick) | Q4 |
| `shell-store.spec.ts`: the now-public `refresh()` re-reads once; `app-shell.spec.ts`: `SHELL_COMMANDS.refreshProjects()` resolves after it | Deterministic freshness |
| `app-shell.spec.ts`: the first focusable is the skip link, and activating it focuses `main` | L5-014 |
| `app-shell.spec.ts`: a tree trigger inside the open drawer closes the drawer, calls the handler with Menu as the return target and no `source`, and focus returns to Menu when the lift closes; tapping Menu while the popover is open dismisses it | Lifts from the drawer |
| `app-shell.spec.ts`: the drawer opens with the current item in view; every earlier drawer case passes | Phone pattern |
| `project-workspace-shell.spec.ts`: publishes pages, current kind and archived states; registers and disposes handlers | R2's writer |
| `project-workspace-shell.spec.ts`: a page-settings request opens the deferred popover with `source` set to the opener; the returned open state drives `aria-expanded`; a second press closes it; Escape returns focus to it; the `@error` state shows Reload page | Gear behaviour carried over |
| `project-workspace-shell.spec.ts`: the dialog's `@defer` shows its `@error` state | Deferred dialog failure |
| `project-workspace-shell.spec.ts`: Open archive still lands on the Archive heading across shell instances (`ArchiveFocusRequest`) | The surviving half |
| `project-workspace-shell.spec.ts`: a tree link to a disabled page that §68 redirects keeps focus on the pressed link at desktop width; the notice shows | Redirect without the column hand-off |
| `work-create-dialog.spec.ts`: Parent defaults to the open workstream; to the root on a root page; to the nearest eligible ancestor when the open workstream is archived or under archived ancestry (Q15 (a); a deeper fixture where that ancestor is not the root) | W1-008, Q15 |
| `project-workspace-store.spec.ts`: `createWorkstream` returns the new id; a refusal keeps the draft | Create path |
| `project-workspace-shell.spec.ts`: after create, awaits `refreshProjects`, navigates and focuses the new `h1`; a failed refresh still navigates | W2-007 |
| `project-workspace-shell.spec.ts`: after a workstream create and the navigation, the toast says "Created Pantry under Kitchen.", its Undo becomes ready once Pantry's history is read, and it has no "Open Pantry" link | Q13 (b) |
| `project-workspace-shell.spec.ts`: a toast Undo that commits navigates to Kitchen (a push, not `replaceUrl`), focuses Kitchen's `h1[data-project-name]` whether or not focus was in the toast, and shows "Undone: Created “Pantry”." with "Open Pantry to redo" and no Undo; with the root as Parent it lands on the root's `/projects/:id` and its `h1` | Q13 (b) |
| `project-workspace-shell.spec.ts`: the create shows no cross-owner "Created “Pantry”." toast before it navigates; after the landing, Back returns to Pantry's URL and its "Creation undone" with Redo | Q13 (b) |
| `project-workspace-shell.spec.ts`: a stale ("That is no longer the latest change in Pantry."), gone ("That change can no longer be undone.") or refused toast Undo stays on Pantry with today's toast; an Undo that lands after the route left Pantry navigates nothing; the header's Undo on Pantry still lands on "Creation undone" | Q13 (b) boundaries |
| `project-history-store.spec.ts` (only if the store changes): `undoReceipt` marks a committed transition and not the stale result | Q13 (b) |
| `breadcrumb.spec.ts`: ancestors as links, current as text with `aria-current`; inline links | L7-004 |
| `archived-region.spec.ts`: one region; the origin path as breadcrumb links | W2-030, W1-049 |
| `project-header.spec.ts`: breadcrumb on a workstream; at narrow width the facts fold behind a disclosure (Q10) | L1-014 |
| `document-title.spec.ts`: a static route, a root page, a workstream, a Settings child, an unavailable project; the title changes when the context publishes after the load and after a rename | L7-019 |
| `dashboard-page.spec.ts`: no nested `main` | L5-011 |
| `project-more-menu.spec.ts`: "Pages…" on root and workstream routes calls the handler with the More button as `source` and `returnFocus` (Q7); the menu closes first | Page settings from More |
| `top-bar.spec.ts`: the current place beside Menu (only if Q9 (b)) | Q9 (b) |
| `sidebar.spec.ts`: an opened non-current root shows what Q16 says, with its loading and failure rows under (b) | Q16 |
| `root-pages.spec.ts` (Q16 (b)): one read per root on first expand; re-read on a `project.page_*` frame for that root; a failure keeps Try again | Q16 (b) |
| `page-settings-popover.spec.ts`: the column spec's gear cases (fixed first page, pending, refusal, retry, Escape) | Behaviour preserved |

Failure and permission paths covered: a failed projects read; a failed or not-found project load; a refused or
failed create; a failed refresh after create; a page-settings write pending, refused or retried; a deferred
lift failing to load; an archived root's unavailable Add; an ineligible open workstream as Parent; a live page
change from another tab (J6 repeats with Reflections enabled through the host API from a second page, and the tree updates from the live frame).

## Boundaries touched

- **Components depend on gateway interfaces.** The tree takes inputs from `AppShell`; the popover and dialog
  keep their store. `app.config.ts` gains a `TitleStrategy` provider, which is not an adapter. The alternatives
  (disposable) inject `ShellStore` and the gateway interface directly and are deleted at step 3.
- **`core/` never depends on `prototype/` or `features/`.** The context is in `core/`, written by the feature
  through handlers it registers.
- **§20, no mega-store.** No page records enter `ShellStore` (R2).
- **Contracts once.** Page kinds come from `packages/contracts`; the context's view type is not a contract.
- **Tokens.** No literal colours, spacing or radii; the token lint covers the new styles, including styles held
  in TypeScript.
- **One prototype flag.** The alternatives route adds no `if (prototypeMode)`.
- **Domain, MCP, repositories, `Clock`:** untouched.

## Explicit non-goals

- The TH13 content layouts (slice 81.1), L7-009, L7-021, W1-041 and W4-016 (Q1 (a)).
- A projects index page, drag in the tree, favourites, or search in the tree.
- New routes for workstreams, or a change to the URL scheme.
- The agent connections card (slice 8) and product vocabulary (slice 9) beyond Q5's label.
- Any comb item other than item 1.
- A tablet-specific layout. The 48rem breakpoint stays.

## Open questions

**Answered on 2026-11-09 (user decision, at acceptance):** Q1 (a), Q2 (a), Q3 (a), Q12 (a), Q13 (b) and Q15 (a);
the user's words were "accept all except for #5 go with option b", #5 being Q13. Each answer is recorded under
its question; the options are kept as they were asked. **Answer at the pick (after step 2):** Q4–Q11, Q14 and Q16,
with the specimens in front of you. The specimens show each recommendation unless the question says otherwise.
Options marked **(amends)** contradict a line of the one-tree decision and would need an amendment.

**1. What does this slice close?**
- *Context.* TH11 (33), TH13 (9) and TH15's Add workstream and gear part (9) are 51 findings. Six of TH13's are
  content layouts, not navigation (dashboard gutters, the Today widget, archive rows, the Markdown editor at
  375, reflow at 320). L7-009 (where archived things go) and L7-021 (history has no place) are concepts, not
  tree shape. W1-041 and W4-016 are TH15's shortcut half, which the brief left out.
- *Options.* (a) Take the navigation and header findings (the table above), plus TH02's three marker findings
  that Slice 71 deferred here; put the six TH13 content layouts in a follow-on slice 81.1; let the comb re-judge
  L7-009 and L7-021; send W1-041 and W4-016 to slice 9 or the comb. (b) Take all of TH13 here. (c) Also take
  L7-009 (add "Archived projects" to the tree) and L7-021.
- *Recommendation.* (a). The protocol asks for a sheet that fits one review screen, and a shell slice already
  changes every cell's navigation.
- *Impact.* (a): 42 closed and 1 advanced, plus 3 TH02 and 4 carried items; slice 81.1 queued before the comb.
  (b): six content regions join the "must change" set and the sheet roughly doubles. (c): two concept designs
  join a shape decision.
- **Answer (user decision, 2026-11-09): (a)**, as recommended. Navigation and header findings only; TH13's six
  content layouts go to a follow-on slice 81.1; L7-009 and L7-021 go to the comb; W1-041 and W4-016 to slice 9
  or the comb.

**2. What form do the alternatives take?**
- *Options.* (a) Live specimens behind a lazy `/prototype/navigation/:option` route over the real seeds, with a
  stand-in workspace (R1). (b) Static HTML mockups, like Gate 1. (c) Storybook stories with fixture data.
- *Recommendation.* (a). You can use the keyboard and touch in each, see real depth, and the code is lazy and
  disposable.
- *Impact.* (a): two sessions (steps 1–2). (b): one session, but the keyboard models and real depth cannot be
  tried. (c): similar cost to (a), but Storybook has no shell, so the phone pattern cannot be shown.
- **Answer (user decision, 2026-11-09): (a)**, as recommended. Live specimens over the real seeds.

**3. Which alternatives are built?**
- *Options.* (a) A, B and C as in R1, each with both keyboard models. (b) A and B only, which keeps the decision
  as written. (c) Different options you name.
- *Recommendation.* (a). C **(amends)** three lines of the decision (R1), but L7-018 and L7-020 point at pages beside the
  content, and the decision invites two or three shapes.
- *Impact.* (a): three specimens. (b): about a third less work in steps 1–2. Picking C needs a decision amendment.
- **Answer (user decision, 2026-11-09): (a)**, as recommended. Alternatives A, B and C, each with both keyboard
  models; if C is picked, the one-tree decision gets the amendment R1 describes.

**4. The tree's keyboard model and ARIA pattern.**
- *Options.* (a) Disclosure navigation: nested lists of links, expand buttons with `aria-expanded`, all in the
  Tab order; collapsed roots and the skip link keep Tab counts low. (b) An ARIA treeview (`role="tree"`,
  `treeitem`, `aria-level`, roving tabindex): one Tab stop, arrows, Home, End, type-ahead.
- *Recommendation.* (a). Links stay links (middle click, the screen reader's link list), the code is smaller,
  and it needs no key manager. Every specimen offers both (`keys=`), so you can try each.
- *Impact.* (a): J9 (a). (b): about 1–2 kB more, which puts R4's upper estimate at about 1,149 kB, so Q12's
  payment would very likely be needed; and a harder rewrite of every keyboard journey.

**5. Does "Home" keep its name?**
- *Context.* The workspace dashboard and each root's first page are both "Home" (L7-003, W4-005, L6-006). In one
  tree they would be one row apart, and the seed root is "Home renovation". The page label is hard-coded in at
  least `project-page-registry.ts:57`, `shortcuts/shortcut-frame.ts:130`, `archived-region/archived-region.ts:42`,
  `pages/archive-page.ts:76`, the fallback notice ("Showing Home instead") and restore toasts.
- *Options.* (a) Keep the dashboard "Home"; rename the root's first page "Overview" everywhere the web shows
  it (the `home` page kind in contracts and MCP is unchanged). (b) Rename the dashboard "Dashboard". (c) Keep
  both. (d) No separate row: the root's own row opens its first page, so the tree never says "Home" for it, and
  in-content mentions use the project's name ("Showing Home renovation instead").
- *Recommendation.* (d). It removes the duplicate word from navigation without inventing a new one, and the
  current item's name then equals the root page's `h1` (the project name). It is one label change, kept to
  where this page is named; other vocabulary stays with slice 9.
- *Impact.* (a) or (d): the sites above, their specs, and e2e locators that say "Home" on project pages. (b):
  the sidebar, the dashboard `h1` and their locators. (c): three findings stay open.

**6. Document titles, and the page heading on root pages.**
- *Context.* Every route is "Canvas Work Manager" (L7-019). Every root page's `h1` is the project name, so a
  page is named only by its highlighted tab, and Todos adds "What is coming up" (L7-018). §26 says the header
  "describes the project, not the page".
- *Options.* Title: (a) "Todos · Home renovation · Canvas Work Manager", most specific first; (b) "Home
  renovation – Todos | Canvas Work Manager". Heading: (i) the `h1` names the current item: on the root's
  first page and on a workstream it is the header's project name, as today; on Todos, Archive and Reflections
  the header's project name becomes the breadcrumb's root (no second title line) and the page's own `h1` names
  the page, and §26 is corrected; (ii) the header's `h1` stays the project name and the page name becomes the page's first `h2` **(amends)**
  (the heading would not agree with the current item).
- *Recommendation.* (a) and (i): the tab's name leads and the heading equals the current item (principle 8).
- *Impact.* (i) changes the `h1` on three pages, which several journeys locate by name, and §26's header rule.
  (ii) keeps §26 but leaves L7-018 half open (the page is named, but not by the `h1`).

**7. Where page settings live.**
- *Options.* (a) The labelled control in the tree **and** "Pages…" in More. (b) Only in More **(amends)**. (c)
  Only in the tree.
- *Recommendation.* (a). The findings ask for "where the page is, or in the project's actions menu"; both cost
  one item each.
- *Impact.* (b) hides the setting from the tree it changes; (c) misses the place two auditors looked.

**8. Where Add workstream starts.**
- *Options.* (a) A labelled "Add workstream" row at the end of the current root's workstreams in the tree.
  (b) Only in More **(amends)**. (c) Both.
- *Recommendation.* (a). It is where the result appears, and the dialog states the Parent.
- *Impact.* (c) is one more menu item.

**9. The phone pattern.**
- *Options.* (a) The tree in the existing Menu drawer; the column toggle goes; the breadcrumb shows the current
  place. (b) As (a), plus the current place's name beside Menu in the top bar. (c) A bottom sheet.
- *Recommendation.* (a). It keeps the phone decision's tested focus rules, and the breadcrumb answers L7-005.
- *Impact.* (b): a top-bar change and its spec. (c): a new lift and new focus rules.

**10. The project header at 375.**
- *Context.* It takes about 40 % of the first screen (L1-014): icon, name, description, Status, Progress, Target
  date, history controls and More.
- *Options.* (a) Below 48rem, the description and facts fold behind a "Details" disclosure; name, breadcrumb,
  history and More stay. (b) Facts on one line and the description hidden on phones. (c) No change.
- *Recommendation.* (a). Nothing is lost, and the content starts in the top quarter.
- *Impact.* (a): one disclosure and its spec; the header-history decision gets an amendment. (b): the
  description is unreachable on phones. (c): L1-014 stays open.

**11. Archived work in the tree.**
- *Context.* `ShellStore` reads archived projects but the sidebar filters them out (`shell-store.ts:66`; Slice
  79's rule, "the sidebar lists live projects only"). The domain itself drops only live work under an archived
  ancestor (`project-service.ts:98-112`): in `nested-projects`, Legacy attic (archived) is in the read, and its
  live child Legacy shelving is not, so the tree can show Legacy shelving only while it is current, through the
  context (R2).
- *Options.* (a) Archived items stay out of the tree except while current: then the current item is drawn
  under its real path, its live ancestors as ordinary rows, an archived ancestor as a muted row marked
  "Archived", and the item marked "Archived" if it is; an archived root that is current shows "Archived" and its
  pages. (b) Archived projects are always listed, muted and marked, under their parents (web-only: the read
  already has them); Legacy shelving still appears only while current. (c) While current, the item is only in
  the breadcrumb, and the tree marks its nearest listed ancestor `aria-current="location"` **(amends)**. (d) Never
  in the tree **(amends)** (both break "exactly one current item is marked").
- *Recommendation.* (a). It mirrors "Archive is listed while current", keeps Slice 79's rule and one current
  item, and shows the real path.
- *Impact.* (a): the tree renders rows from the context as well as from `ShellStore` (J8; the `legacy-shelving`
  and `kitchen-archived` pairs). (b): reverses Slice 79's rule, lengthens the tree on agent-heavy, and advances
  L7-009. (c): the current item is not in the tree. (d): L7-008 stays open.

**12. What pays for the bundle?**
- *Context.* 10.7 kB of headroom. R4's estimate is +3.5 to +8 kB with Q4 (a); with Q4 (b) and Q16 (b) together
  it reaches about +11 kB, about 1,150.3 kB, over the ceiling. The fallbacks are probably small: the Settings
  page is about 2.5 kB of source and Search about 0.5 kB (step 0 measures them). This is answered before step 0,
  and re-asked at the pick if Q4 (b) and Q16 (b) are both chosen.
- *Options.* (a) Fit within the headroom; pre-approve lazy `/settings`, then lazy `/search`, used when a step's
  build would end above 1,148 kB (a 2 kB margin; at 1,150 kB the step stops regardless). (b) As (a), and also `@defer` the task-details drawer (14.7 kB in the
  metafile), which delays its first open by one chunk load. (c) Raise the ceiling: your call alone; the plan
  never does this.
- *Recommendation.* (a), with Q4 (a). Both routes are rarely the first page, and each is one `loadComponent`
  line. If you prefer Q4 (b) and Q16 (b) together, (b) is the payment that fits.
- *Impact.* (a): the first open of Settings or Search loads a small chunk. (b): a delay on the first task
  selection, and a lift journey to re-check.
- **Answer (user decision, 2026-11-09): (a)**, as recommended. Fit within the headroom; lazy `/settings`, then
  lazy `/search`, are pre-approved when a step's build would end above 1,148 kB. The ceiling stays 1,150 kB. If
  the pick takes Q4 (b) and Q16 (b) together, this question is asked again then.

**13. After creating a workstream and moving to it, what do the toast and Undo do?**
- *Context.* Navigating loads the new workstream's history, which clears the header's feedback
  (`project-history-store.ts:281-294`). The creation is the new workstream's first step, so its Undo removes the
  page being looked at. Creating a root project already navigates; its Undo lands on "Creation undone".
- *Options.* (a) The same as creating a root: the toast says "Created Pantry under Kitchen." with Undo; Undo
  removes it and lands on "Creation undone" with a link to Kitchen. (b) As (a), but Undo returns to Kitchen and
  focuses its heading. (c) No Undo in the toast; Undo is in the new workstream's header only.
- *Recommendation.* (a). W1-014 asks that creating a container behave the same everywhere, and the root's
  behaviour is tested.
- *Impact.* (a): a test for the toast surviving the navigation, possibly a small history-store change. (b): a
  new landing rule for workstreams only. (c): the toast differs from every other create's.
- **Answer (user decision, 2026-11-09): (b)**, not the recommendation. As (a), but Undo returns to the parent and
  focuses its heading. The rule, checked against the code (`project-history-store.ts` `undoReceipt` and
  `startGeneration`, `receipt-toast.ts`, `project-workspace-shell.ts`'s "Creation undone" recovery):
  - *Create* (as (a)): after the refresh and the navigation to Pantry, with focus on Pantry's `h1`, the toast says
    "Created Pantry under Kitchen." with Undo, polite, no link (Pantry is open); the sentence is a new helper in
    `history/history-feedback.ts` beside `crossOwnerFeedback`. The write's own report arrives while Kitchen is
    still shown, and the navigation starts a new history generation, which closes any toast
    (`receipt-toast.ts`'s generation effect). So the create does not announce today's cross-owner "Created
    “Pantry”." with "Open Pantry" before it navigates (its report is marked `feedback: 'own'`, which
    `announceCrossOwner` skips), and the shell shows the new toast after the navigation with the create's report; the receipt is Pantry's own history's first step, so Undo is offered once Pantry's
    history is read (`saving` until then).
  - *Undo from the toast:* when the undo transition **commits** (Pantry is removed), the shell navigates to the
    parent's `/projects/:id` (a push, not `replaceUrl`) and focuses its `h1[data-project-name]`, whether or not
    focus was in the toast (today `ReceiptToast.undo` focuses the toast's Dismiss, and its `close('write')`
    fallback could focus Pantry's recovery heading; the landing overrides both). When the parent is the root, that is the
    root's first page. Both routes are `/projects/:projectId`, so the shell is reused and its history starts a new
    generation; the result is shown after the parent's history is read: "Undone: Created “Pantry”." (today's
    `transitionResultFeedback` words), status tone, no Undo, with the link "Open Pantry to redo". The link opens
    Pantry's URL, where the creator's held Redo shows "Creation undone" with Redo, as the
    [creation-history decision](../../decisions/2026-09-project-creation-history.md) requires. The tree no
    longer lists Pantry once the shell refreshes. The toast closes itself after `TOAST_DISMISS_MS` like every
    status toast, and Kitchen's header Redo does not hold Pantry's creation, so **Back** from Kitchen is the
    lasting way to Redo: it returns to Pantry's URL and its "Creation undone". That is why the landing pushes
    rather than replaces. (A default, AGENTS.md §4, found in the acceptance review; the user may change it at
    the pick: keep this toast open until dismissed, or replace the URL and accept the toast as the only way.)
  - *Not committed:* "That is no longer the latest change in Pantry." is also `tone: 'status'`, so the landing
    keys on the commit, not the tone; it, a refusal or a failure stays on Pantry with today's toast and focus. An
    Undo that lands after the person left Pantry moves nothing (as `restoreFromBanner`).
  - *Unchanged:* the header's Undo on Pantry lands on "Creation undone" at Pantry's URL, with Redo (Slice 42,
    `project-creation-history.spec.ts`). Root creation is unchanged: it navigates without a toast, and its
    header Undo lands on "Creation undone". Only a new workstream's toast Undo leaves the page.
  - *Where:* `project-workspace-shell.ts` owns the create flow, the toast after the navigation and the landing;
    `history/history-feedback.ts` holds the new sentence. `core/history/receipt-undo.ts` gains an optional
    field on `ReceiptUndoResult` that `project-history-store.ts`'s `undoReceipt` sets on a committed transition,
    because otherwise only the message tells a committed Undo from a stale one; `core/history/receipt-toast.ts`
    changes only as far as the landing's focus needs (its `undo` resolving with the result, or skipping its
    Dismiss focus when the landing takes focus). Tests first, at step 7
    (Test plan). Recorded in a new `2026-11-undoing-a-new-workstream-returns-to-its-parent.md` with a dated
    amendment to `2026-09-project-creation-history.md`, both at step 7.

**14. How large are breadcrumb links on touch?**
- *Context.* The umbrella's primitives rule is 44 px targets on touch. Breadcrumb links are short words in a
  row, and the Archive origin path is a sentence. Slice 72 grew those inline links to 44 px, which broke the
  sentence (`note-2026-10-15-004`). WCAG 2.5.8 exempts links inline in running text. The sheet's census already
  carries a "slice 7" exception for the old column breadcrumb (`build-sheet.mjs:58`).
- *Options.* (a) The navigation breadcrumb's links are 44 px tall on touch (the row is 44 px, links padded to it,
  with at least 24 px between them); the Archive origin sentence keeps inline links under WCAG's exception, with
  a named census exception. (b) Both inline, with census exceptions. (c) Both 44 px.
- *Recommendation.* (a). The breadcrumb is navigation and is tapped on phones; the origin path is a sentence.
- *Impact.* (a): the breadcrumb row costs 44 px at 375, inside Q10's quarter-screen budget; one census exception.
  (b): two exceptions and small phone targets. (c): the origin sentence breaks again.

**15. Which Parent does Add workstream default to when the open workstream cannot be one?**
- *Context.* The decided default is the open workstream. The [gear decision](../../decisions/2026-09-project-navigation-gear-and-work-create.md)
  excludes archived projects and anything under archived ancestry as parents. On Legacy shelving (live, under
  archived Legacy attic) the decided default is not offered.
- *Options.* (a) The nearest ancestor that is eligible. (b) The root. (c) No default: Parent starts empty and
  Create waits for a choice.
- *Recommendation.* (a). It stays closest to "where I am". In today's seeds it equals the root; deeper trees differ.
- *Impact.* (a) or (b): one rule and a test each. (c): an extra required choice in a rare case.
- **Answer (user decision, 2026-11-09): (a)**, as recommended. The nearest eligible ancestor. In today's seeds
  (Legacy shelving) that is the root; the dialog spec also covers a deeper fixture where it is not.

**16. What does a root show when it is opened but not current?**
- *Context.* The decision says each root expands to its enabled pages and its workstreams. The tree has a
  root's workstreams for every root (`ShellStore`), but page records only for the current root (R2); the
  `Project` contract carries no pages (`packages/contracts/src/project.ts`), and §20 keeps them out of
  `ShellStore`. This matters in options A and C at `/app` and on `many-roots`.
- *Options.* (a) Workstreams only; the optional pages appear once the root is current; the root's own row still
  opens its first page **(amends)**. (b) Read that root's pages on first expand through the gateway interface,
  in a small core cache keyed by root and refreshed on that root's `project.page_*` live frames
  (`project.page_enabled`, `project.page_disabled` and their undo and redo variants), not in `ShellStore`; a loading row and
  a failure row with Try again. (c) Show the first page and every page kind this build renders, with no
  records, so a disabled page could be advertised **(amends)**, and §23 forbids advertising a page that is not
  enabled.
- *Recommendation.* (b). It keeps the decision as written, and the read happens only when a person opens a
  root.
- *Impact.* (a): no new reads, a decision amendment. (b): about 1 kB of initial code on every route (no reads
  until a root is opened); page records for opened roots live in core, which is the §20 concern R2 avoids for
  `ShellStore`, so the column decision gets an amendment saying why an on-demand cache is different; one file
  (`core/shell/root-pages.ts` and its spec) and two tree states to test. (c): breaks §23's rule.

## Revisions

- **First draft (2026-11-09, S81PLAN):** written from the code, the spec, the findings and the decisions.
- **Round 1 (2026-11-09, two cold reviewers: architecture and tests; spec, scope and questions; 21 substantive,
  10 minor; each checked against the code):**
  - *Architecture (R2):* the context is keyed and replaced, not cleared, because the two project route configs
    re-create the shell. Commands became registered handlers, so nothing replays. The sidebar stays
    presentational, with `AppShell` passing the context in. The popover and dialog need their own `@defer`
    blocks with `@error` states, since only the column was deferred. The popover anchors to the opener it is
    given, and triggers in the phone drawer close it first.
  - *Wrong premise corrected:* `ShellStore` already refreshes on `project.*` frames (`shell-store.ts:154-155`).
    The plan now exposes the existing `refresh()` for ordering instead of adding a reload.
    `ProjectColumnFocusRequest` also carries Open archive's landing, so it splits into `ArchiveFocusRequest`,
    and route-focus takes the §68 hand-off.
  - *New question:* Q13, because the toast and Undo change once creation navigates.
  - *Scope:* Slice 71's TH02 deferral (L5-008, L2-012, and L5-017's navigation half) was missing and is now
    claimed, with a forced-colours check. Slice 73's "drawer as a lift" is answered. `note-2026-10-15-004` and
    W2-030 now close through the Archive origin path, which was misread before. L7-022 is counted as advanced.
  - *Questions:* Q5 gains option (d), now the recommendation because it makes the current item's name equal the root page's `h1`, and the list of hard-coded sites. Q6 names §26's header rule. Q11 covers
    live work under an archived parent and an archived current root. Options that contradict the decision are
    marked (amends).
  - *Alternatives:* the keyboard model is a separate switch on every option. The specimens cover the shell and
    show the skip link. Measurements are replaced with ones that tell the options apart. The `archived-only`,
    `legacy-shelving`, 768 and forced-colours contexts were added.
  - *Evidence:* a finding→evidence table for every id. Expected census differences are listed, so the gate
    cannot fail by construction. Acceptance 4.1 is scoped to the tree's landmark and marked (pick). The depth
    count is corrected to eight. Core-task click counts and sticky width were added.
  - *Change list:* added `capture.ts`, `tasks.ts`, `live-panels.ts`, `route-focus.ts`, the page renderers,
    `archived-region`, the label sites, `shell-commands.ts`, and eight more decision entries.
  - *Steps:* "green" now includes the e2e specs a step breaks. The old steps 4–6 and 9 are re-split into
    4–11, so the column is deleted in the same step as the phone change.

- **Round 2 (2026-11-09, two cold reviewers: architecture and feasibility; spec, scope and questions; 11
  substantive, 13 minor; each checked against the code):**
  - *Data the tree never receives:* the domain hides archived projects and live work under an archived ancestor
    from the projects read, so Q11 is restated against what the shell can show (only while current, from the
    context). The context gains the current project, its ancestors, a missing state and the Add-blocked reason,
    which the tree and the title need.
  - *768 px is the phone pattern:* 48rem includes a 768 px viewport, so the 768 width claims, pairs and
    contexts are gone. The phone decision's stale "768 keeps the inline sidebar" is corrected in its amendment.
  - *Lifts:* the dialog already had its own `@defer`; both lifts now use `when` triggers with `@error`. The
    popover opens with `showPopover({ source })`, and the handler returns its open state for `aria-expanded`.
    From the drawer, `AppShell` passes Menu as the opener, because the hidden drawer's opener is still
    connected but inert. `closeWorkCreate` takes the opener.
  - *Route focus:* `route-focus.ts` has no column logic and does not run after a redirect. The §68 case is
    restated (focus stays on the pressed tree link), and that file leaves the change list.
  - *Titles:* the `TitleStrategy` gains an effect over the context, because the project name arrives after
    navigation and can be renamed live.
  - *Evidence:* Visual pairs now name real matrix cells or runtime contexts captured on both builds. Profile 81
    retires the old breadcrumb census exception. The core-task scripts get before/after locators, and T02's
    drop is defined. J1 checks the Archive origin and fallback notice for L7-003 and L6-006, and J11 checks the
    first section at 1024 for L1-013. L7-018 is closed only under Q6 (i). Acceptance 3 names the four missing
    specs.
  - *New questions:* Q14 (breadcrumb touch size), which a default had assumed; Q15 (Parent when the open
    workstream is ineligible), which a default had guessed.
  - *Consistency:* Option C's current-item and page-settings amendments are stated. Option A's Projects label is
    not a heading. Archived projects stays a Settings child, not L7-009's new destination. The breadcrumb is
    omitted on a root's first page. `nestedProjects` off is named as a behaviour change.
  - *Steps:* step 6 removes the column's gear and plus with the move, so no id is duplicated. The old step 8 is
    split into "the column goes" and "the phone pattern". Step 3 reviews until a round has no substantive
    findings. Steps now run 0–15.

- **Round 3 (2026-11-09, one cold reviewer of the whole plan; 5 substantive, 7 minor; each checked against the
  code):**
  - *Premise corrected again:* `ShellStore` reads archived projects and the web filters them (`shell-store.ts:66`);
    the domain drops only live work under an archived ancestor. R2 and Q11 now say so, and Q11 gains the
    web-only "always listed, muted" option.
  - *Evidence:* the findings table now names the captured matrix cells, not specimen contexts.
    `skip-link-focused` is after-only. The headline count states its Q6 condition.
  - *`kitchen-collapsed`:* the reviewer read it as the column; it is a section's "Collapse …"
    (`capture.ts:48`). The real risk, a tree disclosure matching the same locator, is guarded instead.
  - *Q6 (i)* now states the `h1` on the root's first page and on workstreams.
  - *The drawer:* Menu is the focus-return target, not the popover's `source`, because a source is exempt from
    light dismiss. A test covers it, and step 1 probes `showPopover({ source })` before step 6 uses it.
  - *Consistency:* Q3 says three amendments. Q4's impact carries the bundle risk. Question timing now agrees
    in the State header, the Open questions and step 0, with Q15 before step 0. The documentation sweep is step
    13. Step 0 says how the baseline is built and names the data files.

- **Round 4 (2026-11-09, one cold reviewer; 3 substantive, 6 minor; 18 citations sampled, all holding):**
  - *New question:* Q16. A root that is opened but not current has no page records anywhere: the decision's
    "each root expands to its pages" had no data source.
  - *Fixes:* the dialog row said Q15 (b) as if answered; it now says "per Q15". Q6 (ii) and Q11 (c) and (d) are
    marked (amends). The handler takes `{ source, returnFocus }`, so the drawer case can be expressed. The
    runtime contexts' "before" run is scheduled at step 13, and step 0's `testMatch` is named. R4's sums are
    corrected, with and without Q4 (b). The header rule covers only cells that have a header. Tests were added
    for More's "Pages…", Q9 (b) and Q16. Step 3 is told to rewrite J1 and J6 if C is picked. Two paths are
    corrected.

- **Round 5 (2026-11-09, one cold reviewer; 4 substantive, 3 minor; checked against the code):**
  - *Step 0 could not produce core-task counts:* since Slice 77 the counts come from the slice's verification
    file under `UX_OBJECTS=1`, not from `capture.ts`. Step 0 now creates `navigation-tree-verification.ts`
    with the core-task test and names the `testMatch`.
  - *Bundle:* Q4 (b) with Q16 (b) would reach about 1,150.3 kB. Q12 now says so, with the 2 kB margin, the
    small fallbacks, and that the question is re-asked at the pick if both are chosen.
  - *Add workstream's label:* one default. The visible name is "Add workstream", described by the root,
    because "to Home renovation" would contradict the preselected Kitchen. J5 and the specs follow it.
  - *Q16 (b)'s cost:* its §20 tension, the column-decision amendment, `root-pages.ts` and its spec are now stated.
  - *Minor:* the capture-scope sentence is fixed. The dialog's `.html` was added for Q15 (c). More's "Pages…"
    anchors to the More button.

- **Round 6 (2026-11-09, one cold reviewer; 1 substantive, 3 minor; the round-5 citations hold, the bundle
  sums hold, no boundary violation):**
  - *Substantive, fixed:* the before/after locators in `tasks.ts` and `capture.ts` key on `UX_BEFORE` directly.
    Following the existing `legacyBefore` idiom would never select the baseline's labels under `UX_OBJECTS=1`.
  - *Minor, fixed:* J5's focus return at 375 is Menu. The before run's core-task counts must equal step 0's.
    Q16 (b)'s cache names its frames, `project.page_*`.
  - *Stop rule:* the reviewer judged the plan ready once item 1 was fixed. Round 6 reached the brief's cap of
    about six rounds, so no seventh round ran. The fix is mechanical and changes no other section. Step 3 runs
    review rounds on the firmed-up plan after the pick anyway.

- **Acceptance (2026-11-09, user decision):** the user accepted the plan and answered the six questions due
  before step 0: "accept all except for #5 go with option b" (#5 is Q13). Q1 (a), Q2 (a), Q3 (a), Q12 (a) and
  Q15 (a), as recommended; **Q13 (b)**, not the recommendation: Undo from the create's toast returns to the
  parent and focuses its heading. Q4–Q11, Q14 and Q16 stay open until the pick after step 2.
  - *Recorded:* an Answer line under each of the six questions, options kept as asked; the Open questions intro.
  - *Conditionals settled:* the State header; R3 (Q15's default; a new "create's toast and its Undo" bullet for
    Q13 (b)); R4 (Q12's payment); Do not, Scope check, Findings closed and Explicit non-goals (Q1); Acceptance
    J5 (Q15's Parent on Legacy shelving; Q13 (b)'s toast, Undo, URL, focus and Redo link); the File-level
    change list (the dialog row, the workspace shell row, the history-store row now naming
    `core/history/receipt-undo.ts`, a new `project-creation-history.spec.ts` row, a new decision entry and the
    creation-history amendment, slice 81.1 queued); Implementation steps 0 and 7 (step numbers unchanged); the
    Test plan (the dialog row, and four rows replacing Q13's one).
  - *Q13 (b) specified against the code:* the landing keys on a committed transition, because the stale
    "no longer the latest change" result is also `tone: 'status'`; the generation change on navigation closes
    the toast, so the shell shows the create's toast and the Undo's result after each navigation; Redo stays
    reachable through "Open Pantry to redo", which opens Pantry's "Creation undone". The header's Undo and root
    creation are unchanged.
  - *Review of the amendment (one cold reviewer; 1 substantive, 5 minor; its code claims checked and holding):*
    the substantive one: the Undo result's "Open Pantry to redo" link closes with the toast after 8 s, and
    with `replaceUrl` nothing would then lead back to Redo. Settled by a default rather than a new question,
    because it changes no surface or step: the landing pushes, so Back reaches Pantry's "Creation undone"
    (Q13's Answer says the user may change it at the pick). Minor, fixed: `receipt-toast.ts`'s focus and
    `history-feedback.ts`'s sentence are in the change list and the "Where" bullet; the `ReceiptUndoResult`
    field is required, not conditional; the pre-navigation cross-owner toast is suppressed; the e2e row names
    the `:101` toast assertion; the test plan names the gone ("can no longer be undone") result and Back;
    `goals.md` names the answers.
  - *Second round (one cold reviewer; 1 substantive, 2 minor):* the Test plan row still said `replaceUrl`,
    contradicting the push; fixed. The e2e row now names `:103-105` too, and R3's bullet lists the same
    not-committed cases as Q13's Answer. The reviewer found no remaining shape-changing gap.

- **Step 0 (2026-11-10):** the rig, baseline, "before" capture, core-task counts and the Q12 (a) measurements
  are in the State header. Findings closed gains "Step 0's re-check": four ids reproduce only in part, and the
  slice claims only the remaining part. The plan's line citations into `capture.ts` and `tasks.ts` refer to
  `1a0fb0d`; the State header gives today's lines.
- **Step 1 (2026-11-10):** the specimens, the smoke spec, the alternatives rig and the probe; State header.
  - *Changed content:* R1's "adds nothing to the initial bundle" (the route entry costs +0.48 kB); R2 gains the
    probe's result (no light-dismiss exemption for `source`; `position-anchor: auto` needed), which step 3 resolves
    for step 6; the Steps 1–2 change list gains `specimen-model.ts`, `specimen-tree.*` and `what.md`.
  - *Specimen calls (defaults, AGENTS.md §4; for step 2's summary):* the specimens also take `home=` (Q5) and
    `q16=`, so the pick can see those answers; Q11 is shown as (a) only; option B, back at "‹ All projects" while
    inside a project, marks the current root `aria-current="location"` (going up does not navigate, so the page is
    not in view); option C shows the root's tab row on workstreams too (none current), so root scope reads the same
    there; the specimen does not re-read pages on live frames.
  - *Review (one cold reviewer over `3d2e64d`; 1 substantive, 4 minor, all checked against the code and holding):*
    substantive: a project read still in flight could land after the person moved to a destination, leaving two
    current items; fixed (the load token moves on leaving), with a spec case watched failing first. Minor, fixed:
    the old context is kept only for a move inside the same root (any other shows loading); a stale remembered press
    could swallow the next activation (cleared on every activation; C's tab-row button carries its id); Q16 (b)
    reads fire only in option A, the one that draws them; collapsing a row by its chevron while focus is below it
    hands focus to the row. The probe now asserts its findings (initial `normal`, the corner fallback, no source
    exemption, the command invoker's exemption and anchoring) rather than only recording them.

## Outcome

<!-- Written at step 15. -->
