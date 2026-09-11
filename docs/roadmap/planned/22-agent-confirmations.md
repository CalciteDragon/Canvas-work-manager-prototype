<!-- plan id="22" status="planned" summary="Confirmation before an agent archives or bulk-edits, using MCP's input-required pattern, behind the agentConfirmations flag" -->
# Slice 22 — Agent confirmations

## Goal

Find out which agent changes should require a person's confirmation, by making
confirmation real for a few and watching what agents and people do (§58).

## Spec sections

§58 (agent confirmation experiments), §47 (the `agentConfirmations` flag), §53
(permissions — confirmation is not a permission).

## Build

- Starting rules: create and complete a task need no confirmation; archive a task,
  archive a project and bulk changes do.
- MCP's multi-round-trip / input-required pattern rather than an invented mechanism —
  the host's MCP transport and `WorkManagerTool` carry the flow.
- A UI surface where the confirmation is asked and answered, and the activity feed
  recording who confirmed what.
- Behind the `agentConfirmations` flag, which `PrototypeSettings` already declares.

## Done when

With the flag on, an agent's `archive_project` over Streamable HTTP pauses until a person
confirms in the browser, then completes and is attributed to both; with the flag off the
call behaves as today.

## Do not

- Put confirmation logic in the domain; it is a transport-level conversation over an
  unchanged domain operation.
- Build a general approval queue or notifications.
