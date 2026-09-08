# Reflection subjects and the root journal feed

## Question

How should a reflection name the completed work it is about, and how should a root Reflections
page show entries that are owned by several canvases while keeping the existing container model?

## Options tested

- Resolve task and subproject names in every canvas entry. Rejected: ordinary canvases would need
  another whole-tree read and broader read grants just to show a marker.
- Copy or move entries into the Reflections page. Rejected: a reflection has one canonical
  owning container, and a derived page must not create a second copy or a second editor.
- Require the subject to remain completed forever. Rejected: reopening work must not erase its
  history or change the stored association.
- Revalidate a stored subject on every reflection edit. Rejected: editing a title or body after
  the subject is reopened or archived would make historical data impossible to maintain.
- Return detailed refusal reasons to every actor. Rejected: a write-only agent could use the
  error class or status as an existence oracle for task and subproject IDs.

## What we learned

The stored contract needs only a discriminated `{ kind, id }` subject. Eligibility is an
assignment-time rule: the subject must be currently completed, live, visible and in the same
root tree. The reflection keeps that ID when the subject is reopened or archived. The
repository-integrity check is intentionally narrower — it verifies that the referenced task
exists or that the referenced project is a subproject — so a legal reparent is not turned into a
load-time document failure.

The page is a projection, not a new owner. `ProjectJournalService` aggregates Home, the
page-owned Reflections container and descendant work canvases, carries a canonical origin for
each entry, and resolves a retained subject with its current state when it is still in the root
tree. A subject that leaves the tree keeps its stored historical link but has no resolved view.
The page composer writes to its single page container; ordinary canvases display only a neutral
linked marker. The completed-work picker is a separate read model and excludes incomplete,
archived, hidden and foreign work.

The 25.8 browser/MCP pass used the root's general entry, a completed task and a completed nested
subproject, then reopened one subject. The root feed retained the linked entry and displayed its
current state; the composer wrote to the page-owned container, and the HTTP write appeared in the
open browser surface. The ownership and retention behavior is supported, while feed density and
picker wording remain design questions.

## Current decision

Use the optional typed subject on `Reflection`, validate it only when newly assigned or changed,
and retain it through later status changes. Require `projects.read`, `tasks.read` and
`reflections.read` for the aggregate journal so origin and current subject state cannot be
partially leaked. For a caller without the subject category's read grant, collapse missing,
foreign and ineligible subject refusals to the same rule-violation response; a person with the
grant receives the specific not-found or eligibility reason. Keep the feed read-only and link to
the canonical owning canvas for editing.

## Confidence

Medium-high for ownership, retention and permission semantics: they are covered by contract,
domain, route and page-store tests and survived the integrated browser/MCP journey. Medium for the
feed density, neutral marker and picker wording after one realistic showcase pass.

## Revisit when

After a multiweek pass with several journal entries, or sooner if using a realistic root tree shows
that the origin breadcrumbs, current-state labels or single-container composer make a reflection
hard to find or understand.
