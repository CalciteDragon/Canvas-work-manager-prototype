# Slice 70 — proposed design direction (Gate 1 draft)

**Status: proposed, awaiting the user's Gate 1 choice.** Nothing here is approved. This file
is not a decision record and changes no product behaviour. When the user chooses, the answers
become `docs/decisions/` entries and the spec (§21, §22, §26, §67) is amended there.

The direction is built from the reproduced Phase 1 evidence in [`themes.json`](themes.json)
and [`reproduction.json`](reproduction.json). It also follows the user's brief: a real,
modern, clean frosted-glass redesign, a few coherent surface levels, calm layering instead of
heavy borders and shadows, purposeful fast motion, a clear reading order, and one primary
action per surface.

## Principles

1. **Three planes, one job each.** *Ground* is an ambient backdrop and never carries text.
   *Panes* (top bar and navigation) are frosted and recede. *Sheets* hold content and are opaque
   enough for WCAG AA over any backing. *Lifts* (drawer, dialog, menu, toast) are the only
   things that float. Today every block is a bordered card at about 1.05:1 luminance against
   the page, and the task drawer is a third box nested inside a section (TH01: L1-019, L1-031,
   L5-006).
2. **Separate by plane and space, not by line.** Cards inside sheets have no hairline borders.
   Grouping comes from the spacing scale and one surface step. A border appears only where a
   control needs a 3:1 boundary, as inputs do. Input borders measure 1.3–1.6:1 today (TH01,
   TH04).
3. **One primary action per surface.** Commit actions look committed, and destructive actions
   are separated from neighbours and say what they destroy. Today Create and Cancel are
   identical, "Archive Workstream" sits under "Open Archive", and only the Task List has a filled
   button (TH05: L1-020, L2-006, W4-019).
4. **State in shape and words, colour as reinforcement.** Selection is a ring, not a fill, so
   overdue and complete marks survive it. The active place has an indicator, not just a hue.
   Every state survives forced colours. Today active navigation differs by 1.26:1, selection
   replaces the overdue tint, and the progress bar disappears in forced colours (TH02: L5-008,
   W1-034, L5-017).
5. **Chrome is quiet at rest, never absent.** On pointer devices, section tools are visible at
   low emphasis and full emphasis on hover or focus. Touch gets the same tools with no extra
   strength. Adding a section is a persistent affordance, and a heading names its section.
   Today insertion appears only inside a 16 px gap, only the top of its "+" is clickable, and
   headings are announced as "Rename X" (TH08: W1-017, W1-018, L6-009). This reopens
   [canvas chrome is revealed, not moded](../../decisions/2026-09-canvas-chrome-is-revealed-not-moded.md)
   only in its *at-rest emphasis*. The reserved space and the no-mode rule stand.
6. **Answer where the user acted.** New things scroll into view and take focus. Confirmation
   and Undo appear next to the change. Pending shows within 100 ms, and failures name the row
   that failed. Today a new section lands at y=872 on a 900 px screen with focus on the body,
   and removal says "Undo is in the header" (TH07, TH10: W1-024, W1-036, L4-005).
7. **Motion explains change, then gets out of the way.** Durations are 120–240 ms. Only
   `transform` and `opacity` animate. Entering eases out, leaving eases in. Long lists never
   animate their layout, and reduced motion becomes a crossfade of 80 ms or less. Today nothing
   animates, so content jumps 52 px as Recent Activity grows (W1-030), and collapse waits on
   the server (L3-016).
8. **One "you are here", in product words.** One navigation hierarchy marks the current place,
   and the heading and the document title agree with it. The interface never shows record ids,
   enum spellings, slice numbers, § numbers or prototype tooling (TH11, TH12, TH14).

## Glass constraints (apply to every alternative)

- Text never relies on blur for legibility. Each translucent surface's tint and alpha must keep
  body text at or above 4.5:1 and muted text at or above 4.5:1 against the *worst* backing
  colour: the composite of the surface over the lightest and darkest pixel that can sit beneath
  it, including busy text. The Gate 1 page computes this per alternative and theme.
- Budget: at most two persistent `backdrop-filter` layers and one transient one. Never blur
  per section or per row on long canvases (busy-week, agent-heavy).
- `prefers-reduced-transparency: reduce`, `@supports not (backdrop-filter: blur(1px))` and
  forced colours all resolve to solid token surfaces that already meet contrast.
- `prefers-reduced-motion: reduce` resolves to crossfades of 80 ms or less, or to none.
- Every value lives in `apps/web/src/styles/_tokens.scss`: plane tints and alphas, blur radii,
  lift elevation, durations and easings. The Design Lab gains live knobs for them (§21, §22,
  §67). Components hold no literals.

## Alternatives

Three holistic directions apply the principles at different strengths. They are shown side by
side, with a motion study, on the Gate 1 page. Their static source is
[`alternatives/gate1.html`](alternatives/gate1.html).

| | A · Frost | B · Depth | C · Pane |
|---|---|---|---|
| Idea | Quiet glass: frosted panes, near-opaque sheets | Layered glass: tinted ambient ground shows through translucent sheets | Glass only for what moves: solid shell and sheets, frosted lifts |
| Persistent blur layers | 2 (top bar, navigation) | 2 + one per visible sheet | 0 (1 while scrolled under the sticky header) |
| Risk | Low | Contrast and long-canvas performance | Least "glass" at rest |

Theme to alternative mapping, plus the themes that need no visual alternative because they are
behaviour, copy or IA work, are on the Gate 1 page and in [`themes.json`](themes.json).
