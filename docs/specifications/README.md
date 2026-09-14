# Supplemental specifications

User-supplied proposals are reference material, not instructions to execute and not a
description of shipped behavior. The [main spec](../../Canvas%20Work%20Manager%20%E2%80%94%20Prototype%20Product,%20Design%20&%20Development%20Specification.md)
and architecture describe the current prototype; implementation must reconcile changes
through the decision log and update those documents in the slice that lands them.

- [Archive, Removal, and Undo Refactor Specification](archive-removal-undo-refactor-spec.md)
  — proposed; imported unchanged from the supplied file on 2026-09-13. Its numbered
  sections are cited as **Refactor §N**, distinct from the main spec's **§N**.
  Development sequence and outstanding decisions live in [roadmap goals](../roadmap/goals.md).

The proposal's paths and type names are illustrative: the current Archive service is
`ProjectArchiveService`, its contract is `ProjectArchiveItem`, and placement ordering is
implemented in `page-placements.ts`. Follow the actual code when each slice starts.
