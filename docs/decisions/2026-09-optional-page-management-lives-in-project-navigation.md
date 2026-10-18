# Optional page management lives in project navigation

## Question

Where should a person configure a root's optional pages, and how should that setting behave
from a nested work route when the write is asynchronous or fails?

## Options tested

- Put page toggles in a global Settings screen or the project header. Rejected: the setting is
  about the currently open root's navigation, and a person needs to understand its effect beside
  the page list.
- Make every route own its page controls. Rejected: a subproject has one required work canvas,
  while its root owns the optional pages; duplicating controls would make scope ambiguous.
- Put a **Manage pages** disclosure in the root project-navigation column. Chosen: it keeps the
  scope beside the tabs and remains available from root and descendant routes.

## What we learned

The integrated browser journey showed that the manager must be available in View Mode, keep Home
fixed, and expose only the root's optional Todos, Archive and Reflections records. A disabled-page
URL can offer one exact re-enable action; a subproject route can keep the root manager visible but
must not offer a Work toggle. Waiting for the page write and a fresh context read avoids advertising
a tab before its route is safe, and a failed write leaves the last confirmed state in place.

## Current decision

Use the root project-navigation column for **Manage pages**. Home is always checked and disabled;
the three optional root kinds are persisted checkboxes. The same root-scoped manager is available
while viewing any descendant work canvas, but Work is not toggleable. A disabled optional-page
fallback carries its exact kind to an **Enable …** action, which writes, reconciles fresh page
context, and only then navigates. The manager and fallback use the existing gateway/store write
path and expose pending, refusal and retry states.

## Confidence

Medium-high. The placement, root scope, fixed Home and confirmed-state rule survived the integrated
browser journey, keyboard pass and injected failure checks. Whether people discover the disclosure
and whether three optional pages are the right set still needs broader use.

## Revisit when

After a multiweek pass with several roots, especially if people disable pages after enabling them,
look for page controls in Settings, or cannot find **Open archive** and disabled-page recovery from
nested work routes.

**Amended, 2026-09-30 (Slice 60):** The same root-owned controls now open through the gear
beside the root name. It is a disclosure: Escape closes and focuses the gear, outside clicks
leave it open, and Home/Work scope and confirmed-state writes are unchanged. See
[navigation controls](2026-09-project-navigation-gear-and-work-create.md).

**Amended, 2026-10-14 (Slice 70 Gate 1).** Reopened by [one navigation tree](2026-10-one-navigation-tree.md): page management moves with the tree. Where it sits, labelled with its root scope, is decided in the shell slice. Auditors also found the gear hard to discover (W1-044, W2-026, W4-017).

**Amended, 2026-10-17 (Slice 74).** The Archive row now says Show Archive in navigation. A hidden Archive route renders directly, with Archive listed while current; it has no Enable offer. Other optional-page enable paths are unchanged. See [one toast with Undo](2026-10-feedback-is-one-toast-with-undo.md) and [always-visitable Archive](2026-10-archive-is-always-visitable.md).
