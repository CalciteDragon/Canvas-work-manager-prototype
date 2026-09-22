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
