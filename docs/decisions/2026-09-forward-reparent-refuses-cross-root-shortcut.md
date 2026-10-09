# A forward reparent refuses a Home shortcut it would carry across roots

**Question**

§26 lets a sub-project move to another root; §27 requires a Home shortcut's source and destination
to share a root tree. Slice 39 made a reparent's Undo and Redo refuse a move that would carry an
old-root placement's source across roots, but the forward `ProjectService.update` did not: on
`nested-projects`, `PATCH /api/projects/project-kitchen` to a new root reached commit-time integrity
(`section shortcut … crosses root project trees`) and answered **500 `internal_error`** (§61). What
should the forward move do?

**Options tested**

- *Refuse, naming each placement* — kept. The same rule the history executor applies, so a move and
  its reversal cannot disagree about what is legal.
- *Remove or move the placements as part of the reparent*: rejected. A cascade the caller never
  named, touching a canvas on another root and a different actor's history (§31's reasoning for not
  cascading archive).
- *Leave it to commit-time integrity and map `DocumentIntegrityError` to 409*: rejected. Integrity is
  a backstop for defects; its message names no next step, and mapping it would hide real defects.
- *A `SectionShortcutService` edge on `ProjectService`*: rejected. It is a read, and a new service
  edge is an AGENTS.md boundary change; two repository interfaces suffice.

**What we learned**

The check already existed as a private helper of the history executor. Exported as
`shortcutsCarriedAcrossRoots` in `project-history.ts`, it returns the placements; history maps them
to `shortcut-reference` conflicts and the service to a rule error. It must run after the parent is
known usable (a cycle is reported as a cycle) and before the write (afterwards both roots read the
same). The seed has two Kitchen placements, so the refusal names both.

**Current decision**

`ProjectService.update` refuses a reparent to another root while any Home shortcut not on the
destination root places a section from the subject's subtree, with a `DomainRuleError` naming every
such shortcut id and saying to remove that placement first. Nothing is written — no project, Activity
or history action. A move within one root is unaffected. HTTP answers 409 `rule_violation`; MCP's
`update_project` carries the same message text, as it does for every rule error.

**Confidence**

High for the refusal; it is what integrity already demanded. Medium on the wording — no UI offers the
removal from the move itself yet.

**Revisit when**

A move UI exists and people hit this refusal; that is the time to consider offering the placement
removal inline, as one confirmed action.

**Amended, 2026-10-03 — Slice 65.** A placement can now sit on a workstream's Work canvas, so either
end can be inside the moving subtree. The rule is now "refuse each placement with exactly one end in
the subtree". A Work placement whose source stays behind is refused, and one with both ends inside
moves with the subtree. The message no longer says "Home shortcut". See
[Work canvas shortcut destinations](2026-10-work-canvas-shortcut-destinations.md).

**Amended, 2026-10-09 — Slice 68.** This answers the "medium on the wording". Real use through HTTP
MCP (friction note `note-2026-10-03-002`) showed an id alone sent an agent searching project by
project for the placement. The refusal now describes each placement:

- **The sentence.** `shortcut "<id>" (on the <Home|Work> page of "<project>", placing "<section>"
  from "<project>") would cross root trees; remove it from that page, then retry`. Several
  placements read `shortcuts …` and `remove each from its page, then retry`. The section is named
  by `nameOf`. It names no control and no tool.
- **One helper.** `carriedShortcutsSentence` in `project-history.ts` writes it, from what
  `shortcutsCarriedAcrossRoots` already reads (it now returns `CarriedShortcut`s: the placement,
  its page and source, and each one's project). The forward refusal opens with `project "<id>"
  cannot move to another root: `; a reparent's Undo or Redo keeps its own opener. The placement
  sentence is the same, verbatim.
- **Every id is still named.** Only the descriptions are bounded: the first three placements are
  described and any further ones are listed by id.
- **History refusals.** The typed `shortcut-reference` conflicts are unchanged — no title, no new
  field. In the text, the sentence replaces their generic entries; any other conflict (a live child
  on an archive+move Redo, say) follows in the generic list (`conflictListText`), so the text never
  omits what the payload carries.
- **Accepted disclosure.** The forward write asserts only `projects.write`, so a write-only actor
  now also learns same-workspace project and section names from a refused move. Accepted: history
  refusals already name project titles to such an actor, every name is in the tree it is writing
  to, and gating the description on `projects.read` would give one refusal two shapes for no real
  protection in a single-workspace prototype. A domain test pins it.

The rule — when a move is refused — is unchanged.
