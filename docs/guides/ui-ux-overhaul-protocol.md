# UI/UX overhaul protocol

How to run an evidence-driven overhaul of the web app's look and usability with agents doing
most of the combing, planning and building, and a human holding the taste. It sits on top of
the [development phase protocol](../../AGENTS.md#3-development-phase-protocol): every
implementation phase it produces is an ordinary roadmap slice with the five usual steps. What
this guide adds is the work **before** those slices (capture, comb, synthesis, direction) and
the loop **between** them (re-capture, re-measure, stop).

It is a methodology, not a plan. Nothing here has started until an umbrella slice is opened
in [`docs/roadmap/`](../roadmap/README.md).

---

## 1. Why a protocol at all

An agent asked to "look at the app and make it cleaner" produces predictable failures:

| Failure | Cause | Countermeasure in this protocol |
|---|---|---|
| Generic advice ("add whitespace", "improve hierarchy") | Judging pages, not tasks; no evidence attached | Task-based walkthroughs; every finding carries a screenshot, repro and heuristic (§4) |
| Incomplete coverage | Touring the routes it happens to find | An explicit surface inventory and a capture matrix (§2, §3) |
| Taste drift between iterations | Each agent session invents its own aesthetic | A written design direction the human approves once, before any code (§5) |
| 200 nits, no improvement | Fixing symptoms page by page | Synthesis into root-cause themes; system fixes before page fixes (§5) |
| Regressions and churn | Big-bang redesign; restyling and behaviour change mixed | Small slices in dependency order; before/after capture diff on every slice (§6, §7) |
| "Looks fine to me" | Self-review by the agent that built it | Independent reviewers with fresh context; human gate on visuals (§7) |
| Never finishes | No stop condition | Measured task metrics and an explicit exit rule (§8) |

## 2. Roles

- **Human (taste owner).** Approves the design direction, triages themes, picks between
  alternatives, and signs off each slice's before/after sheet. Three gates per cycle, each a
  few minutes of looking at pictures — not reading code.
- **Orchestrator agent.** Owns the umbrella slice, the capture harness, synthesis, and the
  slice plans. Keeps the accumulated context; never delegates synthesis or direction.
- **Auditor subagents.** Fresh context each, one lens each (§4). Independence is the point:
  an auditor that has seen another's findings converges on them.
- **Implementer.** The orchestrator, or a subagent for mechanical, file-disjoint work
  (restyling twelve components against an already-built primitive).
- **Reviewers.** Fresh-context subagents against the diff **and** the before/after captures.

## 3. Phase 0 — Baseline and capture harness

Open the umbrella slice first
(`node scripts/roadmap.mjs new <id> ui-ux-overhaul --title … --summary …`), record the
direction in [`goals.md`](../roadmap/goals.md) as user-requested, and bump `CURRENT_SLICE`.

### 3.1 Surface inventory

Build the list of everything that can be looked at or touched, **from the code**, not from
clicking around:

- every route in `apps/web/src/app/app.routes.ts`, and for project routes every page kind;
- every section type, drawer, dialog, menu, popover, toast and the dev panel;
- every state each surface can be in: empty, populated, overloaded, loading, error,
  refused, read-only, edit mode, selected, dragging, archived;
- the Storybook stories and the Design Lab, as the component-level view of the same.

Write it as a checklist table in the umbrella plan. It is the denominator for coverage.

### 3.2 Capture matrix

A screenshot set that can be regenerated identically at any commit, so every change is
judged by a diff, not by memory. Write a Playwright script beside the existing
[e2e suite](../../apps/e2e/playwright.config.ts) (reusing its servers and
`prepare-data.ts`), outside `pnpm test` and `pnpm e2e`:

| Axis | Values |
|---|---|
| Seed | `empty`, `personal-workspace`, `busy-week`, `nested-projects`, `overdue-chaos`, `agent-heavy` |
| Theme | dark, light |
| Viewport | 1440×900, 1024×768, 375×812 (touch) |
| State | each state in the inventory that the seed can reach, driven by role-based locators |

Not every combination — pick the seeds where each surface is interesting. Fix the clock
(`SEED_NOW`), disable animation, wait for network idle. Output to a git-ignored folder named
by commit, plus an index (route, seed, theme, viewport, state → file).

Also capture, per surface: an `axe-core` scan, console errors, and the accessibility tree.
These are cheap and catch what screenshots hide.

### 3.3 Baseline metrics

Define 8–12 **core tasks** from the spec and the friction notes — e.g. "create a workstream
under Kitchen", "add a task list and complete two tasks", "find an overdue task and
reschedule it", "undo a section removal", "connect an agent". For each, script it once and
record: clicks/keystrokes, distinct surfaces visited, dead ends, and whether it is
discoverable without prior knowledge. These numbers are the exit criterion in §8.

**Gate 0:** the human skims a contact sheet of the baseline (published as a private page) and
confirms the inventory is complete.

## 4. Phase 1 — The comb

Two kinds of pass, both producing findings in the same format.

### 4.1 Task walkthroughs (the important half)

For each core task and each persona, an auditor drives the **running app** through the
built-in browser or Playwright MCP, narrating what it expects at each step before it acts.
Every mismatch between expectation and result is a finding. This is what catches
"I didn't know that was clickable" and "where did my thing go" — which page tours never do.
Run the touch walkthroughs at 375 px as their own pass.

### 4.2 Lens audits

One auditor per lens over the capture matrix, zooming into crops rather than judging
full-page thumbnails:

1. **Visual hierarchy and layout** — what the eye lands on, alignment, density, rhythm.
2. **Consistency** — the same thing looking and behaving the same everywhere: buttons,
   icon buttons, menus, headers, spacing, copy. Grep the SCSS for one-off values that
   escape the tokens in `apps/web/src/styles/_tokens.scss`.
3. **Affordance and feedback** — can you tell what is interactive; does every action
   confirm, undo, or explain itself.
4. **States** — empty, error, loading, refused, overloaded; is each designed or accidental.
5. **Accessibility** — axe results, focus order and visibility, keyboard-only completion of
   the core tasks, contrast in both themes, target size on touch.
6. **Copy and vocabulary** — labels, terminology (workstream, page, section, shortcut), error
   and empty-state text.
7. **Information architecture** — navigation, where things live, how many places a concept
   appears.

### 4.3 Finding format

One JSON record per finding, appended to a findings file in the umbrella's working folder:

```text
id          UX-042
surface     project workspace › Work page › section header
seed/theme/viewport/state
evidence    capture path(s), crop, axe rule, or task step
repro       steps from a fresh seed
expected    what the user would expect
actual      what happens / what is seen
lens        which of the seven, or which task
heuristic   the principle violated (Nielsen #, WCAG SC, internal consistency)
severity    S1 blocks a task · S2 slows or confuses · S3 polish
confidence  observed / inferred
```

No fix in the finding. Proposing a fix at this point anchors synthesis on the first idea.
Check the existing [decision log](../decisions/README.md) before filing: a finding that
contradicts a decision is still valid, but it must cite the decision it would reopen.

## 5. Phase 2 — Synthesis and direction

The orchestrator, not a subagent, does this.

1. **Dedupe and cluster** findings into **themes** by root cause, not by page — e.g.
   "no consistent action hierarchy", "section chrome competes with content",
   "empty states are absent", "touch targets inconsistent". Expect 8–15 themes.
2. **Classify** each theme by layer, which sets its order:
   *tokens* → *primitives* (button, icon button, field, menu, dialog, drawer, toast) →
   *patterns* (page header, section chrome, list row, empty state) → *shell and navigation* →
   *page-specific*. A fix at a lower layer usually removes dozens of page findings.
3. **Write the design direction**: five to eight principles, with examples drawn from the
   captures ("one primary action per surface", "chrome recedes until hover or focus",
   "density: comfortable on desktop, roomy on touch"). Optionally two or three reference
   products the human names. This document is what keeps later sessions from drifting.
4. **Prototype the big moves before planning them.** For each theme that changes the look
   substantially, produce two or three alternatives — as Design Lab token settings, Storybook
   variants, or static mockups — and show them side by side. The human picks. Pictures are
   cheaper to throw away than slices.

**Gate 1:** the human approves the direction, the theme priority, and the chosen
alternatives. Record each answered question as a `docs/decisions/` entry, and correct the
spec (§21, §22, §26 and wherever else) where the direction changes it.

## 6. Phase 3 — Slice plan

Turn themes into roadmap slices under the umbrella, one theme or one layer per slice, in
layer order. Each slice is planned and reviewed exactly as
[AGENTS.md §3](../../AGENTS.md#3-development-phase-protocol) requires, with these additions
to its plan:

- **Findings closed** — the finding ids this slice resolves; its acceptance check names them.
- **Capture scope** — which cells of the matrix must change, and which must **not**.
- **Visual acceptance** — the before/after pairs that demonstrate each finding closed.
- **Behaviour vs. appearance** — say explicitly whether behaviour changes. A purely visual
  slice must leave every existing test green untouched; a behaviour change follows §77
  (change the test, the implementation and the doc together).

Keep slices small enough that the before/after sheet fits on one screen of review.

## 7. Phase 4 — Execute, per slice

The five-step phase protocol, plus:

1. **Foundations first.** Token and primitive changes land, with Storybook stories and
   Design Lab coverage, before any page adopts them.
2. **Test what is testable.** Behaviour (keyboard paths, focus return, ARIA, state) gets a
   failing test first. Appearance is verified by the capture diff, not by snapshot tests that
   would ossify the design mid-overhaul.
3. **Re-capture** the slice's scope after implementation and generate a before/after sheet.
4. **Review** with fresh-context subagents given the diff, the findings, the direction and the
   sheet: did each finding close, did anything outside scope change, are the boundaries and
   tokens intact, does it hold at 375 px and in both themes.
5. **Gate 2:** the human looks at the sheet and accepts or sends it back.
6. **Use it** on a realistic seed and record friction in `.prototype/notes.json`, as always.

Standing guardrails throughout: the boundaries in [AGENTS.md §1](../../AGENTS.md); no literal
colors, spacing or radii; role-based locators so e2e tests survive restyling; the existing
[phone layout](../../apps/e2e/phone-layout.spec.ts) and browser journeys stay green; the
initial bundle ceiling holds.

## 8. Phase 5 — Iterate and stop

After each group of slices (roughly one layer):

1. Re-run the full capture matrix and the core-task scripts.
2. Run a **fresh** comb on the changed surfaces with new auditors who have not seen the old
   findings. Overhauls create their own problems; this is where they surface.
3. Update the theme list and re-prioritise. **Gate 3** with the human if the direction needs
   amending — amend the decision entries, do not rewrite them.

Stop when all of these hold:

- no open S1 findings, and S2 findings below an agreed number;
- every core task at or below its baseline click count, with no dead ends;
- zero serious or critical axe violations in either theme;
- a fresh comb produces mostly S3 findings — diminishing returns.

Close the umbrella with an outcome that links the baseline and final contact sheets.

---

## Appendix — practical notes for agents

- **Look closely.** Judge crops at full resolution, not page thumbnails. Most real problems
  are 8 px misalignments, faint focus rings and labels that wrap.
- **Prefer text tools for facts, screenshots for judgement.** Use the accessibility tree and
  computed styles to verify a claim a screenshot suggests.
- **Two browsers, two jobs.** Playwright scripts for reproducible captures; the interactive
  browser for walkthroughs, where hesitation and expectation matter.
- **Brief auditors cold.** Each gets the inventory, its one lens, the finding format, the
  seeds to load, how to start the servers (`pnpm dev:web` and `pnpm dev:host` separately), and
  an instruction not to propose fixes.
- **Never trust a finding unverified.** Reproduce it before it enters synthesis; auditors are
  confidently wrong sometimes.
