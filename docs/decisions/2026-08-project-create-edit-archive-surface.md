# The smallest surface that makes §81's project verbs demonstrable

**Question**

§81 asks for create, open, nested, edit and archive project. Open and nested worked. The
other three did not: the only caller of `projects.create` was the sub-projects section, which
hard-codes `parentProjectId`; the header rendered name, status and target date read-only with
§26's **More** control `disabled`; and `ProjectService.archive` was reachable only from the
domain. What is the least UI that makes all three real?

**Options tested**

- *A `/projects` index route with a creation dialog*: rejected. §68's map has no `/projects`,
  and a dialog asking for §26's ten optional fields is exactly the kind of form this prototype
  exists to avoid.
- *A one-field inline form beside the sidebar's Projects header, and a **More** menu on the
  project header*: chosen. The sidebar **is** the project index, and §26 already names the
  More control — Slice 8 left it disabled for precisely this slice.
- *Adding `ProjectGateway.archive`*: rejected. `PATCH /api/projects/:id` with
  `status: 'archived'` already runs the domain's whole archive path, active-children guard and
  `project.archived` activity row included. A second method would be a second way to say the
  same thing — see
  [gateway-surface-grows-with-implementations](2026-08-gateway-surface-grows-with-implementations.md).

**What we learned**

**Three signals, not one, and each earned its place by a specific failure.**

- `sidebar.html` renders its error notice *instead of* the project tree. Routing a failed
  creation onto it would have wiped every project from navigation because one write failed. So
  `ShellStore` carries a separate `createError`, rendered beside the form.
- `project-page.html` renders `errorState` instead of the whole page. A failed rename landing
  there would blank the page the user is standing on.
- `sectionErrorState` is cleared by every successful quiet re-read, so a message parked there
  can vanish milliseconds later.

So `ProjectPageStore` gained a third signal, `writeError`, and the test that matters asserts
the **header is still rendered** beside it — a store-level test could not have seen the
difference.

**Optimistic project writes needed the same in-flight guard the section writes already had.**
`onLiveEvent` routes any `project.*` event naming the open project into `refreshProject()`,
which replaces `projectState` wholesale — so an optimistic rename is overwritten by the very
frame its own write produces. The store already carried `pendingSectionWrites` for exactly
this hazard and deliberately did not extend it to the project record. It is now one renamed
counter, `pendingWrites`, incremented by both `writingSections` and a new `writingProject`;
three check sites unchanged. Mutation-checked: removing the guard fails the test named for it.

**Status offers four values, not five.** `ProjectService.update` runs the whole archive path
on any transition into `archived`, so a status menu built naively from the enum would archive
the project with no confirmation and leave the user on a page that had just left the sidebar.
Archive is the only route to the fifth value, and it confirms.

**Two smaller findings from building it.** §26's **More** and Quick add render popovers into
the same header row, so opening either closes the other and both close on Escape. And the
More menu became its own component — `angular.json` budgets a component stylesheet at 5 kB
(error at 8 kB) and `project-page.scss` was already close, so a menu's chrome carrying its own
stylesheet is a build constraint before it is a tidiness preference.

**The one rough edge left**, found by the e2e test rather than by reasoning: the sidebar offers
**New project** before `/api/me` has answered, so clicking fast enough gets the store's honest
"there is nowhere to put a new project" instead of a project. The message is correct for a
*failed* identity, but it is the wrong answer for a *pending* one, and the web spec had to wait
for the persona's name to work around it. The message stays; the fix — disable the control
while identity is null, or have `createProject` await the in-flight load — is a §79 note rather
than a change made at the end of a slice.

**Current decision**

Create: sidebar, one field, `ShellStore.createProject` writing into the persona's own
workspace with no `parentProjectId`. Edit and archive: §26's More menu — Rename, Status
(four values), Target date (settable *and* clearable), Archive with confirmation. Rename,
status and target date are optimistic per §63; archive is awaited, because it navigates.
Stores return outcomes and pages navigate, so no store gains a `Router`.

**Using it answered the Status question, and not in the menu's favour.** The §77 pass found
two things worth §79 notes. The header already renders Status as a *fact*, and the fact is not
clickable — so you read the answer in one place and go somewhere else to change it, one click
too deep. And the whole menu is a stack of three forms plus a button rather than a menu:
renaming means opening it, typing, and pressing Rename, three deliberate acts for the most
common project edit, when `TaskRow` already demonstrates inline title editing as one act. The
menu as built is correct and demonstrable; it is not yet *good*, and the notes say which way
to move it.

**Confidence**

High on create and archive. Low on Status as a menu item — the §77 pass says make the header
fact the control.

**Revisit when**

Whoever picks up the §79 notes above does. Making the header's Status fact the control and
inline-editing the name would leave More holding only target date and archive, which is closer
to what a "More" menu should be. Also revisit when project delete, move-to-project or a
description editor is actually wanted; none of them is on §81, and all three were left out
deliberately.
