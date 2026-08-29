# Stdio uses an environment token and reloads identity per call

**Question**

How does a headerless stdio process authenticate, and how can a long-lived connection see a
permission edit or revocation made by the HTTP/UI host?

**Options tested**

- Authenticate `CWM_MCP_TOKEN` once at process startup. Rejected: it freezes the
  `ActorContext`, and the child's already-loaded JSON store never sees later host writes.
- Reload the file-backed graph and authenticate before every tool call. Adopted: the next
  call sees host-side permission changes and revocation without transport-specific domain
  rules.
- Add cross-process locking, a database, or a coordination service. Rejected by §71 and §80.

**What we learned**

Stdio has no HTTP Authorization header, so the spawning client supplies the raw fixture
token as `CWM_MCP_TOKEN`; the adapter feeds `Bearer <token>` through the existing
`PrototypeAgentAuthenticator`. The official `serveStdio` factory is connection-pinned, so
freshness must live in the registered tool's invocation resolver, not in the transport
factory.

Reloading solves only host-to-stdio visibility. The running HTTP/UI host still owns an
independent in-memory `JsonDataStore`: it cannot see a stdio-created task, and its later
write can overwrite that task. This is more than a vague race; it is a reproducible lost
update when mutation-capable processes share one file.

**Current decision**

- `CWM_MCP_TOKEN` is required for stdio.
- Every stdio tool call reloads `CWM_DATA_FILE`, rebuilds the domain graph and registry, and
  authenticates before execution.
- Mutation-capable stdio and HTTP/UI sessions must not run concurrently against the same
  data file. Stop the host for stdio mutations, then restart it afterwards. Acceptance uses
  separate files for the two transports.

**Confidence**

High on authentication and revocation; a long-lived real client test proves the next call
is refused after an external revocation. High that the concurrency limitation is real.

**Revisit when**

The prototype needs simultaneous mutation from multiple processes. That is an architecture
finding, not permission to build production persistence inside this prototype.
