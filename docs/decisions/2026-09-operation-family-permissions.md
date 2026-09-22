# A history transition requires the stored operation family's write grant

**Question**

Once one history contains section, task and reflection actions, which grant should
`undo_operation` and `redo_operation` require, and what can MCP discovery truthfully advertise?

**Options tested**

- *Always require `projects.write`*: rejected. It would let a connection reverse task or reflection
  work without that category's write grant.
- *Require all three write grants*: rejected. A task action changes no section or reflection, so a
  conjunctive declaration overstates authority and shuts out deliberately narrow agents.
- *Let the caller name the family*: rejected. The authoritative family is stored in the action;
  accepting it in input creates a permission-confusion surface.
- *Resolve the action first, then assert its family grant*: adopted.

**What we learned**

A static singular or plural metadata key cannot describe a grant that depends on stored state.
The registry and transport need a third declaration shape, while enforcement must remain in the
domain. A connection with only a family write grant can still work without `projects.read`: its
write receipt starts the chain, and every transition result or refusal returns the refreshed
summary.

**Current decision**

`OperationHistoryService` maps section actions to `projects.write`, task actions to `tasks.write`,
and reflection actions to `reflections.write`, asserting that grant before execution. Summary reads
remain under `projects.read`.

`undo_operation` and `redo_operation` publish only
`_meta["local.canvas-work-manager/requiredPermissionsByOperationFamily"]` with the three-family
map. They omit the singular `requiredPermission` and conjunctive `requiredPermissions` keys.
Every other tool keeps the existing static metadata. The mapping is one shared contract used by
discovery, coverage tests and domain enforcement.

**Confidence**

High. Both transports publish the asserted map, and permission tests exercise each family with a
write-only connection and with the required grant removed.

**Revisit when**

A fourth operation family enters history, or MCP standardizes conditional permission metadata.


**Amended, 2026-09-20 — Slice 37.** A fourth family, `shortcut`, joins the map and needs
`projects.write` — the same grant `section` needs. It is named separately rather than folded into
`section` because the families are the vocabulary discovery publishes and the stored stack is
asserted against; sharing a value today should not make a later split a breaking change. Because two
families can now name one grant, the coverage helper that answers "every grant this tool can
require" de-duplicates, so `tools/list` never says a caller needs one grant twice
([decision](2026-09-section-restore-and-shortcut-history.md)).


**Amended, 2026-09-22 — Slice 38.** A fifth family, `page`, joins the map and also needs
`projects.write`: a page is a property of its root, `set_project_page_enabled` is already that
grant, and reversing a toggle — or the enable that created the tab — writes no row, so no row grant
appears. It is named separately for the same reason `shortcut` is. Discovery's family map is now
five entries in both transports, pinned explicitly rather than derived, so a family the domain gains
and discovery forgets fails a test rather than agreeing with itself
([decision](2026-09-optional-page-operation-history.md)).


**Amended, 2026-09-22 — Slice 39.** A sixth family, `project`, joins the map and needs
`projects.write`: `update_project`, `archive_project` and `restore_project` already need it, and
reversing one of them writes only that project's own fields, never a row. Discovery's family map is
six entries in both transports, again pinned explicitly
([decision](2026-09-project-update-operation-history.md)).
