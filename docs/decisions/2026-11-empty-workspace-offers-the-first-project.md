# An empty workspace offers the first project

**Question**

A person who opens a workspace with no projects lands on Home, where every widget says it has
nothing, and nothing says what the product is for or where to begin (W1-001, W4-001, L4-020). And
when every project is archived, the sidebar says "No projects yet", which is false: the work exists,
in Settings › Archived projects (W4-034). What does an empty workspace show, and where? (Slice 79,
Open question 3; §23, §24.)

**Options tested**

- *A first-run block above the widgets, which stay below with their own empty sentences*: chosen
  by the user on 2026-11-04 (Q3 (a)).
- *The block in place of the widget grid until the first project exists*: rejected. It needs a
  special layout path and a rule for when the grid returns, and the persona's widget preferences,
  the digest and the fun fact stop speaking.

**What we learned**

"Empty" has to mean no projects at all, said by a read that answered. The sidebar's read was
filtered to live statuses, so an archived-only workspace looked empty and a loading or failed read
looked the same as none. The shell now reads every project once and derives the tree (live only),
whether anything is archived, and whether the workspace is empty, which is never true while loading
or after a failure.

Home must not inject the shell's store. `AppShell` provides a `SHELL_COMMANDS` token as itself,
which gives a page exactly one fact (`workspaceEmpty`) and one command (`requestCreate()`, which
opens the sidebar's one creation form, the Menu first on a phone). There is still one creation
form.

The first-run block is its own component behind `@defer (when workspaceEmpty())`, because only a
deferred block's dependencies load lazily. Even so, the shell state and the trigger took step 8
1.23 kB over the 1,150 kB initial ceiling. The user kept the ceiling and made Calendar and Settings ›
Agents lazy routes instead
([budget](2026-08-initial-bundle-budget.md), amended 2026-11-04).

**Current decision**

In a workspace with no projects, live or archived, Home shows a block above the widgets: "Projects
hold your tasks, notes and reflections, for you and the agents you connect. Start with your first."
and **New project**, which opens the sidebar's creation form with focus in its name. The block goes
when the first project arrives. The sentence is a default, not a user decision.

With only archived projects, the sidebar says "No active projects." with the link "Archived
projects are in Settings." to `/settings/archived-projects`. With none at all it keeps "No projects
yet".

**Confidence**

High for the conditions and the single form. `shell-store.spec.ts` covers loading, failure,
archived-only and the first project arriving; the shell, sidebar and Home specs cover the token,
the wording and the block. Medium for the sentence,
which has not met real use.

**Revisit when**

Onboarding grows beyond one action (a seed to explore, an agent to connect), or real use shows that
people miss the block because the widgets below it look the same as a filled Home.
