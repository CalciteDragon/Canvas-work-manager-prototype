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

Medium-high on the mechanism, low on the placement.

**Revisit when**

*Answered by Slice 12.* There are **two switchers over one signal**: the top-bar toggle
stays because §22 asks the shell to have one, and the development panel drives the same
`ThemeService` through a new public `set(theme)`. Two controls over one signal is not
duplicated state, so neither superseded the other.

A persona-level theme change is still **not** worth a write route. Slice 12 confirmed why:
the panel deliberately keeps the theme out of `sessionStorage` while persisting its other
settings, and switching to Alex flipped the app to light from Alex's stored preference
alone. Persisting a session override would have broken exactly that demonstration. See
[the panel surface entry](2026-08-development-panel-surface.md).

Revisit if a persona ever needs to *change* their own stored preference from inside the
app, which needs the §61 user-write route this entry rejected.
