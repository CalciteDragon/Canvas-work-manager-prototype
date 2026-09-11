# What the tool registry knows about MCP

**Question**

Slice 14's *Build* says "contract tests calling the SDK handler in-process (§60)"; its *Do
not* says "do not start the HTTP endpoint yet — keeping the registry transport-free is the
point of this slice". Does the registry, or its test suite, take a dependency on the MCP SDK?

**Options tested**

- *Adopt the SDK now and test through an in-memory handler.* Rejected — see below.
- *Cite the "Do not" as forbidding it.* Rejected as an argument: the *Do not* forbids
  **starting an endpoint**, and an in-process handler starts nothing. It does not decide the
  question, and reaching for it would have been motivated reasoning.
- *Let Slice 15's own Build decide it.* Adopted.

**What we learned**

The deciding text is Slice 15's *Build*, which explicitly owns "Official MCP TypeScript SDK
**v2**, protocol target **2026-07-28**" and `createMcpHandler()`. Adopting the SDK here would
mean choosing a major version, a protocol constant and a handler factory inside the slice
whose stated purpose is that none of that exists yet — and Slice 14's *Done when* ("contract
tests cover every tool's success and permission-denied paths and run without a listening
port") is satisfiable without any of it. `@modelcontextprotocol/sdk` is in `pnpm-lock.yaml`
only as Angular CLI's transitive dependency, at v1.30.0; nothing in this workspace imports it.

The cost is honest and bounded: **three obligations move to Slice 15**, and are written into
its build-order entry rather than left implied.

- **`tools/list`.** This slice asserts the registry's *name set* against `SPEC_TOOL_NAMES`;
  the protocol response is the handler's.
- **Agent revocation.** This one is not a deferral of convenience. Revocation is an
  authenticate-time refusal — `PrototypeAgentAuthenticator` never mints an `ActorContext` for
  a revoked connection — so there is nothing a registry-level test could observe that
  `prototype-agent-authenticator.test.ts` does not already prove. Slice 15 is where a token
  and a handler meet for the first time.
- **§60's in-process handler path itself**, whose whole point is testing *the handler*
  without a socket.

`SPEC_TOOL_NAMES` is exported precisely so Slice 15's `tools/list` test and this slice's
registry test assert against one list across a boundary that does not exist yet.

**Current decision**

- `packages/mcp-tools` depends on `@cwm/contracts`, `@cwm/domain` and `zod`. Nothing else,
  and that is **enforced rather than observed**: its `lint` runs the same AST walker the
  domain uses, over `src/`, with its own three-module allowlist
  (`scripts/check-package-imports.mjs`, moved up from `packages/domain/scripts` and given
  `--allow`/`--label` so two packages can share one boundary checker).

  The first version of this was a regex denylist in a test. Review found it bypassable three
  ways — a relative path escaping the package, a bare builtin not on the list (`url` passed,
  `node:url` did not), and `await import(name)` with a computed specifier — which is the
  same lesson the domain's script already carries in a comment from the first time it was
  written as a ban list. An allowlist over the AST has none of those holes.
- Contract tests call `registry.call(name, input, actor)` directly.
- **`tools/list` is not filtered by the caller's grant.** A tool an agent may not call is
  still one it should see and be told, precisely, what it is missing —
  `PermissionDeniedError` names the permission because the answer is a checkbox in §53's
  grid. A filtered list would replace that with silence, and an agent cannot ask for a
  permission it has no evidence exists.
- **The registry does not check permissions.** Each tool *declares* the grant it needs, for
  `tools/list` and for a reader; the throw comes from `assertPermitted` inside the domain
  service. A second check here would be a second source of truth, and the first to drift
  would be the one no test covered. `contract.test.ts` pins declaration to enforcement from
  both sides instead.

**Two corrections to §55**, both made in the same change (AGENTS.md §2 rule 5):

- §55's `AgentContext` is `{ actor: ActorContext; services }`. The *actor* half **is**
  `ActorContext` — no `AgentContext` type exists or should, because §11 allows one
  definition of a shape and a parallel type would drift the first time an actor gained a
  field. A tool needs the services too, so the context carries both; the first draft of this
  correction said only "the context is `ActorContext`", which would have sent anyone
  implementing against it into `undefined.services`.
- §55's `execute(input: unknown, …)` receives **parsed** input. The registry validates
  against the tool's own schema before delegating; `unknown` would force every tool to parse
  its input a second time, which is the duplication §11 exists to prevent.

**Confidence**

High on the SDK deferral — the slice boundary is explicit in the build order (now `docs/roadmap/completed/`), and nothing
in the registry will have to change to be served. Medium on the unfiltered `tools/list`: it
is the right answer for a prototype whose point is to watch agents discover the permission
model, but a production tool list that advertises fourteen tools an agent can call three of
may read as noise.

**Revisit when**

Slice 15 mounts the handler. If `createMcpHandler` wants anything from a tool that
`WorkManagerTool` does not carry — output schemas, annotations, titles, a `readOnlyHint` —
that is evidence the registry was drawn slightly too small, and the entry to update.
