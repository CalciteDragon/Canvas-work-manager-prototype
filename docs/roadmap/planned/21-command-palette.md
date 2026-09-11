<!-- plan id="21" status="planned" summary="Ctrl/Cmd+K palette over the existing operations, plus the search page §40 promised — evidence for which MCP tools should exist" -->
# Slice 21 — Command palette

## Goal

One keyboard surface for the actions people reach for, so the prototype can observe which
ones they actually reach for (§41).

## Spec sections

§41 (command palette), §40 (search — it has no slice of its own; the `/search` route is a
placeholder until this one).

## Build

- Ctrl/Cmd+K palette: open project, create task, create project, search, go to calendar,
  add reflection, toggle project editing.
- The `/search` page over `WorkspaceService`'s search, which already backs
  `search_workspace` — reflection text matching may want to move from the service into
  `ReflectionQuery` here ([Slice 14's deferral](../completed/14-tool-registry-contract-tests.md)).
- A decision entry recording which actions were used, as §41 asks: that list is evidence
  for which MCP tools should exist.

## Done when

Every listed action works from the palette on the `busy-week` seed, search finds a task
and a reflection by substring, and the usage finding is written down.

## Do not

- Add actions beyond §41's list before use asks for them.
- Duplicate search logic in the web app; it reads through the gateway.
