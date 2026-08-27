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
`development.md` names tasks explicitly. The cost is four methods with tests and no UI for
one slice; the alternative is diverging from both authoritative documents to save them.

**Current decision**

`WorkManagerGateway` carries `projects` and `tasks`. `TaskGateway` is §9 verbatim.
`ProjectGateway` is `list` + `get`. The remaining six §9 members are named in a doc comment
against the slice that brings them, and each is added *with* its implementation.

**Confidence**

High for the shape, medium for where the line sits on `ProjectGateway`. If Slice 8 finds
itself adding three project methods at once, the "arrives with its caller" rule is costing
more than it saves and should relax to "arrives with its route".

**Revisit when**

Slice 8 adds `sections` and the first `ProjectGateway` write. If the doc comment listing
the six is still accurate then, the rule is working.
