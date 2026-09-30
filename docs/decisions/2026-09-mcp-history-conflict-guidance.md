# MCP history conflicts explain their repair in words

**Question**

How does a text-only MCP client learn the repair already carried in a typed history conflict?

**Options tested**

- Require clients to decode `nextStep`: rejected because MCP transports return the refusal message, not the typed conflict payload.
- Add a new MCP field: rejected because the shared domain formatter can supply words to both transports without contract changes.
- Append words for each displayed conflict: adopted.

**What we learned**

The shared refusal formatter serves every history executor and caps display at five conflicts. Some `nothing-to-undo` and `nothing-to-restore` pairings can retire an action; a permanent conflict anywhere in the full list means retry advice for that action would be false.

**Current decision**

Each displayed conflict keeps its problem token, entity, title and id, then states the repair from `nextStep` in plain language. The two “nothing” steps also use the typed problem to distinguish missing, already live and occupied id. A permanent conflict anywhere in the list removes retry wording from every displayed repair; `history_retired:` points to the refreshed next action. Repairable lists keep retry guidance under `history_conflict:`. The typed payload, five-item cap and browser's typed rendering do not change.

**Confidence**

High for the shared mapping and retirement rule, tested across every step and both history reasons.

**Revisit when**

MCP clients receive structured refusal details directly.
