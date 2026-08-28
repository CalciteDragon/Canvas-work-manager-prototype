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

Slice 11 used it, and the payoff was the one predicted: switching persona in the browser
(Demo's six widgets → Alex's fortnight-horizon pair → Sam's single small tile) changed the
whole dashboard with no server-side layout concept at all. Nothing in `DashboardStore`
knows personas exist; it reads `preferences.dashboardWidgets` from `IdentityProvider` and
asks the gateway only for content — see
[the layout/content split](2026-08-dashboard-layout-and-content-split.md).

What it did *not* settle is whether a stored per-person layout is the right model, because
nothing in the UI writes one. Every widget's position, size and hidden flag came from seed
data, so §25's real question — "is resizing useful?" — is still untested. All four presets
do render (`wide` and `medium` on Demo, `full` on Alex, `small` on Sam), but every one of
them is a value someone typed into a seed, not a choice anyone made while using the thing.

**Current decision**

`UserPreferences.dashboardWidgets: DashboardWidget[]`, on the `User` record.

**Confidence**

Medium, unchanged after Slice 11. The placement works and is easy to move; the untested
assumption is still that a stored per-person layout is the right model at all.

**Revisit when**

Slice 23, if widget configuration in the UI is justified — and it cannot be judged until
either that slice or Slice 12's persona switcher makes a layout something a person can
actually change. If it turns out everyone's dashboard is the same, this becomes a registry
with defaults and no stored rows.
