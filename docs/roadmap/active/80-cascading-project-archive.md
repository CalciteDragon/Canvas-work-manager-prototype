<!-- plan id="80" status="active" summary="An explicit, confirmed “Archive X and its N workstreams”, with a matching restore that brings back only what was archived with it" -->
# Slice 80 — Cascading project archive

**State (2026-11-05):** first draft written (session S80PLAN); review rounds have not run. No
implementation has started. **Next** is cold review (AGENTS.md step 2), then the user's acceptance
and answers to the Open questions, then step 0.

## Goal

Let a person or an agent archive a project together with the live workstreams beneath it, through
an explicit, confirmed "Archive X and its N workstreams", and let every restore of X bring back
exactly what was archived with it.

**Settled by the user (2026-11-05) and not re-opened here:** the cascade exists, it is explicit and
confirmed, and the restore is matching. This reverses the no-cascade rule of Slice 25.0, spec §31,
and Slice 79's blocked confirmation.

## Spec sections

- **§31** ("Where archived work is found", "None of this adds a cascade…"): the text this slice
  reverses, and the recovery rules it must keep: Archive lists the highest ready owner, a separately
  archived child stays archived, and a restore takes an explicit status.
- **§26** (project header, More, the archive confirmation, status and `completedAt`, project
  history): the confirmation's words; an archive stays on the page with Undo; "A completion time
  comes back exactly as it was recorded"; one call records one action in the subject's own history.
- **§23** (Settings › Archived projects, the restore choice, the banner, read-only pages): where
  restore happens and what it says.
- **§39, §45, §12, §14, §54, §58, §61, §71, §77, §78, §80**: history and receipts; `Clock`; the
  service graph; the one data file; MCP tools; agent confirmation (`archive project → confirmation`,
  still Slice 22's); §61's live frames; what is disposable; intent changes test, code and docs; the
  decision log; what is never built.

## Build

The design, as rules. The tests, the file list and the steps below all cite these by number.

### R1 — What comes down

- **The whole live subtree of the project**, at any depth, in one unit of work. "Live" is any status
  but `archived`, so a **completed** workstream comes down too and the confirmation shows it as
  Completed.
- **Direct children alone would be wrong, not just smaller.** A live grandchild under a child
  archived with its parent is the "live, hidden and refused by every write" trap that
  [reactivating under an archived ancestor](../../decisions/2026-09-reactivating-under-an-archived-ancestor.md)
  exists to prevent.
- **The walk stops at an archived node.** A workstream already archived in its own right is not
  touched, keeps no new marker, and nothing beneath it is visited. On `nested-projects`, archiving
  Home renovation names Kitchen, Cabinets and Garden (3), and leaves Legacy attic and the live
  Legacy shelving beneath it exactly as they are.

### R2 — The caller names what comes down

The old objection to a cascade is that it "archives work the caller never named". So the caller
names it.

- A new optional input, `archiveWorkstreamIds: ProjectId[]`, is accepted by
  `UpdateProjectInputSchema` (so `PATCH` and `update_project` carry it) and by `archive_project`.
- On a transition into `archived` the domain compares the named ids with the walk in R1 **as an
  exact set**. Any difference is a `DomainRuleError`, nothing written: a live workstream not named,
  or a named id that is not one.
- **Without the input, a project with live workstreams still refuses**, keeping the existing
  message's prefix: `project "<id>" still has active workstreams: "Kitchen" [project-kitchen], …`.
  The message now names each one with its id, so an agent can repair in one call. So a bare `PATCH
  { status: 'archived' }`, and every existing refusal test, hold unchanged.
- Sent on anything but an archive transition, the input is refused, with one exception: on a project
  that is already archived, `{ status: 'archived', archiveWorkstreamIds }` stays the idempotent
  no-op an uncertain retry needs (`operation: null`), whatever the list says.
- `assertNoActiveChildren` becomes `assertNamedWorkstreams`. Grant: `projects.write` alone, as today.

### R3 — The marker

`SubprojectSchema` gains one optional field; `RootProjectSchema` declares it explicitly absent, as it
does `parentProjectId`, because a root has no ancestor to come down with:

```ts
archivedWithProject?: { projectId: ProjectId; status: ProjectRestoreStatus; completedAt?: IsoDateTime }
```

- `projectId` is the **owner**: the project the caller archived, never the intermediate parent. This
  matches `archivedWithTaskId`, which holds the root of the cascade, so restore is one lookup.
- `status` and `completedAt` are what the workstream was, because history is per actor and can
  expire, while Restore "needs no receipt to call, however long ago". The owner carries no marker; it
  takes the status the restore names, as today.
- Archiving a workstream as part of a group sets `status: 'archived'`, removes `completedAt`, sets
  the marker and stamps `updatedAt`. No other field moves.

**Structural invariant**, enforced at commit by R9: a marked project is archived; its parent is either
the owner or carries the same owner; the owner is archived and unmarked. It holds inductively because
of R1 (the walk stops at archived), R5 (a marked project does not move or change status alone) and the
existing refusals of creating or reparenting under anything archived.

### R4 — Restore

**One rule, in `ProjectService.update`**, on the transition out of `archived`: every project marked
with this owner returns to its recorded `status` and `completedAt`, verbatim (subject to Open
question 2), and loses its marker. Nothing unmarked changes, so a separately archived workstream stays
archived and becomes the next listed owner, as §31 already says.

The domain owns this, so no entry point needs code to make it true:

| Entry point | Path today | After this slice |
|---|---|---|
| Banner (`restoreOwner`) | `projects.update(owner, { status })` | Same call; patches `cascaded` into the page's `project` and `ancestors` (R6, R10) |
| Root Archive row (`archive-page-store`) | same | Same call; the row says what comes back; the toast counts it |
| Settings › Archived projects | same | Same call; the row says what comes back; the toast counts it |
| More › status buttons on the owner | `store.setStatus` → same | Same call; revives the group. On a **marked** project the buttons are absent (R5) |
| MCP `restore_project`, `update_project` | `services.projects.update` | Same call; the description and answer say what came back |
| Header or toast Undo of the archive | `revertProjectWrite` | Group restored by R6, strictly |

A restore still refused (the owner has an archived ancestor) changes nothing and keeps every marker.
A restore repeated after success is today's no-op.

### R5 — A workstream that came down does not leave alone

While a project carries a marker, `ProjectService.update` **refuses a status change and any reparent
on it**, before the existing checks, naming the owner: `project "<id>" was archived with "<owner>";
restore "<owner>" to bring it back`. Rename and the other fields stay allowed, as they are on any
archived project (so the edit's Undo waits for the owner, as today). This is the rule tasks already
follow (a row under an archived parent refuses its own Restore; Archive hides it) and it is what keeps
R3's invariant simple. **It narrows an escape hatch**: today's "reactivate and move to a live parent in
one call" stays available to a project archived in its own right, and not to a marked one. See Open
question 3. The owner itself may still be renamed or moved, and its group moves with it. In the web,
More's status buttons are absent on a marked project, following Slice 79's rule that a control that
can only be refused is absent. Archive and Settings already list only the outermost owner, so neither
offers the child.

### R6 — History

One action, in the **owner's** history for the acting actor, whatever the group's size. The workstreams
gain no action of their own, and their histories are untouched. Their steps are already blocked while
the owner is archived (`transitionBlocker` walks ancestors), and because restore puts status and
`completedAt` back verbatim, those older steps still match once it returns.

- `ProjectArchiveOperationSchema` and `ProjectReactivateOperationSchema` gain an optional
  `workstreams: [{ projectId, status, completedAt? }]`, `.min(1)` when present and **omitted when
  there is no group**, so a plain archive's stored shape, its receipt tests and old stored actions
  are unchanged. `project.update` never has one. `version` stays 1.
- `ProjectUndoResult` and `RedoResult` for those two types, and `ProjectWriteResult`, gain optional
  `cascaded: Project[]`: the workstreams this write changed, final records, absent when none. Label:
  `Archived "Kitchen" and 1 workstream` / `Reactivated "Kitchen" and 3 workstreams`. The Activity
  summary and the Undo or Redo line follow the same form.

**The two directions.** Each is an all-or-nothing preflight in `writeProject`, after its existing
checks, and refuses with the existing typed conflicts. None is permanent; each describes a state
someone can put back.

| Direction | Which | Refuses when (conflict) |
|---|---|---|
| **Bring back** | Undo of archive, Redo of reactivate | A recorded workstream is gone (`missing`); or is not archived, or is no longer marked with this owner at its recorded status (`archive-state-changed`); or **any project is marked with this owner and is not recorded** (`new-dependent`), since leaving it marked under a live owner would break R3 |
| **Take down** | Redo of archive, Undo of reactivate | A recorded workstream is gone (`missing`); or its status or `completedAt` no longer match the record, or it carries a marker (`archive-state-changed`); or it is no longer in the subject's subtree (`reparented`); or **any live project in R1's walk is not recorded** (`new-dependent`) |

So a history step never sweeps in a workstream added since, as `section.remove`'s Redo already refuses
a task added since. A plain archive's Redo with a new live child keeps today's refusal exactly (the
tests at `project-history.test.ts:472`, `:633`, `:825` stay as they are). An unrelated edit to a
workstream, such as a rename, survives both directions.

The history doc comment's "archiving never cascades, and a history step must not acquire one" becomes
"a history step moves exactly its recorded group".

### R7 — Activity and live frames

**One Activity line per write**, on the owner, as `ProjectService.update` promises ("one Activity
event, and one history action"), naming the count. This is a default, not a product answer anyone
asked for: a workstream's own Recent Activity will not show the archive; its banner does.

No frame changes are needed. `isProjectRecordEvent` already makes every open project page and root
aggregate re-read on any project-record frame in the workspace
(`project-workspace-store.ts:206`), and `shell-store.ts:154` re-reads on any `project.*`.

### R8 — Read models

- **`asRestored`** (`project-visibility.ts:160`) reads the root live and **every project marked with
  the root at its recorded status**, or an archived root's "Restore to view N hidden todos." would
  undercount by everything that came down with it. Work archived in its own right stays out, as
  today. Its contract comments stay true and get one clause.
- **`ProjectArchiveSubprojectItemSchema`** and **`ArchivedProjectsResultSchema` items** gain required
  `cascadeCount: number`: the projects marked with this owner, named after the section item's field of
  the same meaning. `ProjectArchiveService` and `ArchivedProjectsService` compute it from the project
  list they already read. Result-level refinements are unchanged.
- `restore-eligibility.ts`, `archivedAncestry`, dashboard, search, shortcuts (`source_hidden`) and
  Upcoming answer by status and ancestry, so they already give the right answer and only their comments
  go stale.

### R9 — Integrity, data and seeds

- `validateDocumentIntegrity` gains the marker rules of R3 beside the project loop
  (`data-store.ts:199-206`), mirroring the task rules at `:388-416`.
- **No migration and no `SCHEMA_VERSION` bump.** Every new stored field is optional, so an existing
  document still reads, and every project archived in it is correctly "archived in its own right"
  because it has no marker. Stored `project.archive` actions have no `workstreams`, which is correct
  for what they did. This stays within
  [prototype data is disposable](../../decisions/2026-10-prototype-data-is-disposable.md): no converter,
  nothing to refuse.
- **No seed changes.** `nested-projects` already has the shape (Kitchen → Cabinets, Garden completed,
  Legacy archived with a live child). The cascade is made by using it, in tests through the host API, as
  Slice 79's fixtures are. `project-legacy-child`, the live child under an unmarked archive, stays as the
  one trap-state fixture.
- `Project-legacy` stays unmarked, so the Legacy attic banner and its Slice 79 sentences are unchanged.

### R10 — Web

**The confirmation** (`ProjectArchiveConfirm`, in its deferred chunk).

- The blocked form and its links go. There is one form, with or without a list.
- `liveDescendantsOf(store)` replaces `liveChildrenOf`: a depth-first walk of `subprojectTree()` from the
  routed project. The tree is built from non-archived statuses and the domain hides live work under
  archived ancestors, so its walk already stops where R1's does.
- `archive` becomes `(workstreamIds: ProjectId[]) => Promise<boolean>`. The dialog passes **the ids on
  screen at the press**, so what the person sees is what is named, and a live frame while the dialog is
  open updates both together.
- List rows are static text with the status, indented by depth. Following a link out of a danger
  confirmation has no job left to do, so they are not links.

**The late refusal.** When the list is stale or the tree cannot say (an agent's new workstream, a failed
read), the set does not match and the domain refuses. The dialog closes, as it does today, the sentence
in `projectWriteSentence` changes (see the copy table), the reason stays under Details, and
`refreshContext()` re-reads so the next confirmation shows the true list. It never says Try again. The
narrow trap state (a live project with live children, hidden under an archived ancestor, so no tree
holds them) keeps today's behaviour of being refused and needs its ancestor restored first.

**Restore.**

- `restoreOwner` patches `cascaded` as well as the restored record into `projectState` and
  `ancestorsState`. Otherwise, on Cabinets, restoring Kitchen would leave Cabinets archived in the local
  state, so `archivedOwner` would move to Cabinets and focus its restore choice, which would then vanish
  when the frame lands.
- The banner reads `gateway.projects.archived()` in its own chunk for the owner's `cascadeCount`. The
  store does not hold archived descendants, by design (`NAVIGABLE_STATUSES`). A failed read leaves the
  sentence without a count. The banner tells a marked project apart from a separately archived one only
  when its marker names the current owner.
- Archive and Settings rows add one quiet line when `cascadeCount > 0`. Toasts count `cascaded`.
- More's status buttons are absent on a marked project (R5).
- `liveChildrenOf`'s file is renamed; `WORKSPACE_TREE` stays.

**Copy** (Open question 5 asks the user to accept or change these; none is final until then):

| Where | Text |
|---|---|
| Confirmation title, no workstreams | `Archive “X”?` (unchanged) |
| Confirmation body, no workstreams | `It leaves the sidebar; you can undo it from the header.` (unchanged) |
| Confirmation title, N | `Archive “Kitchen” and its 1 workstream?` / `Archive “Home renovation” and its 3 workstreams?` |
| Confirmation body, N | `They leave the sidebar together. You can undo it from the header, and restoring “Kitchen” brings these back:` |
| Confirmation rows | `Cabinets · Active`, `Garden · Completed`, indented by depth |
| Confirm button, N | `Archive all` / `Archiving…` (no workstreams: `Archive it`, unchanged) |
| Archive toast | `Archived Kitchen and 1 workstream.` (no workstreams: `Archived Garden.`, unchanged) |
| Late refusal | `The workstreams under “X” changed. Open Archive again to confirm the current list.` |
| Banner, owner with a group | `“Kitchen” is archived. Restoring it brings back 1 workstream.` (no group, or count unknown: unchanged) |
| Banner, marked project | `“Cabinets” was archived with “Kitchen”. Restoring “Kitchen” brings it back.` |
| Archive and Settings row | `Comes back with 1 workstream` / `Comes back with 3 workstreams` |
| Restore toast | `Restored Kitchen as Active, with 1 workstream.` (no group: unchanged) |

### R11 — MCP and agents

The tool count stays 38 and the grant map is unchanged. Subject to Open question 4:

- `archive_project` input gains `workstreamIds?`; `update_project` gains `archiveWorkstreamIds?` through
  its shared schema. Both answer `{ project, operation, cascaded? }`.
- Descriptions change for `archive_project`, `restore_project` ("does not cascade into archived
  descendants" is no longer true), `update_project`, `list_archived_projects` and `get_project_archive`
  (`cascadeCount`), and `undo_operation` ("live-child rules").
- `mcp-acceptance.mjs` gains one journey: refused without ids, succeeds naming them, Undo, Redo, restore.
- **Slice 22 is not done here.** §58's "archive project → confirmation" stays a planned experiment; naming
  ids is an API precondition, not a person's confirmation.

### R12 — Paying for the bundle

The initial bundle is **1,149.69 kB of 1,150 kB**, 0.31 kB of headroom. **The ceiling is not raised.**

- **What it costs (estimate, 1–2 kB initial):** the marker in `ProjectSchema` and the op fields in
  `project-history` (the gateway parses history results, so these ship); the `cascaded` and `cascadeCount`
  fields; `archive(ids)`; `restoreOwner`'s patch; two toast branches; one `@if` in More. Confirmation,
  banner and Archive-region changes are already in deferred chunks.
- **What pays (measured):** `/settings/archived-projects` as a lazy `loadComponent` route. A temporary
  edit, built and reverted at `8758240` (the only uncommitted experiment this session), measured
  **1,149.69 → 1,138.63 kB initial (−11.06 kB)**, with a 11.96 kB lazy chunk. That leaves roughly 9–10 kB
  under the ceiling after this slice.
- This overturns the wording of the user's Slice 79 Q8 (a), "every other feature route stays eager", so
  it is **Open question 1**. It lands first (step 0), so every later step measures against it. Any step
  that adds web code runs `pnpm --filter web build` and records the figure in the State header. Crossing
  the ceiling stops the step.

## Done when

The Acceptance check below passes, the user has passed Gate 2 on the sheet, real use on
`nested-projects` is recorded in `.prototype/notes.json`, and the initial bundle is under 1,150 kB with
the ceiling unchanged.

## Do not

- Raise the bundle ceiling.
- Build §58's agent confirmation, or anything of Slice 22.
- Cascade completion, or anything other than the archive and its restore.
- Add a "restore this one only" or "choose which workstreams" control.
- Write a converter, bump the schema version, or change a seed's data.
- Take on the §8 comb, beyond what Open question 6 may add.

<!-- ───────────── Written when the slice starts ───────────── -->

## Scope check

**This slice falls under the UI/UX overhaul protocol, and uses the §6 extras, scaled down.** It is listed
in the umbrella's handoff, ahead of the §8 comb; it changes the header confirmation, the banner, the
Archive and Settings rows and the toasts that the redesign slices just accepted; and it reverses Slice
79's L4-008 answer. So the protocol's guardrails, before/after sheet and Gate 2 apply. It is **not** a
redesign slice: no new tokens or primitives, and it comes from a user decision, not from a comb finding.
The sheet stays small, about 15 pairs against Slice 79's 194.

## Findings closed

None newly. **L4-008 is re-answered, not reopened.** Its problem (hearing the rule only after pressing
Archive) stays solved: the page says what will happen before the write. Slice 79 said it with a refusal;
this says it with a commit. `§8 comb list` items 1 and 2 are touched only as Open question 6 decides.

## Acceptance check

Run in this order on the slice's final commit. **"Sees" means a running app or a passing test named
here.**

1. `pnpm test` and `pnpm lint` are green. `pnpm docs:check` runs after the root docs tests, never at the
   same time.
2. `pnpm --filter web build`: initial total under 1,150 kB, with `apps/web/angular.json`'s `maximumError`
   unchanged (`git diff 8758240 -- apps/web/angular.json` is empty).
3. `pnpm --filter @cwm/e2e exec playwright test cascading-archive.spec.ts lifts.spec.ts empty-archived-editing.spec.ts project-history.spec.ts feedback.spec.ts web.spec.ts archive.spec.ts`
   passes, on the journeys below. (Also run the full `pnpm e2e` once, and say in the Outcome if any part
   was not re-run after a later fix.)
4. **`apps/e2e/cascading-archive.spec.ts`, on `nested-projects`:**
   1. Kitchen → More → Archive: the dialog says "Archive “Kitchen” and its 1 workstream?" and lists
      Cabinets · Active. Cancel writes nothing.
   2. Home renovation → Archive: "its 3 workstreams", lists Kitchen, Cabinets (indented) and Garden ·
      Completed, and not Legacy attic or Legacy shelving.
   3. Commit on Home renovation: toast "Archived Home renovation and 3 workstreams."; the page stays with
      its banner; `GET /api/projects` shows the three archived with a marker naming it, Legacy attic with
      none, Legacy shelving still `active`.
   4. **Undo from the toast:** all four live, Kitchen and Cabinets Active, Garden Completed with its
      original `completedAt`; Legacy attic still archived.
   5. Redo from the header: same state as (3), same ids in the markers.
   6. Restore from the banner as On hold: Home renovation On hold; the three at their recorded statuses,
      with no markers; Legacy attic still archived and now listed; Home's Undo re-archives the group.
   7. **From each other entry point:** archive Kitchen with Cabinets, then restore it from root Archive
      (row says "Comes back with 1 workstream"), archive again and restore from Settings › Archived
      projects (lazy route, same line). Cabinets returns each time.
   8. **Child alone:** with Kitchen and Cabinets archived, Cabinets's page says "“Cabinets” was archived
      with “Kitchen”…", restores Kitchen from there, and both pages end with no banner; focus lands on the
      `h1`. Its More has no status buttons while it is marked. Neither Archive nor Settings lists Cabinets
      while Kitchen is archived.
   9. **Separately archived first:** archive Cabinets alone, then Kitchen (no list, unchanged commit form,
      "Archived Kitchen."), then restore Kitchen: Cabinets stays archived and becomes the next listed
      owner.
   10. **Late refusal:** with the Kitchen confirmation open and its route frames held, create a workstream
       through the host API and commit: the dialog closes, the sentence shows under the header with the
       reason in Details and no Try again, nothing was archived, and the next confirmation lists the new
       workstream.
   11. **Refused Redo:** archive Kitchen and Cabinets, Undo, add a workstream under Kitchen, Redo: refused,
       nothing moves, and the header keeps its Redo.
   12. An archived root's Todos says "Restore to view N hidden todos." with N equal to the count after the
       restore, including rows under the workstreams that came down.
5. `node apps/prototype-host/scripts/mcp-acceptance.mjs` (or however `pnpm` runs it): passes, including:
   `archive_project` without ids refuses and names the workstreams; with them it answers `cascaded`;
   `undo_operation`, then redo, then `restore_project` keep the group's exact statuses. The other three
   acceptance scripts pass unchanged.
6. The sheet (see Capture scope) has zero gate failures and goes to the user for **Gate 2**.
7. **Real use** after Gate 2, per AGENTS.md step 4: `nested-projects` at 1440 mouse, 1440 keyboard and 375
   touch, through the web and through MCP, recording friction in `.prototype/notes.json` under slice 80.

## Capture scope

Rig: `apps/e2e/ux/slice80.config.ts` on the plan's ports 4257 and 4357, its own data file, a baseline build
at the plan's commit, and `build-sheet.mjs --profile 80`. At most two browser jobs at once, and
`route.fallback()` in routes.

**Must change (light and dark, 1440 and 375):**
- `kitchen-archive-confirm` (matrix cell, now the commit form with a list; already exempt by
  `build-sheet.mjs:99`)
- `renovation-archive-confirm` (runtime context, replacing Slice 79's `renovation-archive-blocked`)

**Newly captured, no "before" (one theme each way, both widths):** `kitchen-archived-with-group` (banner on
owner); `cabinets-archived-with-kitchen` (banner on marked project); `renovation-archive-row` (root Archive
row); `settings-archived-row` (Settings row); `archive-toast-group`; `restore-toast-group`; `late-refusal`.

**Must not change:**
- Every other matrix cell, including `kitchen-archived` (Legacy attic's banner and its unmarked sentence),
  `settings-archived-projects`, `archive`, `todos`, `kitchen-more` on a live project.
- `cabinets-archive-commit` (a project with no workstreams keeps today's form word for word).

## Visual acceptance

| Pair | What it shows |
|---|---|
| `kitchen-archive-confirm` before/after | Blocked form → commit form with its list |
| `renovation-archive-confirm` before/after | Two-level list with a completed row, and no separately archived row |
| Banner on the owner, banner on a marked project | The two sentences, in the archived band, at 375 and 1440 |
| Archive row, Settings row | "Comes back with N" reads as secondary and does not crowd the restore choice at 375 |
| Archive and restore toasts | Count fits on one toast at 375 |
| Late refusal | Sentence under the header, reason in Details |

## Behaviour vs. appearance

**Behaviour changes**; this is an intent change under §77, so tests, implementation and docs move together.

**Tests that change with intent:**
- `project-archive-confirm.spec.ts` (the blocked cases become list cases) and its `Blocked` story
- `project-workspace-store.spec.ts:1347-1379` (`liveChildrenOf` → `liveDescendantsOf`, the late-refusal
  sentence)
- `project-workspace-shell.spec.ts:1202-1228`
- `apps/e2e/lifts.spec.ts:158` (`blocked archive returns to More…`, which must keep its focus and page-toggle
  half)
- `apps/e2e/empty-archived-editing.spec.ts:236,249`, and `:37`'s fixture only if it stops matching

**Tests that must stay green untouched** (they call without ids, or have no children, which is R2's point):
`project-service.test.ts:140`; `project-history.test.ts:472,633,825`; `contracts/src/undo.test.ts:295`;
`apps/prototype-host/live-updates.test.ts:677`; `acceptance.mjs`; existing steps in `mcp-acceptance.mjs`;
`feedback.spec.ts:176` (`Archived Garden.`); `project-history.spec.ts:285`; `empty-archived-editing.spec.ts:194`.

**Slice 79's evidence tool:** `apps/e2e/ux/empty-archived-verification.ts` can no longer pass its
`kitchen-archive-blocked` and `renovation-archive-blocked` contexts. It runs only under `slice79.config.ts`,
not in `pnpm test` or `pnpm e2e`, and stays as the frozen record's tool with a one-line header note.

## File-level change list

### Step 0 — bundle (subject to Open question 1)

| File | Change | Responsibility |
|---|---|---|
| `apps/web/src/app/app.routes.ts` | modify | `/settings/archived-projects` lazy; the doc comment says why |
| `apps/web/src/app/app.routes.spec.ts` | modify | The lazy and eager lists |
| `docs/decisions/2026-08-initial-bundle-budget.md` | amend | Third lazy feature route, with the measurement |
| `docs/architecture/web/overview.md` or the system that lists lazy routes | modify | Which routes are lazy |

### Contracts, repositories

| File | Change | Responsibility |
|---|---|---|
| `packages/contracts/src/project.ts` | modify | `archivedWithProject` (R3) on the subproject branch; explicitly absent on the root |
| `packages/contracts/src/inputs.ts` | modify | `archiveWorkstreamIds` (R2) |
| `packages/contracts/src/project-history.ts` | modify | Optional `workstreams` on archive and reactivate; optional `cascaded` on their results (R6) |
| `packages/contracts/src/project-write-result.ts` | modify | Optional `cascaded` |
| `packages/contracts/src/project-archive.ts`, `archived-projects.ts` | modify | `cascadeCount` (R8) |
| `packages/contracts/src/tool-permissions.ts` | modify | The "touch only its own fields" comment |
| `packages/repositories/src/data-store.ts` | modify | Marker integrity (R9) |

### Domain

| File | Change | Responsibility |
|---|---|---|
| `packages/domain/src/project-service.ts` | modify | R1, R2, R4, R5, R7, inside the existing `update`/`archive`/`commit`; stale comments |
| `packages/domain/src/project-visibility.ts` | modify | `liveSubtree` (pure, R1, shared with history), `asRestored` (R8), module comment |
| `packages/domain/src/project-history.ts` | modify | Capture and both directions (R6), label, doc comment |
| `packages/domain/src/operation-history-service.ts` | modify | Activity summary with the count |
| `packages/domain/src/project-archive-service.ts`, `archived-projects-service.ts` | modify | `cascadeCount` |
| `packages/domain/src/dashboard-service.ts`, `section-service.ts` | modify | Stale "does not cascade" comments only |

### MCP

| File | Change | Responsibility |
|---|---|---|
| `packages/mcp-tools/src/tools/projects.ts`, `tools/undo.ts`, `tools/project-pages.ts` | modify | R11 input and descriptions |
| `apps/prototype-host/scripts/mcp-acceptance.mjs` | modify | The one cascade journey |

### Web

| File | Change | Responsibility |
|---|---|---|
| `apps/web/src/app/features/projects/live-children.ts` → `live-descendants.ts` | rename, modify | The walk with depth |
| `apps/web/src/app/features/projects/project-archive-confirm.{ts,html,scss,spec.ts,stories.ts}` | modify | One form, the list, ids at the press |
| `apps/web/src/app/features/projects/project-header.{ts,html}`, `project-workspace-shell.{ts,html}` | modify | The confirm callback takes ids; toast with the count |
| `apps/web/src/app/features/projects/project-workspace-store.ts` | modify | `archive(ids)`, the late-refusal sentence, `restoreOwner` patches `cascaded` |
| `apps/web/src/app/features/projects/project-more-menu.{ts,html}` | modify | Status buttons absent on a marked project |
| `apps/web/src/app/features/projects/archived-banner.{ts,html,spec.ts,stories.ts}` | modify | Reads the count; the two sentences |
| `apps/web/src/app/features/projects/archived-region/archived-region.{html,ts}`, `pages/archive-page-store.ts` | modify | Row line; toast count |
| `apps/web/src/app/features/settings/archived-projects/archived-projects-page.{html,scss,spec.ts}`, `archived-projects-store.ts` | modify | Row line; toast count |
| `apps/web/src/app/features/projects/history/history-feedback.ts` | modify | Two toast branches |
| `apps/web/src/app/core/shell/shell-store.ts` | modify | The stale "archived in its own right" comment |
| `apps/web/src/app/features/projects/project-page-navigation.html` | modify | Only if Open question 6 takes comb item 1 |

### E2E and evidence

| File | Change | Responsibility |
|---|---|---|
| `apps/e2e/cascading-archive.spec.ts` | create | Acceptance item 4 |
| `apps/e2e/lifts.spec.ts`, `empty-archived-editing.spec.ts` | modify | Named in Behaviour vs. appearance |
| `apps/e2e/ux/slice80.config.ts`, `apps/e2e/ux/cascading-archive-verification.ts` | create | The rig and gates |
| `apps/e2e/ux/empty-archived-verification.ts` | modify | One-line header note |
| `docs/roadmap/70-ui-ux/tooling/build-sheet.mjs`, `build-sheet.test.mjs` | modify | `--profile 80` |

### Documentation

| File | Change |
|---|---|
| `docs/decisions/2026-11-cascading-project-archive.md` | **create**: question, options (direct children only; implicit cascade; named ids), decision, the user's answers; indexed in `docs/decisions/README.md` and linked from `domain/why.md` and `web/projects/why.md` |
| `docs/decisions/2026-08-project-nesting-and-archive-rules.md` | **amend**: the refusal now applies only to what the caller did not name |
| `docs/decisions/2026-09-reactivating-under-an-archived-ancestor.md` | **amend**: live under archived is still refused; the cascade closes one way in, and R5 narrows the escape hatch for marked projects |
| `docs/decisions/2026-11-archived-pages-are-read-only.md` | **amend**: banner sentences; hidden count includes the group; More's status buttons |
| `docs/decisions/2026-09-project-update-operation-history.md` | **amend**: an archive or reactivation may carry a group; R6's directions |
| `docs/decisions/2026-09-project-workspaces-and-subproject-work-units.md` | **amend**: "Archiving gains no cascade" |
| `docs/decisions/2026-09-root-archive-recovery-guidance.md`, `2026-09-actionable-archive-and-archived-projects.md` | **amend**: rows say what comes back |
| `Canvas Work Manager — Prototype Product, Design & Development Specification.md` | **§31**: replace "None of this adds a cascade…" with the rule, keeping the no-implicit-cascade reasoning; **§26**: confirmation and history; **§23**: Settings row; **§54**: tools |
| `docs/architecture/domain/{what,why,how}.md`, `docs/architecture/contracts/`, `docs/architecture/repositories/`, `docs/architecture/mcp-tools/`, `docs/architecture/web/projects/{why,how}.md`, `docs/architecture/testing/how.md` | Current behaviour; where `why.md` says "reaches down without cascading" and "archiving never cascades" |
| `docs/guides/mcp-setup.md` (`:273`), `docs/guides/first-milestone-walkthrough.md` (`:82`) | Both state the old refusal |
| `README.md` | Only if a command changes |
| `docs/roadmap/goals.md`, `docs/roadmap/active/70-ui-ux-overhaul.md` | Handoff at close |

## Implementation sequence

Each step fits one fresh session, ends green, and updates the State header. Docs for a changed system go in
the same commit as the code. Bundle figure after any step that adds web code.

- **Step 0 — Baseline and payment.** After the Open questions are answered. Build and keep the baseline web
  at the plan commit, capture the "before" contexts. Land R12, record the figure.
- **Step 1 — Contracts and integrity.** R3, R6's and R8's schemas, R2's input, R9, with tests. Domain and
  services emit nothing new yet, except `cascadeCount: 0`. New decision entry opened. Bundle.
- **Step 2 — Forward archive.** `liveSubtree`, `assertNamedWorkstreams`, marking, label, Activity, `cascaded`,
  in `ProjectService`. Amend the nesting decision and spec §31.
- **Step 3 — Forward restore and R5.** Revive by marker; the marked-project refusals. Amend the reactivating
  decision.
- **Step 4 — History.** Capture and R6's two directions, with its conflict tests. Amend the history decision,
  `domain/how.md`.
- **Step 5 — Read models.** `asRestored`, `cascadeCount`, stale comments.
- **Step 6 — MCP.** R11, the acceptance journey, `mcp-setup.md`, §54.
- **Step 7 — Confirmation and archive in the web.** `liveDescendantsOf`, one form, `archive(ids)`, late refusal,
  archive toast, and the e2e tests that pin them. Bundle.
- **Step 8 — Restore in the web.** Banner, `restoreOwner`, Archive and Settings rows, More's buttons, restore toast,
  and anything Open question 6 adds. Bundle.
- **Step 9 — End to end.** `cascading-archive.spec.ts`, the remaining e2e changes, the walkthrough guide.
- **Step 10 — Evidence and review.** Rig, profile 80, the sheet; AGENTS.md step 4's five review passes on the diff;
  fixes; re-capture. **Stops for Gate 2**, with what to look at.
- **Step 11 — After Gate 2.** Real use; Outcome; `roadmap.mjs complete`; goals and umbrella hand off. The user passes
  Gate 2, never a session.

## Test plan — tests first

| Test | Proves |
|---|---|
| **Contracts** `project.test.ts: a root cannot carry archivedWithProject; a subproject can; a marker's status cannot be archived` | R3's parser refusal |
| `project-history` contract test: `workstreams present is non-empty; omitted parses; update has none` | R6's shape; old actions still parse |
| `project-write-result` test: `cascaded absent parses; an extra field still refuses` | The strict result stays strict |
| **Integrity** `data-store.test.ts: a marker refuses when live; when the owner is live, absent, not an ancestor, or itself marked; when an intermediate parent lacks it; an unmarked document with the old shape loads` | R9 and no migration |
| **Forward** `project-service.test.ts: archive naming the whole subtree marks each at its recorded status, one action, one Activity line, cascaded listed` | R1, R3, R6, R7 |
| `…: a completed workstream comes down and records completedAt` | R1, completed |
| `…: the walk stops at an archived node; a live project hidden under it is neither named nor changed` | R1 |
| `…: without ids, an unnamed live descendant, and an id not in the walk each refuse, and write nothing` | R2's failure paths |
| `…: the same rule through update and through archive; PATCH without ids refuses` | R2, both doors |
| `…: archiveWorkstreamIds on a non-archive write refuses; on an already archived project is a no-op with operation null` | R2's edges |
| `…: a foreign-workspace id named refuses without confirming it exists` | §31's not-found rule |
| `…: an actor without projects.write is forbidden, and with it alone cascades with no read grant` | Permission path |
| **Restore** `…: restore revives exactly the marked, each to its recorded status and completedAt, clearing markers; a separately archived one stays` | R4 |
| `…: restore under an archived ancestor refuses and keeps every marker` | R4's failure path |
| `…: a marked project refuses a status change, a reparent, and both in one call, naming the owner; rename succeeds` | R5 |
| `…: an unmarked archived project can still reactivate and move in one call` | R5 is narrow |
| `…: moving the owner carries its group and the invariant holds` | R3 |
| **History** `project-history.test.ts: Undo of a cascaded archive restores the group exactly; Redo re-marks it` | R6 |
| `…: Undo of a reactivation re-archives the recorded group; Redo revives it` | R6 |
| `…: a rename of a workstream survives Undo and Redo` | R6, unrelated edits |
| `…: bring back refuses, moving nothing, on a missing one, one no longer marked, and an unrecorded project marked with the owner` | R6's left column |
| `…: take down refuses, moving nothing, on a status drift, one moved out, and a new live workstream` | R6's right column |
| `…: a workstream's own older step is blocked while the owner is archived, and runs after its return` | R6, verbatim restore |
| `operation-history-service.test.ts: another actor's restore refuses my Undo and retires nothing; per-actor cursors stay separate` | Actor isolation |
| `…: Undo and Redo publish one record frame and one Activity line naming the count` | R7 |
| **Read models** `project-todos-service.test.ts`, `project-journal-service.test.ts: hiddenItemCount includes rows under the group and excludes rows under a separately archived workstream, and equals the rows after restore` | R8 |
| `project-archive-service.test.ts`, `archived-projects-service.test.ts: cascadeCount counts the marked; a marked project is never listed while its owner is archived; it is 0 when none` | R8 |
| **MCP** `contract.test.ts`: `archive_project` with and without ids; `restore_project`'s `cascaded`; `registry.test.ts` unchanged at 38 | R11 |
| `handler.test.ts`: a text-only client's refusal names the workstreams and their ids | R2's repair in words |
| **Web** `live-descendants.spec.ts: depth-first with depth; empty when the tree cannot say; a root's and a workstream's` | R10 |
| `project-archive-confirm.spec.ts: no list keeps today's words; a list shows N, statuses and depth; the press sends the ids on screen; a frame while open updates both; Escape and Cancel still write nothing and return focus to More` | R10 |
| `project-workspace-store.spec.ts: archive(ids) sends them only when non-empty; a rule_violation words the changed list and re-reads; restoreOwner applies cascaded so archivedOwner is null on a marked project's page` | R10, the flicker |
| `project-workspace-shell.spec.ts: after a banner restore on a marked project, focus reaches the h1 and no restore choice was focused first` | R10 |
| `archived-banner.spec.ts: owner with a count; marked project; marker naming a different owner keeps Slice 79's sentence; a failed count read keeps it too` | R10's failure path |
| `project-more-menu.spec.ts: status buttons absent on a marked project; present on an unmarked archived one` | R5 |
| `archived-region` and `archived-projects-page.spec.ts: the line appears at count > 0, is absent at 0, and the toast counts cascaded` | R10 |
| `app.routes.spec.ts: the lazy list has settings/archived-projects, and the route still resolves to the page` | R12 |
| **E2E** `cascading-archive.spec.ts`, Acceptance item 4's twelve journeys | End to end, keyboard and touch included |

## Boundaries touched

- **Components depend on gateway interfaces.** The banner's `archived()` call is through `ProjectGateway`, and the
  gateway gains no method. `archive(ids)` is `update`, through the same port. No concrete adapter is named.
- **Domain services depend on abstractions only; no new service edge.** All of it sits in `ProjectService` and
  `project-history.ts` over `ProjectRepository`. `liveSubtree` is a pure function, as `archivedAncestry` is. The
  acyclic graph in AGENTS.md is unchanged.
- **MCP tools call domain services.** Both go through `services.projects`.
- **Contracts are defined once.** The marker, the group entry and `cascaded` live in `packages/contracts`. The op's
  entry and the marker share one fragment.
- **No `new Date()` in the domain.** Stamps come from `Clock`; `completedAt` is restored, never re-stamped.
- **No literal colors, spacing or radii.** The list's indent and the row's quiet line use existing tokens.
- **No scattered `if (prototypeMode)`.** None.
- **`core/` does not depend on `prototype/`.** Unaffected; only a comment changes in `core/shell`.
- **Never build (§80).** None of it.
- **Disposable (§71).** No JSON-repository abstraction, and integrity rules with plain tests.

## Explicit non-goals

- A per-workstream choice at archive or at restore.
- A status choice per workstream at restore (Open question 2's option (b) is one status for all; a choice per row is not on offer).
- A cascade through a separately archived node to the live work hidden beneath it.
- A Recent Activity line per workstream (R7).
- A read-only task drawer, a Restore on the marked child, or any change to Slice 79's other read-only rules.
- Unifying the Archive and Settings restore toasts (comb item 4).
- Fixing that `archive()` keeps `completedAt` on the owner while `update` removes it; only the group's handling is defined here. A note goes to the §8 comb list if real use finds it.

## Open questions

Numbered for the user's answers. Nothing below is decided; each recommendation is what the plan assumes until told
otherwise, and the implementation does not start before these are answered.

**1. What pays for the bundle?**
- *Context.* 0.31 kB of headroom; this slice needs an estimated 1–2 kB initial, which cannot fit. Your Slice 79 answer
  said every other feature route stays eager, so this needs your word.
- *Options.* (a) Lazy-load `/settings/archived-projects`: **measured 1,149.69 → 1,138.63 kB (−11.06 kB)**. (b) Lazy-load
  a different route, such as `/search`: not measured, and it opens on a common path. (c) Raise the ceiling: your call
  alone; the plan never does this.
- *Recommendation.* (a). It is a recovery route, opened rarely, and it pays for this and leaves 9–10 kB.
- *Impact.* (a): the first open of Archived projects loads a 11.96 kB chunk, with no change to what it shows. (b): a
  fresh measurement, possibly a slower search. (c): the ceiling moves for the third time.

**2. What status does each workstream come back to?**
- *Context.* A restore makes the person choose a status for the owner, and the prototype "does not guess a prior
  status". A workstream that came down had a status of its own. Kitchen Active and Garden Completed differ.
- *Options.* (a) Each returns to its **recorded** status and `completedAt`, while the owner still takes the shown choice.
  (b) All take the owner's chosen status.
- *Recommendation.* (a). It is a record, not a guess, a Completed workstream does not silently reopen, and older
  history steps stay valid (R6).
- *Impact.* (a): needs R3's recorded fields, which are designed in. The owner and its workstreams can differ after a
  restore (Home On hold, Kitchen Active). (b): the marker shrinks to an id, but completion times are lost, older
  Undo steps on those workstreams start refusing, and §26's "comes back exactly as recorded" doesn't hold.

**3. Can a workstream leave its group while the owner stays archived?**
- *Context.* Today an archived workstream can be reactivated-and-moved to a live parent in one call, and moved while
  still archived. Applied to a workstream that came down, it would split the group. Restoring a child alone in place
  is already impossible: a live project under an archived one is refused.
- *Options.* (a) No: restore the owner first, then re-archive what you did not want back (R5). (b) Yes: a move ends its
  membership, rewriting its descendants' markers as `normalizeArchiveGroup` does for tasks, and Undo of the owner's
  archive then has to tolerate or refuse a partial group.
- *Recommendation.* (a). It is one rule, tasks already behave this way, and it makes the invariant and the history
  simple. (b) is much larger for a case that real use has not asked for, and can be added later.
- *Impact.* (a): a person wanting just Cabinets back from an archived Kitchen restores Kitchen, then archives Kitchen
  again alone or with its others: about three steps. MCP clients hear a refusal that says so. (b): adds maybe one
  step's work plus harder history rules, and a "partial restore" state on Undo.

**4. Can an agent cascade, and how?**
- *Context.* §58 says archiving a project needs confirmation, and Slice 22 (planned) has not built that. An implicit
  cascade through `archive_project` is what the decision ruled out, and the plan keeps that out in all options.
- *Options.* (a) Agents may, naming each id in `workstreamIds`, the same domain rule the web uses; a call without them
  keeps refusing, naming the ids. (b) People only: MCP keeps refusing; the input is web-only. Agents archive children
  first, as today.
- *Recommendation.* (a). One rule for every caller (§54's "the same operations used by the UI"), undoable, and a
  deliberate two-call step. Slice 22 can later add its pause in front of it.
- *Impact.* (a): an agent with `projects.write` can archive a subtree in one call, without a person's confirmation
  until Slice 22. (b): needs a domain or transport split, contradicts §54's sameness, and leaves restore asymmetric:
  an agent's `restore_project` would still bring back a group a person archived.

**5. Do you accept this wording, and should the confirmation mention what is already archived?**
- *Context.* R10's copy table is a proposal. Separately, the confirmation lists only what will come down, so Legacy
  attic is not mentioned on Home renovation. Saying so needs one more read, in the deferred chunk.
- *Options.* (a) Accept the table; say nothing about separately archived work, since nothing happens to it, and Archive
  and Settings already say "Its separately archived contents remain in Archive." (b) Add one line: "Legacy attic is
  already archived and stays archived." (c) Change any row in the table.
- *Recommendation.* (a), for the confirmation's job being what will change. The sheet at Gate 2 is a second chance.
- *Impact.* (a): none beyond the table. (b): one read and a few hundred bytes off the initial bundle, plus a failed-read
  state. (c): per row.

**6. Should this slice take two §8 comb items it makes worse?**
- *Context.* Comb item 1: an archived root's navigation says "No workstreams yet" over its archived workstreams. Today
  that needs a separate archive of each; after this slice, one Archive produces it every time on any root that has
  workstreams, directly under a banner promising them back. Comb item 2: the refusal line "Restore or move the new
  dependent, then try Undo again." is wrong for a live workstream, and R6's Redo refusal (a workstream added since)
  reaches the same line.
- *Options.* (a) Take item 1 only: on a read-only root the navigation drops "No workstreams yet". Leave item 2 to the
  comb. (b) Take both: also word the project conflict as "Archive or move the new workstream, then try Redo again."
  (c) Take neither: both stay in the comb.
- *Recommendation.* (a). Item 1 becomes a false sentence on the slice's own main path, in a deferred chunk at no bundle
  cost. Item 2 stays rarer and shares its next-step code with `project.add`, so it deserves the comb's look.
- *Impact.* (a): one `@if` in the navigation, one spec, one more sheet pair, and the comb list shortens by one. (b): plus
  a next-step distinction and about 0.1 kB initial. (c): Gate 2's sheet shows the false sentence.

## Revisions

- **First draft (2026-11-05, S80PLAN):** written from the code and spec. Reviews have not run.

<!-- ───────────── Written before roadmap.mjs complete ───────────── -->

## Outcome

**Deliverables** — <what now exists and works, with file links>.

**Deliberate choices** — <decisions made and why; options rejected; links to decision entries>.

**Deviations from the plan** — <what changed mid-implementation and what caused it>.

**Deferred** — <what was left out and which slice owns it>.

**Open questions** — <what the next phase or the user must answer>.

**Documentation updated** — <the architecture folders, decisions and guides touched>.
