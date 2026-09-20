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
