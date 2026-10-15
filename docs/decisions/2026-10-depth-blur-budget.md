# Depth blurs panes and leaves translucent sheets unblurred

**Question**

Depth's mock blurs every sheet, exceeding the long-canvas blur budget (§21, §22).
Slice 71's part A measured the candidates before product token adoption.

**Options tested**

- V0: existing styling, the baseline sanity check.
- V1: solid Depth planes, the fallback.
- V2: blurred panes and translucent sheets without blur. Chosen.
- V3: blurred panes and every sheet blurred. Failed desktop smoothness thresholds.
- V4: blurred panes and sheets within the viewport plus one viewport height blurred.
  Failed desktop smoothness thresholds.

**What we learned**

The [spike](../roadmap/70-ui-ux/blur-spike.json) contains 30 cells and 90 runs across
busy-week and agent-heavy, desktop and throttled touch emulation. Every V0 cell passed
the registered sanity gate; V2 passed every smoothness threshold. Desktop V3/V4 long
frame shares ranged from 26.53% to 58.33%, compared with 0% to 0.84% for V2.

The renderer was SwiftShader, with a software compositor, so the results are pessimistic.
CPU throttling mostly affects the main thread; DPR 3 is only a phone raster-load proxy.
These are not physical-phone measurements. Dashboard has no drawer action, so its cells
measure scroll only. Both specified project routes use root canvases labelled Home.

**Current decision**

The user chose **V2** on 2026-10-14: Depth panes use the shown 30 px blur; sheets keep
the shown per-theme translucency and use no backdrop filter. No per-sheet observer is
needed. Solid fallbacks remain required. This is the rule for Slice 71 part B; product
tokens and surfaces have not yet adopted it. Lift specimens retain the approved Depth
values; product lift adoption belongs to the later pattern slice.

**Confidence**

High on the user's choice and this matrix; medium on performance beyond the software
renderer and emulated phone. V2 was the most expressive variant smooth in every cell.

**Revisit when**

Revisit if Gate 2's actual product sheet loses Depth's character, or real-device use
shows pane blur jank. Bring any changed rule back to the user before adopting it.
