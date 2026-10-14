# The redesign follows direction B, Depth, held to the eight principles and the glass constraints

**Question**

Slice 70's Gate 1 asked the user to choose among three frosted-glass alternatives for the web
app (§21, §22, §26, §67). It also asked them to confirm the theme priority and the principles.
The evidence is 296 reproduced findings in fifteen themes
([themes](../roadmap/70-ui-ux/themes.json), [ledger](../roadmap/70-ui-ux/reproduction.json)).
The options are shown on the [Gate 1 page](../roadmap/70-ui-ux/alternatives/gate1.html).

**Options tested**

- *A, Frost (quiet glass)*: frosted panes and near-opaque sheets. It met worst-case AA and had
  the lowest risk. Not chosen.
- *B, Depth (layered glass)*: a tinted ambient ground showing through translucent sheets, with
  larger radii and depth. It is the most expressive option. **Chosen.**
- *C, Pane (glass only on what moves)*: the calmest and cheapest option, with the least glass at
  rest. Not chosen.

**What we learned**

The mockups measured contrast against the worst colour that can sit beneath a translucent
surface, including busy text. Under that model, frosted surfaces need a tint alpha of roughly
0.82–0.88 for muted text to reach 4.5:1. At the tints shown, B failed for muted text on every
glass surface and for body text on panes. B also blurs every visible sheet: about five layers
on Kitchen and ten or more on busy-week. That exceeds the stated budget of two persistent
layers plus one transient. B's mock also hid section tools until hover, which contradicts
principle 5.

**Current decision**

The user chose **B, Depth** (2026-10-14). They kept the suggested theme priority and all eight
principles in [direction.md](../roadmap/70-ui-ux/direction.md).

- **Where principles and B conflict, the principles win.** B's look is the aesthetic target. The
  principles and glass constraints are the acceptance rules. In practice:
  - **Contrast:** text and muted text must reach WCAG AA over the worst backing in both themes.
    B's tints, muted colours or ground saturation are tuned until that holds.
  - **Section tools:** they stay at low emphasis at rest (principle 5), not hidden until hover.
  - **Fallbacks:** reduced transparency, no `backdrop-filter` and forced colours all resolve to
    solid token surfaces that meet AA.
  - **Motion:** only `transform` and `opacity` animate, within 120–240 ms. Reduced motion
    becomes a crossfade of 80 ms or less, or none.
  - **Tokens:** every value lives in `_tokens.scss`, with live Design Lab knobs.
- **Theme order** for redesign slices follows the protocol's layers:
  - tokens: TH01–03
  - primitives: TH04–06
  - patterns: TH07–10
  - shell: TH11–13
  - content and page: TH14–15
- **Open question, the blur budget.** Per-sheet blur breaks the layer budget on long canvases.
  The first token slice must settle it with a measured spike on busy-week and agent-heavy, at
  1440 and at a 375 px touch emulation, before primitives adopt it. Candidate answers:
  - translucent sheets without per-sheet blur;
  - blur only on sheets in or near the viewport;
  - relax the budget, with the measured cost recorded.

**Confidence**

High on the choice, which is the user's. Medium on how much of B's translucency survives AA
tuning. The spike and the first before/after sheet will show it.

**Revisit when**

Revisit at Gate 2 of the first token slice, if AA-compliant tints remove most of B's character,
or if the blur spike shows jank on the long canvases or on phone emulation. Either outcome goes
back to the user as a Gate 3 amendment rather than a silent switch to A or C.
