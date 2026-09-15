# Reassigning a container's rows may cross pages within a project

**Question**

Removing a container that still holds live rows takes a policy (§31): `cascade` archives them with
it, or `reassign` moves them to another container of the same type and archives the emptied
section. Slice 25.1 left an explicit question for this slice — should the destination have to be on
the **same page** as the container being removed? At the time the check would have been vacuous,
because a project had one section-bearing page. Slice 25.2 is where a root can have two.

**Options tested**

- *Require the same page*: rejected. §31 says "move them to another container of the same type"
  and states no page constraint, and there is no invariant behind one: `validateDocumentIntegrity`
  requires a row's section to belong to its project and to hold rows of its kind, and both hold
  across pages. Adding the rule would refuse a move a person can make in two steps anyway — create
  a container on the other page, reassign there — while telling them nothing about why.
- *Leave it unstated*: rejected as a way to end up here again. An absent rule and an unnoticed gap
  look the same in the code.
- *Allow it, and say so*: chosen.

**What we learned**

The question dissolves once you ask what the destination is *for*. A container renders what it
holds; a page is where that container sits. Moving rows from a Reflections container on Home to one
on the Reflections page changes which canvas shows them, which is a legitimate thing to want and
is the whole reason a root has more than one canvas.

There is one page rule that does apply, and it comes from elsewhere: the destination cannot be on a
**disabled** page, because that is a placement, and no write places content behind navigation that
is off ([why](2026-09-a-disabled-page-hides-navigation-not-data.md)).

**Current decision**

`settleRows` keeps its existing checks on a reassign target — same project, same section type, not
archived, not the section being removed — and adds only the disabled-page refusal. No page-equality
rule.

**Confidence**

Medium-high. The reasoning follows from §31's wording and from what a container is, but nothing has
used it in anger: the UI that offers reassign shows one page's containers today, so crossing pages
is currently reachable through HTTP and MCP rather than through the removal dialog.

**Revisit when**

Slice 25.3 gives the removal dialog a real choice of destination. If its picker turns out to want
one page's containers, that is a UI default rather than a domain rule — but if a person is
surprised by where their rows went, this is the entry to reopen.

**Amended, 2026-09-15 (Slice 33).** Cross-page reassignment has now been exercised with its Undo:
a Home Reflections container holding a live and an independently archived reflection was
reassigned to the Reflections page container over HTTP, both browser pages followed it, and Undo
returned both ids with the archived marker intact (`removal-undo.spec.ts`); MCP acceptance runs
same-page reassign and Undo over both transports. The removal dialog still lists one page's
containers, so the cross-page path remains API and MCP only. That is recorded as friction
(`note-2026-09-15-008`), not a change to this decision.
