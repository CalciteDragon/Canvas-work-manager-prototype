# Live updates reach the browser over HTTP, and not over stdio

**Question**

§59 requires the MCP tool surface to be identical over Streamable HTTP and stdio, and Slice
15 delivered that. §62 requires an agent's change to appear in the open browser. Does a task
completed by `pnpm mcp:stdio` tick the checkbox in a running UI?

**Options tested**

- *A file watcher on `.prototype/data.json`.* Rejected — see below.
- *An inter-process channel: a socket, a named pipe, or the stdio process posting to the
  running host.* Rejected as the "real-time synchronization infrastructure" §62 explicitly
  rules out, and as work whose whole payoff is a configuration §80 already discourages.
- *Accept it, document it, and keep the existing guidance.* Adopted.

**What we learned**

`pnpm mcp:stdio` is a separate OS process with its own `JsonDataStore`. Slice 15 already
documented the consequence — two processes with independently cached documents can lose each
other's writes — and `docs/mcp-setup.md` already tells the reader to use the HTTP transport
whenever the UI is open. Live updates do not add a *new* limitation; they add a second,
much more visible symptom of the one that is already there.

That visibility is the useful part. Before this slice, running stdio beside the UI produced
a silent lost update you would find later, in the file. Now it also produces a browser that
sits there not updating, which is a far better prompt to go and read the setup guide.

A file watcher was the tempting middle path and is the wrong one. It would fire on the host's
*own* writes as readily as on the other process's; it would fire mid-`rename` on a partially
visible document; and it would give a frame no `workspaceId`, no `entityId` and no way to say
what changed — so every tab would do a full re-read on every write anyone made. That is
periodic refresh with extra steps, and §62 already offers periodic refresh as the option it
does not recommend.

**Current decision**

- §62's stream is a property of the HTTP transport. One process owns the document and the
  hub; the browser and the HTTP MCP endpoint are both clients of it (§6's diagram, exactly).
- `docs/mcp-setup.md` says so, beside the existing concurrency guidance.
- `pnpm mcp:stdio` remains the way to point a client at the workspace when the UI is *not*
  open — which is what it is for.

**Confidence**

High. The alternative is infrastructure the spec forbids, in service of a configuration the
setup guide already advises against.

**Revisit when**

A real client can only speak stdio *and* someone needs the UI open beside it. The cheapest
honest answer then is not a watcher but a proxy: a stdio entry point that forwards to the
running HTTP host instead of opening its own store — one process still owns the data, and
the hub keeps working unchanged.
