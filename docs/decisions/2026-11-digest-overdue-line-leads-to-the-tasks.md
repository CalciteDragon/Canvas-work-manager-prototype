# The digest's overdue line leads to the tasks

**Question**

The Daily Digest says "N tasks are overdue." and offers nothing to follow (W4-028). The finding's
persona, Sam, sees only the digest, so an answer that sends them to Today fails. The digest is
provider prose (`GeneratedContent.lines`) with no task ids, and no route shows overdue tasks across
projects. Where does the line lead? (Slice 79, Open question 1; §24.)

**Options tested**

- *Web only: the digest lists the overdue tasks from the dashboard result it already takes, under
  its prose, each linking to its owner section, at most five, then a muted "and N more overdue"*:
  chosen by the user on 2026-11-04 (Q1 (a)).
- *A "Show overdue tasks" link that focuses Today's first overdue row*: rejected. Sam has no Today
  widget, and it couples two widgets.
- *Digest lines carry an optional `topic: 'overdue'` set by the domain*: rejected for this slice. It
  is a contract and domain change for a web problem, better left to its own slice.

**What we learned**

The overdue tasks are already in the one dashboard read (`today.overdue`), with each task's owner
origin, so the digest needs no new data and no knowledge of Today. The link rule Today's rows built
inline is now `widgets/task-origin-link.ts` (`taskOriginRoute`, `taskOriginFragment`), and Today and
the digest both use it. Upcoming and Recent Progress still build the same link inline. The list
cost 2.13 kB of initial bundle (1,141.97 → 1,144.10 kB).

**Current decision**

Under its prose, the digest lists up to five of `today.overdue` as a list labelled "Overdue tasks",
set apart from the prose and the source line by the digest's own `.digest-overdue`, in slice 77's row anatomy (title
link to the owner section, the overdue date, the project), each row `data-digest-overdue`. Beyond
five, a muted "and N more overdue" (`data-digest-overdue-more`) with no link. With nothing overdue,
nothing is listed. A `null` digest keeps Slice 78's failure, which replaces the widget body, so no
list shows. No contract changes, and the prose is untouched.

**Confidence**

High for the behaviour: `daily-digest-widget.spec.ts` covers the rows, their links, the cap, the
remainder line and the empty case, and that the widget lists nothing over a `null` digest (the
frame's swap to the failure is `dashboard-page.spec.ts`'s); `task-origin-link.spec.ts` the link rule.
Medium for the cap of five, a default no seed exceeds (overdue-chaos has four).

**Revisit when**

A cross-project overdue view exists, or the digest gains structured lines (the `topic` option),
or real use shows the list duplicating Today reads as noise for personas who have both.
