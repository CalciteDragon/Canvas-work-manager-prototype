<!-- plan id="19" status="planned" summary="Milestone as a distinct model with its own service and section type — and the finding of whether it deserves to be one" -->
# Slice 19 — Milestones

## Goal

Give milestones a real service and a section, so the prototype can answer whether a
milestone is its own concept or a special task (§83).

## Spec sections

§35 (milestones), §30 (section types), §38 (timeline integration).

## Build

- `MilestoneService` in `packages/domain` over the existing `MilestoneRepository`
  interface and `Milestone` contract (title, description, targetDate, status).
- A Milestones section type in the registry, and milestone rows in the timeline and — if
  Slice 18 exists — the calendar.
- Routes and gateway methods as the section needs them; MCP tools only if an agent use
  case appears.

## Done when

A milestone can be created, dated and completed on a project canvas, appears on the
timeline, and the decision entry answering "own model, or a special task?" is written from
what using it showed.

## Do not

- Answer the model question in advance; log the finding.
- Add a milestone container to the ownership map before a container is actually wanted
  ([why](../../decisions/2026-09-sections-own-their-data.md), *Revisit when*).
