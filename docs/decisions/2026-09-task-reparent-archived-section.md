# A task cannot follow its parent into an archived section

**Question**

May an archived child follow an archived parent into a different section that is itself archived?

**Options tested**

- Allow the archive group move: rejected because an archived section freezes row placement.
- Refuse the destination before the page check: adopted.

**What we learned**

`TaskService.update` checked the child's current section and the parent's page, but not the inherited destination section's archive state. The move could commit although task history already refused its Redo. A focused test reproduced the ordinary write before the guard.

**Current decision**

When a subtask would inherit a different section from its parent, an archived destination raises a `DomainRuleError` naming that section and asking for Restore, before any write. A live destination still allows an independently archived child to reparent beneath an archived parent with `tasks.write` alone. The current-section, live-child and disabled-page rules remain.

**Confidence**

High: the rule matches §31's section freeze and is tested through refusal, no-write and recovery.

**Revisit when**

Task moves between projects gain their own semantics in Slice 20.
