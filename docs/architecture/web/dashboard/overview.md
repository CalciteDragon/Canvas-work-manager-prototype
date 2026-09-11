# Dashboard

`apps/web/src/app/features/dashboard` is `/app` (§24–§25): a widget surface answering
"what should I do today?", built from the persona's own widget list over one derived
read, `GET /api/dashboard`. Seven widgets exist — Today, Upcoming, Active Projects,
Recent Progress, Daily Digest, Fun Fact, Recent Agent Activity — each its own folder and
one line in `DASHBOARD_WIDGET_REGISTRY`, rendered in preset sizes inside a common
`DashboardWidgetFrame`.

**Code:** `apps/web/src/app/features/dashboard` and `widgets/` · **Tests:**
`dashboard-page.spec.ts`, `dashboard-store.spec.ts`, `widgets/registry.spec.ts` ·
**Parent:** [web](../overview.md)

## Responsibilities

- `DashboardStore`: join the **layout** (widgets and their config from
  `IdentityProvider`, since §25 puts them on `UserPreferences`) with the **content**
  (one gateway call whose query is merged from each visible widget's `queryFrom`).
- `DashboardPage`: render the registry's component for each visible widget in its
  `small | medium | wide | full` size; an unregistered type renders an honest note.
- Every widget has a real empty state; the digest says it is prototype-composed.
- Re-read on live frames, so an agent's completion moves Today and Recent Progress.

## Not responsible for

- Deriving the content: `DashboardService` in the [domain](../../domain/overview.md)
  computes today, upcoming, active projects, recent progress, the digest and the
  clock-keyed Fun Fact in one read, from one clock reading.
- Configuring widgets from the UI — Slice 23, a planned candidate.
- The activity feed component the agent-activity widget reuses — `features/activity`.

## Read next

- [Why it exists and is shaped this way](why.md)
- [What it is made of](what.md)
- [How it works and how to change it](how.md)
