<!-- plan id="79" status="planned" summary="Redesign slice 6b-2 (TH10): first-run dashboard, archived pages read-only with restore in place, archive refusal said before, Markdown drafts kept, digest overdue line, Task List count" -->
# Slice 79 — States: empty, archived and editing

<!-- The first line is the state marker; scripts/roadmap.mjs owns it. While the plan is in
     planned/ keep only the first five sections and keep them short. When it starts (roadmap.mjs
     start), write the rest per AGENTS.md step 1, then revise it through review (step 2) and
     record the rounds under Revisions. Before roadmap.mjs complete, write Outcome. -->

Redesign slice 6b-2 under the [UI/UX overhaul umbrella](../active/70-ui-ux-overhaul.md). It follows
[Slice 78](../active/78-failures-and-loading.md) (6b-1, failures and loading). The user split 6b
on 2026-10-29 and answered the shape questions below on the same day. The protocol §8 comb runs
after this slice closes.

## Goal

Empty states offer the next step, and archived work reads as archived and does not invite edits it
will refuse. A refusal is said before the user commits, and typed prose is never lost to Cancel or
navigation (direction principles 3, 4 and 6).

## Spec sections

- **§21** the empty and archived variants of slice 78's `.state-message`.
- **§23** the sidebar: archived-only wording.
- **§24** Home: first-run content and the digest's overdue line.
- **§26 and §31** archived projects and their page.
- **§27** the Markdown editor.
- **§34** the Task List count.
- **§63, §67, §69, §77, §78.**

## Build

- **First run** (W1-001, W4-001, L4-020): an empty workspace's Home says what the product is for
  and offers New project in the main column.
- **Sidebar after archiving** (W4-034): "No active projects", with a pointer to Settings ›
  Archived projects.
- **Archived pages are read-only, with a banner** (L4-007, L1-028). This is the user's choice. A
  banner says the project, or its archived root, is archived, and offers the restore status choice
  in place. The canvas renders its sections read-only, as shortcut content already can, and the
  add, edit, drag and delete controls go. Rename and reparent-away stay, because they are the escape
  hatch in
  [reactivating under an archived ancestor](../../decisions/2026-09-reactivating-under-an-archived-ancestor.md).
  Amend that entry and
  [nesting and archive rules](../../decisions/2026-08-project-nesting-and-archive-rules.md).
- **The archive refusal comes first** (L4-008). This is the user's choice. The Archive
  confirmation knows when live workstreams block it. It names them as links, says to archive them
  first, and offers no commit. The domain rule does not change, and there is no cascade.
  Slice 78 left the refusal that still reaches the header saying "Couldn’t archive “X”. Try
  again." (`projectWriteSentence` in `project-workspace-store.ts`), with the reason under
  Details. "Try again" invites a retry that cannot succeed, so 79 words it with the rest.
- **Restore works one way** (L4-012): the same status choice and option casing on Archive and on
  Settings › Archived projects.
- **The digest's overdue line leads to the tasks** (W4-028).
- **Markdown keeps the draft** (L3-012, W4-031). This is the user's choice. A draft discarded by
  Cancel or abandoned by navigation is kept per section for the session and offered when Edit is
  pressed again. Save becomes the primary button. Preview is marked as unsaved.
- **The Task List shows its count** (L4-023's count half).
- **Carried candidates:**
  - reserve the drag explanation's space, so the list does not jump (`note-2026-10-22-002`);
  - Todos' workstream Complete keeps a native `[disabled]` (slice 75 deferral). Decide it with the
    archived and disabled-state rules.

## Done when

Every finding above closes on its before/after pair. T01–T12 cost no more than slice 78's counts.
`pnpm test`, `pnpm lint`, `pnpm e2e` and the Storybook build pass, under the 1150 kB ceiling. The
user accepts the sheet at Gate 2.

## Do not

- Re-plan slice 78's failure, loading or not-found work.
- Cascade an archive.
- Add task reordering or completed-task grouping (Slice 20).
- Change navigation (slice 7), the agent card (slice 8) or default names (slice 9).
- Run the §8 comb inside this slice; it is the umbrella's next step.
