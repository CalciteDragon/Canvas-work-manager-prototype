<!-- plan id="24" status="planned" summary="AI Summary section behind aiSummarySections, and the §56 tool-shape experiments run against real clients" -->
# Slice 24 — AI project summaries and tool experiments

## Goal

Two experiments that need real agents to answer: whether an AI-generated project summary
is worth a section, and which tool shapes agents use reliably (§56).

## Spec sections

§42 (AI feature architecture), §43 (prototype AI), §56 (MCP tool experiments), §47 (the
`aiSummarySections` flag).

## Build

- `generateProjectSummary` — already implemented on `AIProvider` with no caller — behind
  an AI Summary section type, gated by `aiSummarySections`.
- The §56 experiments, each as a pair of tool variants in the registry:
  `complete_task(id)` versus `update_task(id, status)`; separate `find_project` /
  `find_task` versus the combined `search_workspace`; and the `rename_section` shape
  [Slice U2 deferred](../completed/2026-09-section-names-implementation.md).
- Real clients driven at both variants, and a decision entry per experiment saying which
  agents used more reliably and why.

## Done when

The AI Summary section renders the mock provider's deterministic summary for a seeded
project, each experiment has been run against at least two real MCP clients, and the
findings are decision entries.

## Do not

- Require a real AI provider; `mock` stays the default (§44).
- Keep both variants of a tool once the experiment has answered — delete the loser.
