# Undoing a first enable deletes the page it created; undoing a toggle moves one boolean

**Question**

§26 gives a root three optional tabs and creates each one's record on its **first enable**
([optional pages are created on first enable](2026-09-optional-pages-are-created-on-first-enable.md)),
while a disable is nondestructive
([a disabled page hides navigation, not data](2026-09-a-disabled-page-hides-navigation-not-data.md)).
So one call — `set_project_page_enabled`, addressed by kind — makes two different writes, and Stage C
had to make both reversible without making a page toggle a way to lose work.

Three questions came with that. What does Undo of a **creation** mean when the thing created is a
container other things can point at? Does the archive exemption that keeps Open archive reachable
also exempt a page *transition* from §31's freeze? And whose history owns the action when the
toggle was clicked from a nested work route?

**Options tested**

- *One `page.update` kind for every toggle*: rejected. The enable that created the record and the
  enable that flipped an existing boolean have different inverses — one deletes a record, one writes
  `false` — and a single kind would have to guess which at transition time, from state that may have
  changed since.
- *Undo of a first enable disables the page instead of removing it*: rejected, and this is the
  central decision. "Off" and "never existed" are different states: §26's list shows a disabled page
  so it can be switched back on, so a disable would leave the person with a tab they never made and
  a Redo that could not tell it from one they did. Slice 34's creation rule is that a creation's
  inverse removes what the creation made.
- *Removing the page and cascading whatever sits on it*: rejected outright. A page toggle must never
  delete content. The inverse is **exact removal after a preflight**, and any dependency refuses the
  whole transition.
- *Treating an archived section on the page as released*: rejected. An archived section still names
  its page, and commit-time integrity still refuses to delete a page something points at — so
  guidance to "archive it" would be advice that cannot work. The conflict says
  `remove-reference-and-retry`.
- *Cleaning up an empty retained container to make the removal possible*: rejected. §31 keeps an
  emptied container stored precisely because something still references it; opportunistically
  deleting it would turn a toggle's inverse into a content deletion.
- *Pinning a page alive because some stored action's snapshot names it*: rejected. A history
  snapshot is not stored content. A section add that has been fully undone leaves nothing dangling,
  so the page-add Undo becomes available again — which is the behaviour a person undoing their own
  steps in order expects.
- *Adopting a same-kind page created since, on Redo*: rejected. It is not the record this action
  made, and §26 gives a root one page per kind, so a replacement is a conflict — never something to
  adopt, overwrite or delete.
- *Extending the ordinary-toggle archive exemption to history*: rejected. See below.
- *Recording the action in the project whose route the toggle was clicked from*: rejected. The page
  belongs to the root; a nested work route is where the control happened to be rendered.

**What we learned**

`updatedAt` cannot take part in the creation inverse's identity check. The actor's own later toggles
bump it, and undoing them in order brings `enabled` back to `true` while leaving the newer timestamp
behind — so comparing it would make a correct Undo chain refuse its own last step. Id, owner, kind,
`createdAt` and `enabled` are compared instead; `updatedAt` is ignored.

Recording a page toggle changed an existing regression. A test had the same actor disable a page
after removing a section from it and then undo the *removal*; with the disable now recorded, that
disable is the next Undo. The case was split: the disabling toggle moved to a second actor, keeping
the "restored onto a disabled page" behaviour it was about, and a new case proves the same actor's
toggle is now the next step and that naming the removal beneath it is refused.

**The freeze distinction.** `ProjectPageService.setEnabled` stays permitted on an archived root, so
Open archive remains reachable — §31 is explicit that undo must not sit behind a toggle. That
exemption belongs to the ordinary write. A page **transition** answers `history_blocked` in both
directions on an archived root, with the blocker in the summary's `blockedBy`, exactly like every
other family. A caller who needs the tab while archived uses the toggle; history is not a way around
the freeze.

`page` is a fifth operation family sharing `projects.write` with `section` and `shortcut`: the
families are the vocabulary discovery publishes and the stack is asserted against, so a name of its
own keeps a later grant split a value change rather than a breaking one. A page action and its
transitions target the owning **project** in Activity — `ActivityEntityType` has no `page` member,
and adding one would pin every page record alive forever — so a removed page does not take its audit
history with it. `ProjectPageRepository.remove` exists for this one preflighted caller; ordinary
disabling never reaches it, and no route or tool exposes it.

**History snapshots do not pin a page.** A section another actor removed outright is gone from the
document, so it cannot block the page's creation inverse — and once that page is removed, the other
actor's later Undo of the section removal finds its original page missing. The closing review found
that this makes `resolveUndoDestination`'s missing-page fallback reachable end to end for the first
time: the section comes back on the root's canonical Home page, reported `partial` with the
`fallback-page` strategy, and the removed optional page is not recreated. That is the existing
recovery rule doing its job rather than a new one, and `page-history.test.ts` pins the journey.

This phase introduces **no new permanent-retirement rule**. Every page conflict blocks and stays
repairable, including an occupied id: the person can remove the dependency, or undo the write that
created the replacement, and try again.

**Current decision**

A toggle that changes the stored state records exactly one action in the **owning root's** history:
`page.add` when the enable created the record, `page.update` when it moved an existing boolean. A
toggle already where it was asked to go records nothing and answers a `null` receipt, changing no
timestamp, event, history revision or Redo branch. `page` is a fifth operation family needing
`projects.write`.

Undo of `page.add` deletes exactly the record the enable created — after checking its id, owner,
kind, `createdAt` and `enabled` state, and after proving that no section, live or archived, and no
shortcut placement names the page. Any dependency refuses the whole transition with
`remove-reference-and-retry`, and nothing is cleaned up on its behalf. Redo recreates the same id
and `createdAt`, stamping only `updatedAt`; a same-kind page created since is a conflict.

Undo and Redo of `page.update` write `enabled` and `updatedAt` and nothing else, so sections, layout,
rows and shortcut sources survive both directions, archived content included. Later unrelated content
on the page is no reason to refuse.

The ordinary toggle stays permitted on an archived root; the transitions do not, in either direction.
Page actions and transitions target the owning project in Activity, and no page conflict is permanent.

**Confidence**

High for the semantics: every rule above has a named regression, the file-backed host suite injects
recorder, action-update, cursor-update and persist failures in both directions and asserts that the
bytes on disk, the history and the event feed are untouched, and both MCP transports plus the HTTP
acceptance script drive the full chains end to end. Lower for the **surface**, as in Slice 37: a
person still reaches these transitions through the history route rather than through the product,
because persistent Undo/Redo controls are deliberately a later phase.

**Revisit when**

Persistent Undo/Redo header controls arrive and have to say which page a receipt is about; when
project lifecycle joins history, where a creation Undo must ship with its authorized recovery route;
or if §26 ever gains a fourth optional page, which is one entry in `OPTIONAL_PAGE_KINDS` and no new
rule here.
