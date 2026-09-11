<!-- plan id="20" status="planned" summary="Subtask rendering and progress roll-up, drag ordering within a list, and move-to-project — behind the subtasks flag" -->
# Slice 20 — Subtasks and task ordering

## Goal

Make `parentTaskId` visible and useful, and give tasks an order and a way to move between
projects.

## Spec sections

§33 (task model), §34 (task interactions), §47 (the `subtasks` feature flag).

## Build

- Subtask rendering under a parent row, with subtask progress rolling up to the parent.
- Drag ordering within a Task List (Angular CDK, as the canvas already does for sections).
- Move-to-project, which `TaskService.update` refuses today with a `DomainRuleError`
  because the parent/child semantics were deferred here
  ([why](../../decisions/2026-08-task-status-transitions-and-archive.md)).
- All behind the `subtasks` flag in `PrototypeSettings`, so it can be turned off
  mid-evaluation.

## Done when

With the flag on, a subtask can be created under a task, the parent shows its roll-up, a
list can be reordered by drag and survives reload, and a task can be moved to another
project with its subtasks following. With the flag off, nothing about the Task List
changes.

## Do not

- Change contracts: `parentTaskId` and the `subtasks` flag already exist.
- Build cross-project subtasks or nested ordering across sections.
