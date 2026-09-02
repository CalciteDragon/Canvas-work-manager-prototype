# Implementation plan — archive keeps its promise

Follow-up to `docs/plans/2026-09-section-ownership-implementation.md`, from the friction that
phase's browser pass recorded (`.prototype/notes.json`, `note-2026-09-01-002`).

**Goal.** An archived row can be brought back, always lands in a section that renders it, and the
document refuses to hold a live row that nothing renders.

**Spec sections.** §9 (`TaskGateway`'s pinned surface), §33/§34 (subtasks and task interactions),
§45 (injected clock), §54/§56 (the tool set and tool-shape experiments), §58 (agent
confirmations), §62 (live updates), §69 (end-to-end tests), §71 (deliberately disposable),
§77 (correcting the design from use), §78 (the decision log), §80 (never build).

**Not in scope.** Naming sections, which is the sibling plan
`2026-09-section-names-implementation.md`.

> **Step 1 is unresolved and blocks everything after it.** Review round 1 surfaced two options
> the first draft never considered, one of which dissolves two of its blocking findings at the
> cost of a wider change. Steps 2–7 are written against the original choice so the work is
> costed, but they must not begin until Step 1 is settled. See *Open questions*.

---

## Step 0 — Four facts that change the obvious approach

**The decision already claims what this plan has to build.**
`docs/decisions/2026-09-sections-own-their-data.md` justifies cascade-as-archive with
"`archivedAt` … is deliberately distinct from `cancelled`, so this is undoable." That is true of
the field and untrue of the application: a repo-wide search of `packages` and `apps` for
`unarchive`, `restore`, or a write of `archivedAt: null | undefined` returns only unrelated prose,
`vi.restoreAllMocks`, optimistic-rollback comments and test names. **Nothing has ever performed
the undo the decision promises.** The specification mentions archive four times — spec line 374
(`archive(id: TaskId)` in §9's `TaskGateway`), 2008 and 2011 (§58), 2922 (§81) — and restore
never. So this phase is making an existing claim true, or else retracting it. Step 1 must decide
which; the first draft framed that choice and then quietly assumed the first half of it.

**`settleRows` already contains the argument against its own cascade branch.**
`packages/domain/src/section-service.ts:287-288` says, of reassign:

> Reassign still repoints the archived ones, because unarchiving a row into a section that no
> longer exists would be the worse outcome.

Cascade, twelve lines later, produces exactly that: `:306-310` writes only `archivedAt`, and
`remove` at `:278` then hard-deletes the section. The verified example from the last phase's
browser pass:

```
section-4f7e064c | Measure the hallway shelf | archivedAt= 2026-09-02T06:13:32.422Z
```

`section-4f7e064c` no longer exists. **Rows already archived before the cascade dangle too**:
`:297` filters them out of `live`, `:298` returns early when nothing is live, and the section is
removed without touching them. The reassign branch at `:325` iterates `rows`, not `live` — the
inconsistency is one opinion applied on one branch.

**The integrity pass never learned about the field the last phase added.**
`validateDocumentIntegrity` (`packages/repositories/src/data-store.ts:129-139`) checks a task's
`projectId` and `parentTaskId`, and a section's, milestone's and reflection's `projectId`. The
string `sectionId` does not appear in the function. That is why the dangling pointer above
committed cleanly and survives every reload. Validation runs once at unit close
(`data-store.ts:280`), not per write, so a rule added here sees only committed states — there is
no intra-unit ordering hazard to design around.

**Archive is half-built on both rows it applies to.** `TaskService.archive` exists
(`task-service.ts:202`) and `TaskGateway.archive` is declared (`work-manager-gateway.ts:44`) —
but **no UI calls it**: the one `.archive(` in `apps/web` is `project-page.ts:131`, which archives
the *project*. `ReflectionService` has no archive at all (only `list`, `create`, `update`, `get`),
so a reflection can acquire `archivedAt` only by having its container cascaded through
`SectionService.writeRow`, and nothing can ever clear it.

---

## Step 1 — What happens to a row whose container is removed *(UNRESOLVED)*

Five shapes. The first draft listed three and chose the third; review round 1 added the last two,
and the fourth is strong enough that this step is now an escalation rather than a decision.

**A. Cascade repoints rows to a surviving container.** Fails when there is none — the common
case, since you removed the only Task List. Rejected.

**B. Cascade clears `sectionId`, making it optional again.** Rejected in the first draft as
"reopening the invariant the last phase closed". That rejection was not fair, and the record
should say so: a dangling `sectionId` weakens the invariant by exactly as much as an absent one,
and is *worse* to work with, because it is indistinguishable from a valid pointer without a
lookup. The honest advantage of C over B is "no contract change", not a stronger invariant.

**C. Restore resolves the container.** `sectionId` on an archived row is a *hint*: restore returns
it to its own section when that still exists and still holds its kind, and otherwise resolves
through `SectionService.resolveContainer` — the same door `create` uses. Smallest contract change.
Weakest invariant, and it requires the integrity rule to go lenient for archived rows (Step 2).

**D. Archive the section instead of deleting it.** `ProjectSection` gains `archivedAt`; cascade
soft-deletes the container together with its rows. `sectionId` then never dangles: the integrity
rule stays strict for *every* row, `resolveRestoreTarget` disappears entirely, and restore becomes
"un-archive the row, and its section if needed". This dissolves the reachability problem in
Step 5 and the weak-rule problem in Step 2 at once. Its cost is breadth, not depth: every section
read, the canvas, position renumbering, `duplicate`, and `list_sections` must all learn to exclude
archived sections, on a surface the previous phase has only just stabilised.

**E. Retract the claim — drop `cascade`.** Removal of a non-empty container would take `reassign`
or be refused. Nothing dangles because nothing is orphaned, it is a deletion rather than an
addition (AGENTS.md §4), and it matches a specification that never mentions restore. Its problem
is circular: refusing removal tells the user to empty the list first, and the only way to empty a
list is to archive its rows, which is the operation being removed. It would need a per-row archive
control to become coherent — which is Step 5's work anyway.

**Recommendation: D, if the phase can be that wide; otherwise C.** D is the design that stops
producing the defect rather than tolerating it, and it is the only option under which the Goal's
sentence — *the document refuses to hold a live row that nothing renders* — is enforceable without
qualification. C is defensible and cheaper and is what Steps 2–7 are costed against.

**This changes the shape of the work, so it is the user's call, not the plan's.**

Whichever is chosen, `settleRows`' reassign comment needs rewriting: under C its repointing is an
optimisation rather than a correctness requirement, and under D it becomes unnecessary.

**And either way this amends the decision of record.** The ADR states the invariant as "every row
has a `sectionId`, every section renders, so no row can be invisible." Under C it narrows to
*live* rows and reverts to convention for exactly the rows the ADR called undoable. That is a
change to the decision, not an implication of it, and Step 7 must record the narrowing rather than
only recording that "undoable" became true.

---

## Step 2 — Repositories: the integrity pass checks the field

*(Written against option C. Under D the archived branch disappears and the rule is strict
throughout — which is most of D's argument.)*

`packages/repositories/src/data-store.ts`, beside the existing `projectFor` calls:

```ts
const containerFor = (collection: string, id: string, row: OwnedRowShape) => {
  const section = sections.get(row.sectionId);
  if (row.archivedAt === undefined) {
    // A live row must be rendered: its section must exist, belong to the row's project, and
    // be a container of the row's kind. The last clause is the one that makes this the
    // ownership invariant rather than a foreign-key check.
    if (section === undefined) fail(`${collection} "${id}" has missing section "${row.sectionId}"`);
    if (section.projectId !== row.projectId) fail(`${collection} "${id}" has a section from another project`);
    if (ownedKindOf(section.type) !== expectedKind) fail(`${collection} "${id}" is held by a ${section.type} section`);
    return;
  }
  // An archived row's section is a hint: cascade may have removed it. If it resolves it must
  // still not point into another project. Restore re-resolves either way.
  if (section !== undefined && section.projectId !== row.projectId) {
    fail(`archived ${collection} "${id}" has a section from another project`);
  }
};
```

**The kind check is not optional.** Without it a live task pointing at a `progress` or `timeline`
section passes validation — a live row nothing renders, which is precisely what the Goal says the
document must refuse. `SectionService.requireContainer` (`section-service.ts:166-180`) already
encodes the correct rule on the write path; an integrity pass encoding a weaker one would leave
the reachable half of the hole open, and acceptance item 1 is *about* hand-edited documents.
`create_section` takes an open `type` string, so this is reachable over MCP too.

Two notes on the surrounding code, both checked:

- **The index order already works.** `sections` is built at `data-store.ts:97`, before the row
  loops at 129-139.
- **All six seeds already satisfy the rule.** No seeded row carries `archivedAt`, and section ids
  are convention-derived (`seeds.ts:89,103,202`). Re-run `pnpm --filter @cwm/prototype-data test`
  first anyway: a wrong seed fails every suite at document load rather than in one place.

**Before the first run of this phase, delete any stale `.prototype/e2e-data.json`** — see
*Environment*.

**Verify:** `pnpm --filter @cwm/repositories test`, then `pnpm --filter @cwm/prototype-data test`.

---

## Step 3 — Domain: restore, and the container it lands in

### `packages/domain/src/section-service.ts`

```ts
/**
 * Where an archived row goes when it comes back. Its own section when that still exists and
 * still holds this kind; otherwise the project's first container, or a new one — the same
 * door `resolveContainer` opens on create.
 *
 * Call it from inside an open unit of work: it can create a section. It must use
 * `sections.find` rather than `require`, which throws `EntityNotFoundError` for a removed
 * section — the case this function exists to handle.
 *
 * No `projects.write` check, following `resolveContainer`: this is a section a *row* write
 * needs on its own behalf.
 */
async resolveRestoreTarget(
  actor: ActorContext,
  projectId: ProjectId,
  sectionId: SectionId,
  owned: OwnedDataKind,
): Promise<ProjectSection>
```

### `packages/domain/src/task-service.ts` — `restore(actor, id)`

Mirroring `archive` (`:202`), with one rule the first draft missed entirely:

**Subtasks restore with their parent, never alone.** `sectionFor` enforces that a subtask is
rendered by its parent's section and cannot be given another (`task-service.ts:154-159` and
`:250-256`), and `moveSubtree` (`:264`) repoints every descendant when a parent moves. Cascade
archives parents and children alike, so this is the normal path, not an edge case. A naive
`restore` would give a restored child a different `sectionId` from its still-archived parent,
breaking that invariant, or leave a live child under an archived parent. So:

- Restoring a task **with an archived parent** is refused with a `DomainRuleError` naming the
  parent — "restore its parent instead", the same shape as the existing subtask messages.
- Restoring a task **restores its archived descendants with it**, repointing them through the
  existing `moveSubtree`, so a subtree stays in one list exactly as that method already promises.
- Otherwise: resolve the target, clear `archivedAt`, write `sectionId`, all in one commit.
- Idempotent — a live task returns unchanged, as `archive` does for an already-archived one.
- Records `task.restored`, a new `TaskAction` beside `task.archived`, verb `Restored`.
- Does **not** touch `status`. Archiving never changed it.

**On §45:** restore does not read a clock *for the archive field*, but it goes through `commit`
(`:214`), which stamps `updatedAt` from the injected clock, and `record` writes an activity event.
The lint stays quiet because everything uses the injected `Clock` — but an implementer who reads
"restore clears a timestamp" and skips `updatedAt` breaks the §62 refresh Step 5 depends on.

### `packages/domain/src/reflection-service.ts`

`archive` and `restore`, matching the task pair (reflections have no parent, so no subtree rule),
**and `list` must learn `includeArchived`**: it currently takes `(actor, projectId, sectionId?)`
and forwards neither the flag nor a default, so the repository excludes archived rows
(`json-repositories.ts:154`) and no caller can ask otherwise.

**Verify:** `pnpm --filter @cwm/domain test`.

---

## Step 4 — Host API

`apps/prototype-host/api/routes.ts`, symmetric with the existing `POST /api/tasks/:id/archive`:

- `POST /api/tasks/:id/restore`
- `POST /api/reflections/:id/archive`
- `POST /api/reflections/:id/restore`

**And `GET /api/reflections` must forward `includeArchived`.** It parses `ReflectionQuerySchema`
— which has the field (`inputs.ts:143`) — then passes only `query.sectionId`
(`routes.ts:143-154`), and omits `includeArchived` from `queryObject`'s boolean list, unlike the
tasks route at `:223`. Three separate omissions on one read path.

**Verify:** `pnpm --filter @cwm/prototype-host test`.

---

## Step 5 — Web: seeing and undoing an archive

**The disclosure is canvas-level, not per-section.** The first draft put an `Archived (n)`
disclosure inside each container, which cannot work for the case that matters: cascade the
project's *only* Task List and there is no container left to host it. A region at the foot of the
project canvas lists the project's archived rows and restores them, and is reachable whether or
not a container survives.

This is not the "computed unrendered-data region" the ADR rejected. That was rejected as a way of
*holding the ownership invariant* — surfacing orphaned live data rather than preventing it. This
shows deliberately archived rows, which are supposed to be unrendered, and it is the undo surface
for an operation the ADR calls undoable.

- `WorkManagerGateway` — `tasks.restore(id)`, `reflections.archive(id)`, `reflections.restore(id)`,
  and `reflections.list` gains `includeArchived`. `tasks.archive` already exists and finally gains
  a caller, which that file's own rule requires of a declared method.
  **`TaskGateway` is pinned to §9 "verbatim" (`work-manager-gateway.ts:38`), and spec line 374
  declares `archive` and nothing else.** Adding `restore` is legitimate under AGENTS.md §2 rule 5
  — correct the spec when the prototype disproves it — but it means editing §9 and recording it in
  the decision entry, not quietly widening the interface.
- `archive` returns `Promise<void>`, so the store cannot read the updated row back from it. Both
  archive and restore re-read, or the list goes stale.
- A new feature store for the region, project-scoped, provided by `ProjectPage`. It must not reach
  into the section-scoped stores; it reads `includeArchived: true` and filters to archived rows.
- Restoring bumps `projectDataRevision` (`project-page-store.ts:173`) so surviving containers
  re-read — **and must also call `reconcileSections`** (`:601`), because a restore that creates a
  container adds a section to the canvas, which the revision bump alone does not paint. The first
  draft claimed this path already existed; it exists only for restores into an *existing*
  container.
- Empty state: the region hides entirely at zero, rather than rendering `Archived (0)`.
- Per-row **Archive** in the live list too, so the region has a second way to be reached and
  §58's "archive task → confirmation" has something to confirm later.

**Verify:** `pnpm --filter web test`, then `pnpm lint` and `pnpm build`.

---

## Step 6 — Docs

- `docs/decisions/2026-09-what-undo-means-for-an-archived-row.md` — the §78 entry, recording the
  Step 1 options **including D and E**, and the invariant narrowing if C is chosen.
- `docs/decisions/2026-09-sections-own-their-data.md` — amend: "undoable" now points at a real
  operation, *and* the invariant applies to live rows only. Its *Confidence* section currently
  reads "Low for the reassign policy, which has no UI behind it yet" — that changes.
- `Canvas Work Manager — …Specification.md` §9 — `TaskGateway` gains `restore`, per §2 rule 5.
- `development.md` — a third unnumbered-phase entry.
- `.prototype/notes.json` — resolve `note-2026-09-01-002` by writing what using it found, rather
  than editing the note away.

---

## Acceptance check

Against `pnpm prototype:reset` (`personal-workspace`) with the host restarted:

1. **The dangle cannot come back.** Hand-edit `.prototype/data.json` to point a *live* task at a
   missing section id; restart the host. It refuses to load, naming the task and the section.
   Repeat pointing it at the `rich-text` section: it refuses, naming the type. Repeat with
   `archivedAt` set and a missing section: it loads.
2. **Cascade, then undo.** Add a second Task List, drag a task into it, remove it with *Archive
   the rows and remove*. The canvas region lists the task; **Restore** returns it to the surviving
   list, and `data.json` shows `archivedAt` gone and a `sectionId` that resolves.
3. **Undo with nothing to go back to.** Cascade the project's *only* Task List, then restore from
   the canvas region. A new Task List appears at the end of the canvas **without a reload**, with
   a `project.section_added` activity row behind it.
4. **Subtasks.** Create a subtask, cascade its container, then try to restore the child alone: it
   is refused, naming the parent. Restore the parent: both come back, in the same list.
5. **Reflections** behave the same way, both directions.
6. **Archive is reachable at all.** Archive a live task from its row; it leaves the list and
   appears in the region.
7. `pnpm test`, `pnpm lint`, `pnpm build`, and `pnpm e2e`.

Items 3 and 4 are the ones that matter: 3 is the case the naive implementation gets wrong, and 4
is the rule review round 1 found missing.

---

## Test plan — written first

House convention: `.test.ts` in `packages/*`, `.spec.ts` in `apps/web`.

| Test | Proves |
|---|---|
| `repositories/data-store.test.ts` — a live task with a missing `sectionId` fails to load | The gap that let the dangle commit |
| `repositories/data-store.test.ts` — a live task whose section is a **view** type fails | The kind clause; without it the rule is a foreign-key check, not the invariant |
| `repositories/data-store.test.ts` — a live task whose section belongs to another project fails | The denormalisation's other half |
| `repositories/data-store.test.ts` — an **archived** task with a missing `sectionId` loads | Step 1C, pinned; without it cascade cannot commit |
| `repositories/data-store.test.ts` — an archived task pointing into another project fails | Lenient about absence, not about scope |
| `repositories/data-store.test.ts` — the same set for reflections | The field exists on both rows |
| `domain/section-service.test.ts` — cascade, then validate the document | The regression test for the friction note |
| `domain/task-service.test.ts` — restore into the original section when it exists **and a decoy container of the same type sits earlier in the canvas** | Without the decoy this passes against an implementation that never re-resolves |
| `domain/task-service.test.ts` — restore after its section was cascaded lands in the surviving container | Resolution, not a dangle |
| `domain/task-service.test.ts` — restore with **no** container creates exactly one, with its activity row | The default-layout door |
| `domain/task-service.test.ts` — restoring a subtask alone is refused, naming the parent | The rule round 1 found missing |
| `domain/task-service.test.ts` — restoring a parent restores archived descendants into one section | `moveSubtree`'s promise, under restore |
| `domain/task-service.test.ts` — restoring a live task is a no-op; `status` and `completedAt` untouched | Idempotence, and archive/status stay unconflated |
| `domain/task-service.test.ts` — restore stamps `updatedAt` | The §62 refresh Step 5 depends on |
| `domain/task-service.test.ts` — an actor with `tasks.write` alone can restore **into a project with no container**, forcing `addWithin` | Otherwise it passes trivially whenever a container exists |
| `domain/task-service.test.ts` — an actor **without** `tasks.write` is refused; a task in another workspace answers not-found, not a rule error | The permission and scoping paths, per the `task-service.ts:62` idiom |
| `domain/reflection-service.test.ts` — archive, restore, restore-again idempotence, and `list` honouring `includeArchived` | The asymmetry closed, and the read path that makes it visible |
| `host/routes.test.ts` — the three new routes, and `GET /api/reflections?includeArchived=true` returning archived rows | The seam, including the query forwarding round 1 found missing |
| `web/archived-region.spec.ts` — hides at zero; restore calls the gateway once and re-reads | The empty state and the `Promise<void>` re-read |
| `web/archived-region.spec.ts` — a failed restore rolls back and shows a message | The failure path, following `task-list-store.spec.ts:224`'s idiom |
| `web/archived-region.spec.ts` — archiving from the live list refreshes the region | Staleness between the two lists |
| `e2e` — cascade the only container and restore through the UI | Acceptance item 3, end to end |

Mutation-check the decoy test, the kind-clause test and the subtask refusal: each passes against a
plausible wrong implementation without it.

---

## Boundaries touched (§1, §8, §12, §70)

- **No `new Date()` in domain.** Everything goes through the injected `Clock` — see the §45 note in
  Step 3, which corrects the first draft's reasoning without changing its conclusion.
- **MCP tools call services, never repositories.** This phase adds no tools.
- **`SectionService` gains no knowledge of tasks.** `resolveRestoreTarget` takes an
  `OwnedDataKind` and returns a section, as `resolveContainer` does; `SectionServiceDependencies`
  holds `TaskRepository`, never `TaskService`, so `TaskService → SectionService` stays acyclic.
- **Components depend on gateway interfaces.** The region calls its store; the store calls the
  gateway. It must not reach into the section-scoped stores.
- **The integrity pass is not a migration.** It rejects a bad document rather than repairing one,
  matching `document.ts`'s stated design.
- **`TaskGateway` is spec-pinned.** Step 5 widens it and Step 6 updates §9 to match. Doing the
  first without the second is the violation.

---

## Explicit non-goals

- **No MCP archive or restore tools.** §54 has no archive tool at all today. Note for the decision
  entry: this is **Slice 22** (§58 agent confirmations, which lists "archive task → confirmation"),
  not Slice 24 — Slice 24's §56 work is *variants of existing tools*, and this would be a new one.
  The first draft mis-cited it.
- **No archived-project guard on restore.** The first draft's test plan asserted a 409 for
  restoring into an archived project; no such rule exists anywhere in `TaskService`, which checks
  only `assertProjectVisible` (`:59-63`). Adding one is a separate product question.
- **No project restore.** Projects archive by status, a different mechanism with its own decision.
- **No trash view, no workspace-wide archive browser, no bulk restore, no undo stack.** The region
  is project-scoped on purpose.
- **No `cancelled` unification** (`2026-08-task-status-transitions-and-archive.md`).
- **No retention or purge** (§80), and archived rows are the evidence this phase preserves.
- **No milestone archive.** Milestones have no container and no `archivedAt`.

---

## Open questions

**1. Which of Step 1's five options? *(Blocks everything. Escalated — the answer changes the shape
and cost of the phase.)*** Recommendation D if the phase can be wide, otherwise C. Steps 2–7 cost
C. D removes the need for Step 2's lenient branch, Step 3's `resolveRestoreTarget`, and most of
Step 5's reachability argument, and replaces them with excluding archived sections from every
section read.

**2. If C: does restore go back to the original section, or always to the first container?**
Recommended **original when it still exists**. Always-resolve is one branch simpler but silently
moves rows that had a perfectly good home.

**3. If C: should cascade repoint archived rows to a surviving container as well?** Recommended
**no** — it makes cascade's behaviour depend on whether another container happens to exist. Step 1
puts the resolution in one place instead.

**4. Does the canvas region show rows archived individually as well as by cascade?** Recommended
**yes, all of them** — the store cannot distinguish them, and a provenance field to do so would be
a new column for a UI nicety.

**5. Does `TaskQuery` need `archivedOnly`?** Genuinely open and cheap either way. Start with
`includeArchived: true` plus a client filter; add the field only if search or the dashboard wants
it. Decide during Step 5.

1 blocks Step 2. 2 and 3 block Step 3. 4 and 5 can be settled inside Step 5.

---

## Decision entries this phase must write

- `docs/decisions/2026-09-what-undo-means-for-an-archived-row.md` — the §78 entry. Its interesting
  content is Step 1's five options and why the chosen one wins, plus the subtask rule, which is
  where the abstract question ("where does a row come back to?") turns out to already have an
  answer in the codebase.
- An amendment to `2026-09-sections-own-their-data.md` per Step 6. A decision that claimed
  something untrue for a fortnight is worth recording as such — §77's rule is that the prototype
  correcting the design is the output, not an embarrassment.

---

## Commit sequence

```
repositories: a live row must have a section that renders it
domain: restore resolves where an archived row comes back to
host: archive and restore, for reflections too
web: archived rows are visible, and restorable, from the canvas
docs+spec: what undo means for an archived row
```

**Step 2 lands green on its own** — the first draft claimed Steps 2–3 had to land together
because "the integrity check rejects documents that the pre-Step-3 cascade produces". It does not:
the pre-Step-3 cascade produces *archived* rows with dangling pointers, which is exactly what the
lenient branch accepts. Checked against the other producers too — reassign repoints all rows
including archived (`:325`), `moveSubtree` repoints descendants, `duplicate` copies no rows, and
no seed sets `archivedAt`.

---

## Sequencing against the sibling plan

`2026-09-section-names-implementation.md` and this one are independent — different files, no
shared surface — except that both touch `docs/decisions/2026-09-sections-own-their-data.md` and
`development.md`. Expect a trivial conflict in those two.

If only one is built, build **this one**: the other fixes prose, this one fixes a document that
can hold a reference nothing validates.

---

## Environment

`pnpm e2e` was **already failing before either plan was written**, for a reason neither causes.
Playwright starts the host with `CWM_DATA_FILE=.prototype/e2e-data.json`
(`playwright.config.ts:28`), and that file was last written on 31 August — before the ownership
phase bumped `SCHEMA_VERSION` to 2. It held `schemaVersion: 1` and a task with no `sectionId`, so
`JsonDataStore.load` rejected it and the host never came up for the specs to seed it.

The schema pin behaving as designed, in the one place the ownership phase could not see: `pnpm e2e`
is deliberately not part of `pnpm test`
(`docs/decisions/2026-08-e2e-owns-its-servers-and-its-data.md`), so a green suite proved nothing
about it. The file is gitignored generated state; the host reseeds when it is absent
(`store.ts:56-58`). It has been deleted.

Worth carrying forward: **a `SCHEMA_VERSION` bump invalidates every data file, not only
`.prototype/data.json`.** Anything that bumps it should run `pnpm e2e` once, or delete
`e2e-data.json`, in the same change.

---

## Revisions

Round 1, against a cold-start reviewer briefed with the plan, the spec §N list and AGENTS.md §1.
Five blocking findings and nine minor; all checked against the code before acting, and all held.

1. **Subtasks were missing entirely.** `sectionFor` refuses to give a subtask a section other than
   its parent's (`task-service.ts:154-159`, `:250-256`) and `moveSubtree` repoints descendants —
   and cascade archives parents and children alike, so this is the *normal* path. A naive restore
   would have broken the invariant on the first subtask anyone restored. Step 3 now refuses a
   lone child and restores a subtree together; two tests and acceptance item 4 cover it.
2. **The integrity rule did not enforce the plan's own Goal.** It checked existence and project
   only, so a live task pointing at a `progress` section would have passed — a live row nothing
   renders. Step 2 gained the kind clause that `requireContainer` already encodes on the write path.
3. **The acceptance check that the plan called decisive was unreachable.** Item 3 cascades the only
   container and then restores "from the dashboard-visible archived row" — no such surface exists
   (`dashboard-service.ts:80` filters archived rows; nothing in `apps/web` asks for them), and the
   per-section disclosure it did build cannot exist when no section survives. Step 5's region moved
   to the canvas, and the claim that live refresh "already exists for this path" was corrected: the
   revision bump repaints containers, but a restore that *creates* one needs `reconcileSections`.
4. **The reflections half had no read path.** `ReflectionService.list` takes no `includeArchived`,
   and `GET /api/reflections` parses the flag then drops it, in three separate places. Step 3 and
   Step 4 now name all of them; the first draft's file list did not, which AGENTS.md §3 says it must.
5. **Step 1 was a decision dressed as a survey.** It rejected "clear `sectionId`" on a false
   ground — a dangling pointer weakens the invariant exactly as much as an absent one, and is
   harder to work with — and never evaluated the two options that matter: archiving the section
   rather than deleting it, and retracting `cascade` altogether, which Step 0 had itself raised.
   Step 1 is now five options, and unresolved, because the strongest of them changes the shape of
   the work.
6. **The commit-sequence rationale was self-contradictory** — Step 2's lenient branch accepts
   precisely what the pre-Step-3 cascade produces, so Step 2 lands green alone.
7. Smaller corrections: a test asserting a 409 for a domain rule that does not exist; `TaskGateway`
   being §9-pinned "verbatim", so adding `restore` means editing the spec; `archive` returning
   `Promise<void>`, so the store must re-read; `resolveRestoreTarget` needing `sections.find`
   rather than `require`, which throws for exactly the case it handles; the §45 reasoning, whose
   conclusion held but whose stated reason would mislead an implementer into skipping `updatedAt`;
   the MCP-tool deferral belonging to Slice 22 rather than 24; missing permission, empty-state,
   failure-path and staleness tests; a "restore into the original section" test that passes without
   any re-resolution unless a decoy container is present; and the specification mentioning archive
   four times, not three.

The reviewer also confirmed, against the code, every load-bearing factual claim in Step 0 — the
cascade dangle, the pre-archived rows dangling too, the absent `sectionId` checks, `ReflectionService`
having no archive, no UI calling `TaskGateway.archive`, and nothing anywhere un-archiving a row —
and confirmed two things a reviewer would be expected to attack and which are sound: validation
runs once at unit close, so Step 2 introduces no intra-unit ordering hazard, and
`resolveRestoreTarget` inheriting `resolveContainer`'s permission behaviour is consistent rather
than a hole. It also found that `unitOfWorkFor`'s adapter **does** join a nested call
(`data-store.ts:321`), so the re-entrancy hazard suspected in the brief is not real — but
`resolveContainer` still documents that it must be called inside an open unit, and
`resolveRestoreTarget` must say the same.
