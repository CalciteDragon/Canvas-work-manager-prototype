# The gateway interface grows with its implementations

**Question**

§9 sketches `WorkManagerGateway` with eight members — `projects, tasks, sections,
milestones, reflections, dashboard, search, activity` — and Slice 6's build list says
"Only `projects` and `tasks` need real methods this slice; stub the rest as interfaces
without implementations." What does the interface actually contain when six of its members
have nothing behind them?

**Options tested**

- *All eight declared, six with methods nothing implements*: rejected. Every adapter would
  have to fake six members, `FakeWorkManagerGateway` included, and AGENTS §2 rule 6 bans
  documenting a feature as existing before it does. An interface is documentation.
- *All eight declared as empty marker interfaces*: rejected as worse — `{}` satisfies an
  empty interface, so the adapter would "implement" six members by accident and the
  compiler would never notice when a real one was needed.
- *Two members, with a comment naming the other six and the slice each arrives in*: chosen.

**What we learned**

§9's wording is "Define an interface **similar to**", and it pins method signatures for
exactly one sub-interface: `TaskGateway`. That one is implemented verbatim, including
`archive(): Promise<void>` even though the host's route returns the archived task — the
adapter validates the body and discards it.

`ProjectGateway`, which §9 leaves open, follows the same principle inward: it is `list`
and `get` this slice, because the shell lists projects and Slice 8's project page will get
one. `create`/`update` wait for the UI that writes.

`TaskGateway` is the deliberate exception to that inward rule, and two reviewers
questioned it. It is implemented in full with no caller, because §9 pins it and
the build order (now `docs/roadmap/completed/`) names tasks explicitly. The cost is four methods with tests and no UI for
one slice; the alternative is diverging from both authoritative documents to save them.

**Current decision**

Unchanged in substance, updated for what has actually landed. As of Slice 11
`WorkManagerGateway` carries **seven** members — `projects`, `sections`, `tasks`,
`progress`, `timeline`, `reflections`, `dashboard` — each added *with* its implementation
and its first caller. `TaskGateway` is still §9 verbatim. Three §9 members remain undeclared
and are named in the interface's doc comment: `milestones` (Slice 19), `activity`
(Slice 13), and `search`, which turns out to have no slice of its own.

**Confidence**

High. The rule has now survived five slices and produced no adapter faking a member nothing
uses. Two refinements it earned along the way: `SectionGateway.move` was declared one slice
*after* the rest of `SectionGateway`, when drag-drop finally called it, which is the rule
working at method rather than member granularity; and Slice 11's `dashboard` arrived as a
single `get`, not §9's implied breadth.

The one cost worth recording: adding a member breaks every hand-rolled gateway literal in
the specs — Slice 11 had to touch `project-page-store.spec.ts` and `task-list-store.spec.ts`
for a member neither page uses. That is a real tax, and it is still cheaper than six faked
members.

**Revisit when**

Slice 13 adds `activity`. If `search` still has no home by Slice 21's command palette, drop
it from the doc comment's list rather than carrying a member §9 named that the prototype
never wanted.
