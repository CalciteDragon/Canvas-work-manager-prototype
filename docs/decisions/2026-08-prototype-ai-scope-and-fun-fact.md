# What counts as AI in the prototype

**Question**

§42 pins `AIProvider` to two methods, `generateDailyDigest` and `generateProjectSummary`.
§24 lists nine widgets, three of which produce prose: Daily Digest ("mock AI-generated
overview"), Work Summary ("longer AI-generated progress summary"), and Fun Fact
("low-priority optional daily content"). Which of those go through the provider?

**Options tested**

- *Add `generateFunFact` to `AIProvider`*: rejected. §42 writes the interface out in full,
  and §24 pointedly does not call Fun Fact AI-generated. Widening a spec-pinned interface
  to reach one string is the kind of quiet drift the contracts package exists to prevent.
- *Compose the fun fact in the widget*: rejected. It has to change with the *simulated*
  day (§45), and the browser has no clock the domain trusts.
- *A clock-keyed fixture rotation in `DashboardService`*: chosen. Seven facts, indexed by
  the clock's UTC day, so it is stable within a day and different tomorrow.

**What we learned**

The distinction is worth keeping sharp, because the prototype's whole AI story is that
locally composed text can *feel* generated (§43). Once everything textual is called AI,
the experiment cannot tell which parts actually needed a model. The digest is the thing
worth testing — it states counts, names the nearest deadline, and reads like a summary —
and it needed no key, no network and no prompt to do it.

Two rules fell out of building it. First, the provider takes a **context**, never a
prompt, and never holds a `Clock`: `generatedAt` arrives in the context, so the digest can
never disagree with the dashboard it describes. Second, `GeneratedContent` carries a
`source`, and the widget prints "Composed locally by the prototype AI provider" — the
prototype is allowed to feel AI-generated and not allowed to claim it is.

`generateProjectSummary` is implemented and tested with no caller. §42 pins it, the same
way §9 pins `TaskGateway`; Slice 24 is where it gets a widget.

**Current decision**

`AIProvider` stays exactly as §42 writes it. Daily Digest goes through it. Fun Fact is a
fixture rotated by the clock's day, owned by `DashboardService`. Work Summary is not
built.

**Confidence**

High for Fun Fact. Medium for the two-method interface — a third generator (§56's tool
experiments, or per-section AI summaries) may argue for a more general
`generate(kind, context)`.

**Revisit when**

Slice 24 builds AI project summaries and any second AI-shaped surface appears. If a third
method is needed, that is the moment to ask whether §42's shape is still the right one and
to correct the spec rather than quietly widen the interface.
