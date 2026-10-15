# The accent stays orange in dark and blue in light

**Question**

Today `--color-accent` is `#ff9f6b` in dark and `#2563eb` in light (`_tokens.scss`, §22).
Consistency findings noted that the active-state and primary cues change hue between themes
(L2-012). Gate 1 asked whether to unify the accent.

**Options tested**

- *One accent for both themes*: rejected by the user at Gate 1 (2026-10-14).
- *Keep the split accents*: chosen. The Gate 1 mockups already used them, to isolate the glass
  change.

**What we learned**

The accent is not the problem L2-012 describes. The problem is that state is carried by hue
alone (theme TH02). Principle 4 addresses that with shape and words, whatever the hue.

**Current decision**

The dark and light accents remain separate theme literals. Glass tints, focus rings and
accent-tinted surfaces derive per theme. Each accent must still meet AA for text on its
accent-filled controls and 3:1 as a non-text indicator, over the Depth planes in its own theme.

**Confidence**

High.

**Revisit when**

Revisit if an accent cannot meet contrast on the tuned Depth planes, or if the user reopens
brand colour.

**Amended, 2026-10-14 (Slice 71).** The approved Depth values are orange `#ffad7f` in dark and blue `#1f4fd0` in light. Contrast is measured and reported, including accepted exceptions, under the [Depth contrast amendment](2026-10-frosted-glass-depth-direction.md); it does not gate or dull the chosen tints.
