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
The full tool list remains visible even when the caller lacks a grant. Domain services still
enforce the permission and return the precise denial.

*Amended in Slice 25.5.* §54's derived pages need **more than one** grant — `get_project_todos`
requires `projects.read` and `tasks.read` — so one key can no longer carry the whole answer. The
singular key is unchanged and still carries `tool.permission`, and a second key carries the
complete list beside it:

```text
local.canvas-work-manager/requiredPermissions
```

Two keys rather than a breaking change to one, because the singular key is published metadata a
client may already read, and every tool that needs a single grant still says so there. The list
comes from `requiredPermissions(tool)` — `permission` plus the optional `additionalPermissions` —
which is also what the generic contract suite uses to deny each tool once per declared grant, so
the declaration and the test cannot drift apart. Enforcement did not move: `assertPermitted` in the
domain service is still the only refusal, and a derived page denies outright rather than answering
with the category it was allowed to read.

**Current decision**

Every advertised tool carries
`_meta["local.canvas-work-manager/requiredPermission"] = tool.permission` and
`_meta["local.canvas-work-manager/requiredPermissions"] = requiredPermissions(tool)`. Standard
annotations are left unset until a later tool-shape experiment earns them.

**Confidence**

High for the prototype. The contract test asserts the protocol response against the same
registry used by both transports.

**Revisit when**

Slice 24 measures how real clients use tool metadata, or MCP standardizes an application
permission field.
