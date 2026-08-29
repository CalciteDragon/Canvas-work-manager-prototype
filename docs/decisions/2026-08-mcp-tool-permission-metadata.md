# MCP tools advertise their required permission in namespaced metadata

**Question**

How does an MCP client learn the permission declared by each Slice 14 tool?

**Options tested**

- Use standard MCP tool annotations. Rejected: none represents an application permission,
  and overloading `readOnlyHint` or `destructiveHint` would make a false protocol claim.
- Omit the permission and let denied calls explain it. Rejected: the registry field exists
  for `tools/list`, and omission would erase it at the transport boundary.
- Publish namespaced Tool `_meta`. Adopted.

**What we learned**

The official v2 SDK passes custom Tool metadata through `tools/list`. Protocol 2026-07-28
recommends reverse-DNS-style implementation prefixes, so the deliberately local prototype
key is:

```text
local.canvas-work-manager/requiredPermission
```

The value comes directly from `WorkManagerTool.permission`; there is no second mapping.
The full fourteen-tool list remains visible even when the caller lacks a grant. Domain
services still enforce the permission and return the precise denial.

**Current decision**

Every advertised tool carries
`_meta["local.canvas-work-manager/requiredPermission"] = tool.permission`. Standard
annotations are left unset until a later tool-shape experiment earns them.

**Confidence**

High for the prototype. The contract test asserts the protocol response against the same
registry used by both transports.

**Revisit when**

Slice 24 measures how real clients use tool metadata, or MCP standardizes an application
permission field.
