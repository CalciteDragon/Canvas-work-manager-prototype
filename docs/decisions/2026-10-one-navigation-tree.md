# Navigation condenses into one tree

**Question**

Theme TH11 holds 33 reproduced findings caused by two navigation trees: the global sidebar's
Projects tree and the project column (§23). Among them:

- the work tree is drawn twice (L7-001);
- the sidebar never marks the current place (L7-002);
- "Home" means two destinations (L7-003);
- both columns take about 45% of the width at 1024 px (L7-007);
- phones get two different collapse patterns (L7-006).

Gate 1 asked whether to condense the two into one tree.

**Options tested**

- *Keep both trees and fix their marking*: rejected by the user at Gate 1 (2026-10-14).
- *One navigation tree*: chosen.

**What we learned**

The project column exists to show a root's pages (Home, Todos, Archive, Reflections) and its
work hierarchy ([column](2026-09-where-the-project-navigation-column-lives.md)). The global tree
already shows that hierarchy to full depth. Only the pages and the page-settings gear are unique
to the column.

**Current decision**

The redesign will present one navigation hierarchy.

- **What the tree contains.** Workspace destinations, then projects. Each root expands to its
  enabled pages and its workstreams.
- **One "you are here".** Exactly one current item is marked, with an indicator and
  `aria-current`, and the page heading and document title agree with it (principle 8).
- **Phones.** One pattern instead of two.
- **Breadcrumbs.** They name the current workstream.
- **Root-scoped controls** (page settings, Add workstream) stay reachable from the tree, labelled
  with their scope.
- **Still to design, in the shell slice:** the tree's exact shape, how pages appear under a
  root, whether "Home" is renamed, and where page settings sit.
- **Reopened entries.** This reopens
  [where the project navigation column lives](2026-09-where-the-project-navigation-column-lives.md),
  [the phone navigation drawer](2026-09-phone-navigation-drawer.md),
  [optional page management in project navigation](2026-09-optional-page-management-lives-in-project-navigation.md)
  and [the gear and work create](2026-09-project-navigation-gear-and-work-create.md), each
  amended to point here.
- **Behaviour change.** It follows §77: change the e2e journeys, the implementation and the docs
  together. It is a shell-layer slice, after the token, primitive and pattern layers.

**Confidence**

High on one tree. Low on its exact shape until the shell slice prototypes two or three options.

**Revisit when**

Revisit at the shell slice's Gate 1-style alternatives, or if one tree cannot keep a deep
workstream's context visible at 375 px.

**Amended, 2026-11-10 (Slice 81, step 3) — the shape is picked.** Slice 81 built three live
specimens (A, one expanded tree; B, a focused tree that drills in; C, pages in the header) and a
comparison sheet ([summary](../roadmap/70-ui-ux/alternatives/slice81-navigation.md)). The developer
recommended A. **The user chose B**, because they liked B best on seeing it. What is now decided, to be
built by the slice's later steps (nothing here exists yet):

- **Shape (B).** Outside a project the tree lists the workspace destinations, the Projects group (a
  label, not a toggle) with New project and the live roots, and Settings with its children. Inside a
  project it shows only that root: its row (which opens the root's first page), its enabled pages, then
  its workstream hierarchy. Other roots are one level up. On every navigation the tree shows the current
  place's level; the phone drawer opens at it.
- **Tree actions as icons.** One row at the top of the root level holds a back-chevron button (name
  "All projects", tooltip), which goes up a level without navigating, and a pencil button (name "Edit
  project", tooltip) that opens a small menu with "Pages of Home renovation…" and "Add workstream".
  Both actions also stay in the project's More menu. This replaces the labelled rows of the original
  "root-scoped controls stay reachable from the tree, labelled with their scope": the scope is named by
  the menu items and by Add workstream's description, one activation behind the pencil.
- **One "you are here", amended for B.** While the person has gone up a level inside a project, no row
  of that level is the page; the current root is marked `aria-current="location"` until the next
  navigation, which brings the tree back to the current place's level and its one `aria-current="page"`.
- **No underlined blue links in the navigation.** Breadcrumb links are themed soft-grey pills; tree
  actions are themed controls; focus rings and contrast stay.
- **Phones.** The tree lives in the existing Menu drawer. The drawer has no visible Close: the chevron
  sits top-left and the pencil top-right. It is dismissed by the backdrop (a labelled button), Escape,
  choosing a destination, a tap where Menu sits (the backdrop covers it), and a "Close navigation" button
  that is the drawer's last Tab stop and becomes visible on focus, so keyboard and screen-reader users
  keep an explicit dismiss inside the modal.
- **"Home"** (the open question above): no separate row for a root's first page; the root's own row
  opens it, and in-content mentions use the project's name.
- **Page settings** sit in the pencil menu and in More.
- **Archived work** stays out of the tree except while current, then under its real path, with a
  contrast-passing colour rather than reduced opacity.
- **Keyboard (Q4 (a)):** disclosure navigation: links and expand buttons in the Tab order, no treeview.
- **Titles and headings (Q6 (a), (i)):** "Todos · Home renovation · Canvas Work Manager"; the `h1` names the
  current page.
- **Phone header (Q10 (a)):** below 48rem the description and facts fold behind "Details", with history and
  More on the name row.
- **Breadcrumb on touch (Q14 (a)):** 44 px targets; the Archive origin sentence keeps inline links.
- **Pages of a root (Q16 (b)):** only enabled pages; in B only the current root shows its pages, so no
  on-demand read of another root's pages is needed.
- Details are in the Slice 81 plan's Open questions Q4–Q11, Q14 and Q16.
