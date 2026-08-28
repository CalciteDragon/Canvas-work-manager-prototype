# Progress formulas are selectable per project

**Question**

How should §39's count-based, estimate-weighted, and manual formulas behave in the prototype?

**Options tested**

- Count: completed unarchived tasks divided by all unarchived tasks.
- Weighted: completed estimate points divided by all estimate points, with a neutral weight
  of one for an unestimated task.
- Manual: an explicitly entered bounded percentage from 0 through 100.

**What we learned**

On `busy-week`, count communicates throughput (`1 of 3`) while weighted communicates effort
(`2 of 10`). Manual is useful when task data is not the project's source of truth, but needs
an explicit explanation so it is not mistaken for a derivation. Formula controls belong in
the Progress section, while the selected value belongs to the project so every presentation
stays coherent.

**Current decision**

All three formulas remain switchable per project. Count is the default. Estimates must be
positive; missing estimates weigh one. Manual selection requires a bounded value. No history
or descendant roll-up is recorded.

**Confidence**

Medium. The differences are legible in the seeded scenarios, but this is still prototype
evidence rather than user evidence.

**Revisit when**

Task estimates prove confusing, project roll-ups are introduced, or user testing favors one
formula strongly enough to remove the experiment.
