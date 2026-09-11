# Why the dashboard is shaped this way

## The problem it solves

§24 asks what information is genuinely useful each day and which AI-generated widgets
provide value — questions that need several candidate widgets that can be shown, hidden
and reordered per persona without a code change (§25). And the widgets overlap: the
digest counts exactly what Today lists, so they must agree on screen.

## Forces

- **Overlapping widgets must not contradict each other.** Separate derivations over
  separate clock readings could show "3 due today" beside a list of four.
- **Widget config is opaque outside the widget that owns it** (§25).
- **Preset sizes only** (§25) — pixel resizing is a question for later, if ever.
- **AI must never be required** (§44), and Fun Fact is not AI (§24).

## The shape, and the alternatives rejected

**Layout and content are split.** The widget list comes from `IdentityProvider`
(`UserPreferences.dashboardWidgets`), the content from one `GET /api/dashboard`
whose query is merged from each visible widget's `queryFrom`. Switching persona changes
the dashboard without the store knowing personas exist
([decision](../../../decisions/2026-08-dashboard-layout-and-content-split.md)).
Rejected: one request per widget — the overlap problem above, and a waterfall on load.

**One folder per widget, one registry line**, mirroring §29's section registry; the
registry spec pins the list so a change is deliberate; all widgets share
`widget-content.scss` because their bodies are alike enough that per-widget stylesheets
would drift ([decision](../../../decisions/2026-08-dashboard-widget-ownership.md)).

**`queryFrom` keeps config opaque.** The store merges whatever each visible widget asks
for and never learns that "days" means two different query keys for two widgets.

**Fun Fact is a clock-keyed fixture rotation in `DashboardService`, not an `AIProvider`
call.** §42 pins the provider to two methods and §24 does not call Fun Fact
AI-generated ([decision](../../../decisions/2026-08-prototype-ai-scope-and-fun-fact.md)).

**A single read fails as a whole.** With `PROTOTYPE_AI_PROVIDER=real` the stub throws,
the digest is part of the one read, and `/app` shows an error and no widgets. That is
the price of the single-read design, accepted because `mock` is the default and real AI
is never required.

## Consequences

- The dashboard's content changes meaningfully with the simulated date and the loaded
  seed — Slice 11's *done when*, and the reason the date control was the panel's most
  wanted feature.
- Adding a widget is a folder and a line; widgets 8 and 9 of §24's nine need no contract
  change because `DashboardWidgetType` already enumerates them.
- Per-persona configuration from the UI (Slice 23) is a write §61 does not define yet;
  the layout side is already in place for it.

## Decisions that shape this system

- [The dashboard splits layout from content](../../../decisions/2026-08-dashboard-layout-and-content-split.md)
- [Where dashboard widgets live](../../../decisions/2026-08-dashboard-widget-ownership.md)
- [What counts as AI in the prototype](../../../decisions/2026-08-prototype-ai-scope-and-fun-fact.md)
- [The activity feed composes its line](../../../decisions/2026-08-activity-feed-composes-from-parts.md) — the agent-activity widget

## Spec sections

§24 home dashboard · §25 widget model · §42–§44 AI architecture, prototype AI, optional
real AI · §45 time · §57 agent activity.
