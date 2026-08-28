# The dashboard splits layout from content

**Question**

§24's dashboard needs two things: *which widgets are on screen, where, and how big*
(§25's `DashboardWidget`), and *what each widget says*. Do they travel together?

**Options tested**

- *One endpoint returning widgets and their content together*: rejected. The widget list
  lives on the persona (`UserPreferences.dashboardWidgets` — see
  [dashboard widget ownership](2026-08-dashboard-widget-ownership.md)), and the
  application already has the persona from `IdentityProvider`. Returning it again would
  give one list two sources that can disagree.
- *One request per widget*: rejected. The widgets overlap heavily — the digest counts
  exactly what Today and Recent Progress list — so separate derivations over separate
  clock readings could contradict each other on screen. Built and confirmed: the digest
  saying "5 tasks are overdue" beside a Today widget listing five rows is only reliable
  because both come from the same `DashboardService.load` call.
- *Layout from the persona, content from one `GET /api/dashboard`*: chosen.

**What we learned**

Switching persona in the browser (Demo → Alex → Sam — by hand, via the `localStorage` key,
since Slice 12 owns the switcher) changed the dashboard completely with no server-side
layout concept at all, and the query the store sent changed with it
(`?upcomingDays=14` for Alex's fortnight-horizon Upcoming widget). The store never learns
what a widget's `config` means: each registry definition exposes an optional `queryFrom`,
so Upcoming's `days` and Recent Progress's `days` become two different query members
without the store knowing either exists.

The same split makes an unbuilt widget honest rather than broken. A persona carrying
`calendar` (Slice 18) renders "The calendar widget is not built yet" instead of a blank
tile — verified in the browser by unhiding Sam's calendar widget in `data.json`.

**Current decision**

Layout comes from `IdentityProvider`. Content comes from one `GET /api/dashboard` with
two optional range parameters. `DashboardWidgetDefinition.queryFrom` is the only place a
widget's config is interpreted.

**Confidence**

High for the split. Medium for the single endpoint — it is right while every widget reads
projects and tasks, and would need revisiting if a widget ever wanted something expensive
that most dashboards do not show.

**Revisit when**

Slice 13 adds Recent Agent Activity and Slice 18 adds Calendar. If either needs data the
rest of the dashboard does not, the single-request rule is what bends first.
