# Connecting an agent becomes a product surface in Settings › AI & Agents

**Question**

Every Slice 70 walkthrough auditor was blocked on T10, "connect a new agent", for every persona
and every input mode. This produced all five S1 findings: W1-052, W2-031, W3-020, W4-023 and
L7-015. Product Settings manages existing connections (§53). Connection tokens are fixtures,
shown only in the development panel's roster
([tokens](2026-08-agent-tokens-are-fixtures-not-records.md),
[roster](2026-08-agent-connection-panel-control-is-a-roster.md)). Should connecting be part of
the product?

**Options tested**

- *Keep connecting in the development panel*: rejected. It is the only S1 in the audit, and the
  page's own copy, "what each connected agent is allowed to do", implies agents simply appear.
- *Add a product surface*: chosen by the user at Gate 1 (2026-10-14).

**What we learned**

The connection record has no token field, by design. Tokens are fixtures that point to a
connection and its grant. The page's empty state tells users to load the `agent-heavy` seed
from the development panel. It does that even when that seed is already loaded, for personas
it gives nothing (W4-022).

**Current decision**

Settings › AI & Agents gains a way to connect a new agent. The user names it, chooses its
permissions, and is shown how to point an MCP client at the prototype.

- **Prototype shape only.** This stays within §80: no production OAuth, and the token stays
  inside the prototype's fake auth.
- **Real scope beyond the web app.** The work crosses contracts, domain, host and seeds, unlike
  the visual slices. It is planned as its own slice, with its own Gate 1-style scope review,
  and is not folded into a restyle.
- **Where the token lives** is that slice's first design question: a host-issued fixture added
  beside the seeds, or a token reference on the record. It amends the two entries above when
  answered.

**Confidence**

High that it belongs in the product. Low on the token mechanism until that slice reads §50–§54
again.

**Revisit when**

Revisit when that slice's plan is reviewed, or if the token mechanism would require anything
§80 forbids.
