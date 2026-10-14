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
