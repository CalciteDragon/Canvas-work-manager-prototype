<!-- plan id="23" status="planned" summary="Add, remove, reorder, hide and resize dashboard widgets from the UI, persisted per persona" -->
# Slice 23 — Dashboard configuration

## Goal

Let a person shape their own dashboard, so §2's "what should be configurable?" gets an
answer from use rather than from a guess.

## Spec sections

§24 (home dashboard), §25 (widget model — preset sizes only).

## Build

- Add, remove, reorder, hide and resize widgets in the UI, over the widget list that
  already lives on `UserPreferences` and reaches the page through `IdentityProvider`
  ([why](../../decisions/2026-08-dashboard-layout-and-content-split.md)).
- The one write §61 does not yet define: a route and gateway method that updates the
  persona's widget preferences.
- Still the four preset sizes; no pixel resizing unless daily use proves otherwise.

## Done when

Switching persona still restores each persona's own layout, and a layout change survives a
reload and a `pnpm dev:host` restart.

## Do not

- Add widget types (§24 already enumerates nine; the seventh to ninth arrive with their
  own slices).
- Build drag-and-drop before hide/reorder through simpler controls has been used.
