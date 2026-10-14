# Prototype scaffolding stays visible during the redesign

**Question**

Theme TH12 groups 22 reproduced findings about prototype scaffolding in product surfaces:

- the "Flow layout" banner on every canvas;
- § and slice citations on the Calendar, Search and not-found pages;
- the "prototype AI provider" footer;
- seed instructions in empty states;
- the `/prototype` routes rendering inside the shell.

Should the redesign remove them?

**Options tested**

- *Remove or relocate them now*: rejected by the user at Gate 1 (2026-10-14).
- *Keep them for now*: chosen.

**What we learned**

These elements are the prototype's working tools. The layout experiment, the seed and persona
switching and the route placeholders are still in use (§46, §47, §68).

**Current decision**

- **Nothing in TH12 is removed or relocated** by the redesign slices. Redesign slices restyle
  these elements to the new planes and tokens like any other content, and do not count TH12
  findings as closed.
- **One exception.** S1 is resolved by the separate
  [agent connection surface](2026-10-agent-connections-are-a-product-surface.md), not by this
  theme.
- **Effect on the exit rule.** The protocol's stop condition counts open S1 and S2 findings, so
  TH12's S2 findings remain deliberately open and are reported as such.

**Confidence**

High. It is the user's call, and it is cheap to reverse.

**Revisit when**

Revisit when the overhaul reaches its stop condition (protocol §8), or when the user asks for a
product-only presentation.
