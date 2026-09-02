# Implementation plan — archive keeps its promise

Follow-up to `docs/plans/2026-09-section-ownership-implementation.md`, from the friction that
phase's browser pass recorded (`.prototype/notes.json`, `note-2026-09-01-002`).

**Goal.** An archived row can be brought back, always lands in a section that exists, and the
document refuses to hold a live row that nothing renders.

**Not in scope.** Naming sections, which is the sibling plan
`2026-09-section-names-implementation.md`.

---

## Step 0 — Four facts that change the obvious approach

**The decision already claims what this plan has to build.**
`docs/decisions/2026-09-sections-own-their-data.md` justifies cascade-as-archive with
"`archivedAt` … is deliberately distinct from `cancelled`, so this is undoable." That is true of
the field and untrue of the application: grepping `packages/domain/src`,
`apps/prototype-host/api` and `apps/web/src/app` for `unarchive`, `restore` or a write of
`archivedAt: null` returns nothing outside unrelated prose. **Nothing has ever performed the
undo the decision promises.** This phase is not adding a feature the spec asked for — the
specification mentions archive three times and restore never — it is making an existing claim
true, or else retracting it.

**`settleRows` already contains the argument against its own cascade branch.**
`packages/domain/src/section-service.ts:285` says, of reassign:

> Reassign still repoints the archived ones, because unarchiving a row into a section that no
> longer exists would be the worse outcome.

Cascade, twelve lines later, produces exactly that: it stamps `archivedAt` on the live rows and
leaves `sectionId` pointing at the section it is about to delete. This is not two opinions — it
is one opinion applied on one branch. The verified example from the last phase's browser pass:

```
section-4f7e064c | Measure the hallway shelf | archivedAt= 2026-09-02T06:13:32.422Z
```

`section-4f7e064c` no longer exists. **Rows already archived before the cascade dangle too**,
because `live` filters them out and the cascade branch never repoints anything.

**The integrity pass never learned about the field the last phase added.**
`validateDocumentIntegrity` (`packages/repositories/src/data-store.ts:129-137`) checks a task's
`projectId` and its `parentTaskId`, a section's and a reflection's `projectId`, activity targets
and workspace scope. It does not check `task.sectionId` or `reflection.sectionId` — the one
relationship the ownership phase exists to enforce is the one relationship it does not verify.
That is why the dangling pointer above committed cleanly and survives every reload.

**Reflections can be archived but not by anything that meant to.** `TaskService.archive` exists
(`task-service.ts:202`) and `TaskGateway.archive` is declared
(`work-manager-gateway.ts:44`) — but **no UI calls it**, and the task list always asks
`includeArchived: false`. `ReflectionService` has no archive at all: a reflection can acquire
`archivedAt` only by having its container cascaded, through `SectionService.writeRow`, and
nothing can ever clear it. The asymmetry is the bug in miniature.

---

## Step 1 — Decide what `sectionId` means on an archived row

This is the design decision the whole plan turns on, and it must be settled before any code.
Three shapes were considered:

- *Cascade repoints to a surviving container.* Fails when there is none, which is the common
  case — you removed the only Task List. Rejected.
- *Cascade clears `sectionId`.* Requires making the field optional again, which reopens the
  invariant the last phase closed. Rejected outright.
- **Restore resolves the container. Chosen.** `sectionId` on an archived row is a *hint*, not a
  guarantee. Restore goes back where it came from when that section still exists and still holds
  the right kind; otherwise it resolves through `SectionService.resolveContainer` — the same door
  `create` already uses when no section is named.

This reading is the one the ADR already implies. Its invariant is that no data can exist in a
project **without being rendered**; an archived row is deliberately unrendered, so it is not
under that rule. The invariant is therefore about *live* rows, and Step 2 enforces exactly that
and no more.

`settleRows`' reassign branch keeps repointing archived rows. It becomes an optimisation rather
than a correctness requirement — the pointer stays useful — and its comment needs rewriting to
say so, or it will read as a rule that cascade breaks.

---

## Step 2 — Repositories: the integrity pass checks the field

`packages/repositories/src/data-store.ts`, in the existing task loop beside the `parentTaskId`
check, and in the reflection loop:

```ts
const containerFor = (collection: string, id: string, row: { sectionId: string; projectId: string; archivedAt?: string }) => {
  const section = sections.get(row.sectionId);
  // A live row must be rendered by a section of its own project — the ownership invariant.
  if (row.archivedAt === undefined) {
    if (section === undefined) fail(`${collection} "${id}" has missing section "${row.sectionId}"`);
    if (section.projectId !== row.projectId) fail(`${collection} "${id}" has a section from another project`);
    return;
  }
  // An archived row's section is a hint: it may be gone (cascade removed it), but if it
  // resolves it must not point into another project. Restore re-resolves either way.
  if (section !== undefined && section.projectId !== row.projectId) {
    fail(`archived ${collection} "${id}" has a section from another project`);
  }
};
```

Two notes on the surrounding code, both checked rather than assumed:

- **The index order already works.** `sections` is built at `data-store.ts:97`, well before the
  reflection and task loops at 131-137, so `containerFor` can be dropped in beside `projectFor`
  with no reordering.
- **All six seeds already satisfy the new rule** — the ownership phase gave every seeded row a
  `sectionId` and `seeds.test.ts` compares all six snapshots byte-for-byte. Re-run
  `pnpm --filter @cwm/prototype-data test` first anyway: if a seed were wrong, every suite would
  fail at document load rather than in one place, which is a miserable way to find out.

**Before the first run of this phase, delete any stale `.prototype/e2e-data.json`.** It is
gitignored and regenerated (`store.ts:56` seeds on first run when the file is absent), but a file
left over from before the ownership phase carries `schemaVersion: 1` and stops the e2e host at
startup — see *Environment* below.

**Verify:** `pnpm --filter @cwm/repositories test`, then `pnpm --filter @cwm/prototype-data test`.

---

## Step 3 — Domain: restore, and the container it lands in

### `packages/domain/src/section-service.ts`

Add the resolution used by both restores. It must **not** check `projects.write` — restoring a
task is a `tasks.write` a caller does on its own behalf, following `resolveContainer`'s own rule:

```ts
/**
 * Where an archived row goes when it comes back. Its own section when that still exists and
 * still holds this kind; otherwise the project's first container, or a new one — the same
 * door `resolveContainer` opens on create.
 */
async resolveRestoreTarget(
  actor: ActorContext,
  projectId: ProjectId,
  sectionId: SectionId,
  owned: OwnedDataKind,
): Promise<ProjectSection>
```

Rewrite the `settleRows` comment per Step 1.

### `packages/domain/src/task-service.ts`

`restore(actor, id)`, mirroring `archive` (`task-service.ts:202`):

- Idempotent — a live task returns unchanged, as `archive` does for an already-archived one.
- Resolves the target through `resolveRestoreTarget` and writes `sectionId` alongside clearing
  `archivedAt`, in one commit.
- Records `task.restored`, a new `TaskAction` beside `task.archived`, with verb `Restored`.
- Does **not** touch `status`. Archiving never changed it, so restoring must not either.

### `packages/domain/src/reflection-service.ts`

`archive` and `restore`, matching the task pair. Cascade already writes `archivedAt` on
reflections through `SectionService.writeRow`; this is the service surface that should have
existed when the field was added.

**Verify:** `pnpm --filter @cwm/domain test`.

---

## Step 4 — Host API

`apps/prototype-host/api/routes.ts`, symmetric with the existing
`POST /api/tasks/:id/archive`:

- `POST /api/tasks/:id/restore`
- `POST /api/reflections/:id/archive`
- `POST /api/reflections/:id/restore`

**Verify:** `pnpm --filter @cwm/prototype-host test`, plus one `curl` round trip through
`pnpm --filter @cwm/prototype-host acceptance`-style manual use: archive, read the file,
restore, read it again.

---

## Step 5 — Web: seeing and undoing an archive

`WorkManagerGateway` (`apps/web/src/app/core/gateway/work-manager-gateway.ts`) —
`tasks.restore(id)`, `reflections.archive(id)`, `reflections.restore(id)`. `tasks.archive`
already exists and finally gains a caller, which is what that file's own rule requires of a
declared method.

`apps/web/src/app/features/tasks/task-list-store.ts` — a second, lazily-loaded archived list for
the section, kept apart from `tasks()` so the live list's shape never changes:
`archivedTasks()`, `archivedLoading()`, `loadArchived()`, `restore(id)`, `archive(id)`.

`task-list-section.html` — a disclosure at the foot of the list:

```
▸ Archived (2)
```

Expanded, it lists archived rows muted and non-interactive except for **Restore**. Local
component state, not `config` — this is a "what am I looking at right now" affordance, not a
saved layout property, and persisting it would put a per-viewer preference into shared project
data.

The same disclosure on the Reflections section, for the same reason cascade archives them.

Restoring bumps `projectDataRevision` through the existing `onProjectDataChange` path, so a row
restored into a *different* container appears there without a reload — that path already exists
for the cascade and reassign case (`project-page-store.ts:459`).

**Verify:** `pnpm --filter web test`, then `pnpm lint` and `pnpm build`.

---

## Step 6 — Docs

- `docs/decisions/2026-09-what-undo-means-for-an-archived-row.md` — the §78 entry.
- `docs/decisions/2026-09-sections-own-their-data.md` — correct it. Its "so this is undoable"
  now points at a real operation, and its *Confidence* section should record that the reassign
  policy finally has UI behind it (it currently reads "Low … no UI behind it yet").
- `development.md` — a third unnumbered-phase entry.
- `.prototype/notes.json` — resolve `note-2026-09-01-002` by writing what using it found, rather
  than editing the note away.

---

## Acceptance check

Run against `pnpm prototype:reset` (`personal-workspace`) with the host restarted:

1. **The dangle cannot come back.** Hand-edit `.prototype/data.json` to point a *live* task at a
   missing section id; restart the host. It refuses to load, naming the task and the section.
   Repair it, and a task with `archivedAt` set and the same missing section id loads fine.
2. **Cascade, then undo.** Add a second Task List, drag a task into it, remove it with
   *Archive the rows and remove*. The remaining Task List's `Archived (1)` disclosure lists the
   task; **Restore** puts it back into the surviving list, and `data.json` shows `archivedAt`
   gone and a `sectionId` that resolves.
3. **Undo with nothing to go back to.** Cascade the project's *only* Task List, then restore
   from the dashboard-visible archived row. A new Task List appears at the end of the canvas,
   with a `project.section_added` activity row behind it — a default layout reached by the
   existing door, exactly as create does.
4. **Reflections behave the same way**, both directions.
5. **Archive is reachable at all.** Archive a live task from the row, confirm it leaves the list
   and appears under Archived.
6. `pnpm test`, `pnpm lint`, `pnpm build`, and `pnpm e2e`.

Item 3 is the acceptance check that matters: it is the note, resolved, and it is the case the
naive implementation gets wrong.

---

## Test plan — written first

| Test | Proves |
|---|---|
| `repositories/data-store.spec.ts` — a live task with a missing `sectionId` fails to load | The gap that let the dangle commit |
| `repositories/data-store.spec.ts` — a live task whose section belongs to another project fails | The denormalisation's other half |
| `repositories/data-store.spec.ts` — an **archived** task with a missing `sectionId` loads | Step 1's decision, pinned; without it cascade cannot commit |
| `repositories/data-store.spec.ts` — an archived task pointing into another project fails | The lenient rule is lenient about *absence*, not about scope |
| `repositories/data-store.spec.ts` — the same four for reflections | The field exists on both rows |
| `domain/section-service.spec.ts` — cascade then integrity-validate the document | The two halves agree; this is the regression test for the friction note |
| `domain/task-service.spec.ts` — restore into the original section when it still exists | The common case goes back where it was |
| `domain/task-service.spec.ts` — restore after its section was cascaded lands in the surviving container | Resolution, not a dangle |
| `domain/task-service.spec.ts` — restore with **no** container creates exactly one, with its activity row | The default-layout door, and that it is not a second code path |
| `domain/task-service.spec.ts` — restoring a live task is a no-op; `status` is untouched | Idempotence, and archive/status stay unconflated |
| `domain/task-service.spec.ts` — an actor with `tasks.write` alone can restore | `resolveRestoreTarget` does not re-check `projects.write` |
| `domain/reflection-service.spec.ts` — archive and restore, mirroring the task pair | The asymmetry is closed |
| `host/routes.spec.ts` — all three new routes, plus 409 on a restore into an archived project | The seam |
| `web/task-list-store.spec.ts` — archived rows load lazily and do not appear in `tasks()` | The live list's shape is unchanged |
| `web/task-list-section.spec.ts` — the disclosure counts, and Restore calls the gateway once | The affordance |
| `e2e` — cascade a container and restore the row through the UI | The claim, end to end |

Mutation-check the third repositories test and the cascade-then-validate test: each passes
trivially against a wrong rule. Delete the line each covers and watch it fail before trusting it.

---

## Boundaries touched (§1, §8, §12, §70)

- **Domain services depend on repository interfaces and `Clock` only.** `restore` reads the clock
  for nothing — it *clears* a timestamp — so no `new Date()` appears, and the §45 lint stays quiet.
- **MCP tools call services, never repositories.** This phase adds no tools (see non-goals), so
  `import-lint.test.ts` has nothing new to police.
- **`SectionService` must not learn about tasks.** `resolveRestoreTarget` takes an
  `OwnedDataKind` and returns a section, exactly as `resolveContainer` does. The dependency
  direction stays `TaskService → SectionService`, and the cycle check the last phase ran still
  holds.
- **Components depend on gateway interfaces.** The disclosure calls the store; the store calls
  the gateway.
- **The integrity pass is not a migration.** It rejects a bad document rather than repairing one,
  matching `document.ts`'s stated design that a stale file fails at load.

---

## Explicit non-goals

- **No MCP archive or restore tools.** §54 has no archive tool today; adding one is a §56 tool-shape
  question and belongs with Slice 24's experiments. Note it in the decision entry.
- **No project restore.** `PATCH /api/projects/:id` with a status already covers projects, and
  their archive is a status rather than a timestamp — a different mechanism with a different
  decision behind it.
- **No trash view, no workspace-wide archive browser, no bulk restore, no undo stack.** The
  disclosure is per-container on purpose: it puts undo where the thing was lost.
- **No `cancelled` unification.** `2026-08-task-status-transitions-and-archive.md` keeps them
  distinct; nothing here reopens it.
- **No retention or purge.** §80's never-build list, and archived rows are the evidence this
  phase exists to preserve.
- **No milestone archive.** Milestones have no container and no `archivedAt`.

---

## Open questions

**1. Does restore go back to the original section, or always to the first container?** Recommended
**original when it still exists**, resolution otherwise. Always-resolve is one branch simpler, but
it would silently move rows on a restore that had a perfectly good home, and reassign's existing
comment shows the author already valued the pointer.

**2. Should cascade repoint archived rows to a surviving container, belt-and-braces?** Recommended
**no**. It makes cascade's behaviour depend on whether another container happens to exist, which is
a rule with two shapes; Step 1 puts the resolution in exactly one place instead. Worth stating in
the decision entry, because it is the plausible alternative a reviewer will raise.

**3. Should the archived disclosure show rows archived individually, or only by cascade?** Recommended
**all archived rows of that section** — the store cannot distinguish them, and inventing a
provenance field to do so would be a new column for a UI nicety.

**4. Does `TaskQuery` need an `archivedOnly`, or is `includeArchived` plus a client filter enough?**
Genuinely open, and cheap either way. Recommendation: start with `includeArchived: true` and filter
client-side; add the query field only if the dashboard or search wants it too. Decide during Step 5,
not before.

1 and 2 must be settled before Step 3. 3 and 4 can be settled inside Step 5.

---

## Decision entries this phase must write

- `docs/decisions/2026-09-what-undo-means-for-an-archived-row.md` — the §78 entry. Its interesting
  content is Step 1: that `sectionId` on an archived row is a hint rather than a guarantee, that the
  ownership invariant is about live rows, and that restore resolves through the same door create
  uses.
- An amendment to `2026-09-sections-own-their-data.md`, per Step 6. A decision that claimed
  something untrue for a fortnight is worth recording as such — §77's rule is that the prototype
  correcting the design is the output, not an embarrassment.

---

## Commit sequence

One per step. Steps 2–3 must land together: the integrity check rejects documents that the
pre-Step-3 cascade produces, so a tree with one and not the other does not boot.

```
repositories: a live row must have a section that renders it
domain: restore resolves where an archived row comes back to
host: archive and restore, for reflections too
web: archived rows are visible, and restorable, where they were lost
docs: what undo means for an archived row
```

---

## Sequencing against the sibling plan

`2026-09-section-names-implementation.md` and this one are independent — different files, no
shared surface — with one exception: both touch `docs/decisions/2026-09-sections-own-their-data.md`
and `development.md`. Take them in either order and expect a trivial conflict in those two files.

If only one is built, build **this one**. The names plan fixes prose; this one fixes a document
that can hold a reference nothing validates.

---

## Environment

`pnpm e2e` was **already failing on this machine before either plan was written**, for a reason
neither plan causes. Playwright starts the host with
`CWM_DATA_FILE=.prototype/e2e-data.json` (`playwright.config.ts:28`), and that file was last
written on 31 August — before the ownership phase bumped `SCHEMA_VERSION` to 2. It still holds
`schemaVersion: 1` and a task with no `sectionId`, so `JsonDataStore.load` rejects it and the
host never comes up for the specs to seed it.

This is the schema pin behaving exactly as designed, in the one place the ownership phase could
not see: `pnpm e2e` is deliberately not part of `pnpm test`
(`docs/decisions/2026-08-e2e-owns-its-servers-and-its-data.md`), so a green suite proved nothing
about it. The file is gitignored generated state; deleting it is the whole fix, and the host
recreates it on the next run. It has been deleted.

Worth carrying forward as a standing item rather than a one-off: **a `SCHEMA_VERSION` bump
invalidates every data file, not only `.prototype/data.json`.** Anything that bumps it should
run `pnpm e2e` once, or delete `e2e-data.json`, in the same change.
