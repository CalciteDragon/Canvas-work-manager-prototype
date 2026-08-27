# A theme change lasts the session, not the persona

**Question**

§22 wants dark and light. `UserPreferences.theme` stores a persona's choice and the seeds
differ deliberately — Demo User is dark, Alex is light. When someone clicks the toggle in
the top bar, does that write back?

**Options tested**

- *Write back through a new `PATCH /api/me` or `/api/users/:id`*: rejected for now. §61's
  route list has no user-write endpoint, and adding one to serve a toggle would be the
  first write route invented by the UI rather than by the domain.
- *Persist to `localStorage`*: rejected. It would then disagree with the persona's stored
  preference, and "switch persona" (Slice 12) would stop changing the theme — which is
  exactly the thing personas exist to demonstrate (§17).
- *Session-only*: chosen. `seedFrom(identity)` reads `UserPreferences.theme` on load;
  `toggle()` overrides it until reload.

**What we learned**

Keeping it session-only kept the persona the single source of truth, which made the
Slice 6 acceptance check meaningful: loading as a light-preferring persona produces a light
app with no client state involved.

It also kept `ThemeService` to one signal and one attribute. Verified in the running app:
toggling the theme changes exactly two things in the DOM — `data-theme` on `<html>` and the
toggle's own label — while every surface repaints. That is the property §21 is really
asking for, and it is only checkable because nothing else is stored.

**Current decision**

`ThemeService.seedFrom(identity)` on load, `toggle()` for the session, no persistence.
The toggle lives in the top bar because §22 requires the shell to have one.

**Confidence**

Medium-high on the mechanism, low on the placement. Slice 12's dev panel also lists Theme
among its controls; when it lands, the top-bar toggle is a candidate to be superseded
rather than duplicated.

**Revisit when**

Slice 12 builds the dev panel — decide then whether there is one switcher or two, and
whether a *persona-level* theme change (as opposed to a session one) is worth a write route.
