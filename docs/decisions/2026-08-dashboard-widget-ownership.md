# Where dashboard widgets live

**Question**

§25 defines `DashboardWidget` with `id`, `type`, `position`, `size`, `config`, `hidden` —
and no owner. §14's `data.json` document has nine collections, none of them widgets. So
who owns a person's dashboard layout?

**Options tested**

None in use yet. Considered while writing the contracts:

- *A tenth top-level `dashboardWidgets` collection*, each row carrying a `userId`:
  rejected; it adds a collection §14 does not have, and every read would be a filter by
  the current persona anyway.
- *Derive the layout from a widget registry + defaults, storing only overrides*:
  rejected as premature — it presumes the answer to §83's "How configurable should the
  dashboard be?", which the prototype is supposed to discover.
- *On the persona*: chosen.

**What we learned**

Not yet used. What this choice buys, though, is that §17's "Switch Persona" changes the
dashboard for free — testing "empty accounts vs busy accounts" (§17) is what the personas
exist for, and a dashboard that does not vary between them would test nothing.

**Current decision**

`UserPreferences.dashboardWidgets: DashboardWidget[]`, on the `User` record.

**Confidence**

Medium. The placement is easy to move; the risk is not the location but the assumption
that a stored per-person layout is the right model at all.

**Revisit when**

Slice 11 builds the dashboard, and again at Slice 23 if widget configuration in the UI is
ever justified. If Slice 11 shows that everyone's dashboard is the same, this becomes a
registry with defaults and no stored rows.
