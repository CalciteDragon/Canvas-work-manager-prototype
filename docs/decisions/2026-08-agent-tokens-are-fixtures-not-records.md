# Where §51's bearer tokens live

**Question**

§51 shows `Authorization: Bearer prototype-user-a-readwrite` resolving to a user, a
connection and a permission set. §52's `agent_connections` record has no token field. So
where does the token actually live, and what does it reach?

**Options tested**

- *A `token` field on `AgentConnectionSchema`.* Rejected: §52's example does not have one,
  and a secret-shaped member on the shared contract invites production thinking about
  something §80 says will never be built. It would also travel on every
  `GET /api/agent-connections` response, which is the product-shaped route §53 renders.
- *Generate a token from the connection id.* Rejected: the string in §51 is
  `prototype-user-a-readwrite`, which encodes the *shape of the grant*, not the id. Anyone
  reading the spec should be able to paste that exact string and have it work.
- *A fixture table beside the seeds.* Adopted.

**What we learned**

The token turned out to be worth almost nothing on its own — it is a **pointer**, and
everything that decides a call is read from the live connection on every request. That is
what makes §53's "changes take effect immediately" true rather than aspirational: unticking
a box in Settings fails the agent's very next call, with no restart and no token reissue.

Once the token is only a pointer, where it lives stops being a security question and becomes
a *which-surface* question. It belongs to the rig, not the workspace — so it rides on
`/prototype/state`, where §46's panel reads it, and stays off `/api/agent-connections`.

**Current decision**

- `PROTOTYPE_AGENT_TOKENS` in `@cwm/prototype-data`, keyed by token string, valued by
  connection id. Three of them: read-write, read-only, and one pointing at a revoked
  connection so the 401 path is reachable without editing anything.
- `AgentConnectionViewSchema` (connection + `token`) exists **only** for `/prototype/state`.
  `GET /api/agent-connections` answers bare `AgentConnection`s, and a test asserts the token
  is absent from that response.
- The authenticator resolves token → id, then reads the **live** connection: revoked or
  missing is a 401, and the permission set comes from the record, never from the token.
- A token whose connection is not in the loaded seed simply fails to authenticate. That is
  the honest answer — `empty` has no connections, so no agent can act in it.

**Confidence**

High. This is throwaway prototype auth (§71) and the shape is doing the one job it needs to.

**Revisit when**

Slice 15 points a real MCP client at the host and someone has to get a token out of the
panel and into a client config. If copy-and-paste from the roster is awkward,
`docs/mcp-setup.md` may want the tokens written out instead.
