# Breakpoints live beside the design tokens

**Question**

Where should §21's reflow constants live when CSS custom properties cannot appear in media queries?

**Options tested**

Import the full tokens stylesheet per component, or import a CSS-free Sass partial. The former
would repeat the root token rules in component CSS.

**What we learned**

Existing thresholds have distinct jobs: 40rem compact headers, 48rem shell navigation,
60rem project navigation, 42rem task-list containers and an 18rem Lab column. Merging them
would change geometry. Container query values require Sass interpolation.

**Current decision**

Use `_breakpoints.scss` beside `_tokens.scss`, through relative `@use`. Preserve every
threshold. The two TS media queries import named constants; the token lint checks their
agreement with Sass. §21 is corrected to name this CSS-free exception.

**Confidence**

High: compiled query conditions are compared with the baseline, and mismatch fixtures fail.

**Revisit when**

A deliberate layout slice changes the reflow rules.
