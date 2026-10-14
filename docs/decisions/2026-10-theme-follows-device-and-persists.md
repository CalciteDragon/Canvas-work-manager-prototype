# The theme follows the device preference, and an explicit choice persists

**Question**

W2-002 reproduced two problems. A phone set to light opens the app in dark. A theme chosen with
the toggle is lost on every reload. Both follow from
[a theme change lasts the session](2026-08-theme-selection-is-session-only.md), where the
persona's stored theme seeds the app and nothing persists. Gate 1 asked whether the theme
should follow the device and persist.

**Options tested**

- *Keep the persona-seeded, session-only theme*: rejected by the user at Gate 1 (2026-10-14).
- *Follow `prefers-color-scheme` and persist an explicit choice*: chosen.

**What we learned**

The earlier entry kept the persona the single source of truth, so that switching personas
visibly changed the theme (§17). That demonstration is the cost of this decision. The audit
shows the persona-seeded default reads as the app ignoring the device.

**Current decision**

- **With no explicit choice,** the theme follows `prefers-color-scheme` and updates live when
  the device setting changes.
- **An explicit choice** from the top-bar toggle or the development panel persists in this
  browser (`localStorage`, wrapped for storage failure) and wins over the device preference
  until it is cleared.
- **A way back to "follow device"** must exist. The control shape is decided in the slice.
- **Persona preference** no longer sets the theme. `UserPreferences.theme` stays in the contract
  and seeds unchanged, so no data or schema change is needed.
- **Code boundary.** `ThemeService` stays the only owner of `data-theme`.
- **Test.** The web-spec storage reset ([empty storage](2026-09-web-specs-start-with-empty-storage.md))
  keeps tests independent; specs for this behaviour set storage and the media query explicitly.

**Confidence**

High on the behaviour. Medium on dropping the persona seed entirely. If a persona demonstration
still needs it, it can return as a first-visit default beneath the device preference.

**Revisit when**

Revisit when the implementing slice's plan is reviewed, or if persona switching needs to show a
theme difference again.
