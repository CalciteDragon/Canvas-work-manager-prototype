# Implementation plan — archive keeps its promise

Follow-up to `docs/plans/2026-09-section-ownership-implementation.md`, from the friction that
phase's browser pass recorded (`.prototype/notes.json`, `note-2026-09-01-002`).

**Goal.** Removing a container that holds work archives it whole — the section and its rows
together — and restoring it brings the same thing back. No row, live or archived, ever points at
a section that does not exist.

**Spec sections.** §9 (`TaskGateway`'s pinned surface), §29/§30/§31 (the registry, adding a type,
the frame's remove control), §33/§34 (subtasks), §45 (injected clock), §54/§56 (the tool set and
tool-shape experiments), §58 (agent confirmations), §62 (live updates), §69 (end-to-end tests),
§71 (deliberately disposable), §77 (correcting the design from use), §78 (the decision log),
§80 (never build).

**Not in scope.** Naming sections, which is the sibling plan
`2026-09-section-names-implementation.md`.

---

## Step 0 — Five facts that change the obvious approach

**The decision already claims what this plan has to build.**
`docs/decisions/2026-09-sections-own-their-data.md` justifies cascade-as-archive with
"`archivedAt` … is deliberately distinct from `cancelled`, so this is undoable." True of the field
and untrue of the application: a repo-wide search of `packages` and `apps` for `unarchive`,
`restore`, or a write of `archivedAt: null | undefined` returns only unrelated prose,
`vi.restoreAllMocks`, optimistic-rollback comments and test names. **Nothing has ever performed
the undo the decision promises.** The specification mentions archive four times — line 374
(`archive(id: TaskId)` in §9's `TaskGateway`), 2008 and 2011 (§58), 2922 (§81) — and restore never.

**`settleRows` contains the argument against its own cascade branch.**
`section-service.ts:287-288` says, of reassign:

> Reassign still repoints the archived ones, because unarchiving a row into a section that no
> longer exists would be the worse outcome.

Cascade, twelve lines later, produces exactly that: `:306-310` writes only `archivedAt`, and
`remove` at `:278` hard-deletes the section. From the last phase's browser pass:

```
section-4f7e064c | Measure the hallway shelf | archivedAt= 2026-09-02T06:13:32.422Z
```

`section-4f7e064c` no longer exists. **Rows archived *before* a cascade dangle too**: `:297`
filters them out of `live`, `:298` returns early when nothing is live, and the section is
hard-deleted without touching them. That second case is not fixed by any policy — it happens with
no policy at all — and it is the one this plan's approach closes for free.

**The integrity pass never learned about the field the last phase added.**
`validateDocumentIntegrity` (`data-store.ts:129-139`) checks a task's `projectId` and
`parentTaskId`, and a section's, milestone's and reflection's `projectId`. The string `sectionId`
does not appear in the function. Validation runs once at unit close (`data-store.ts:280`), not per
write, so a rule added here sees only committed states — no intra-unit ordering hazard.

**Archive is half-built on both rows it applies to.** `TaskService.archive` exists
(`task-service.ts:202`) and `TaskGateway.archive` is declared (`work-manager-gateway.ts:44`) —
but **no UI calls it**: the one `.archive(` in `apps/web` is `project-page.ts:131`, the *project*.
`ReflectionService` has no archive at all, so a reflection can acquire `archivedAt` only by having
its container cascaded, and nothing can ever clear it.

**`SectionRepository.remove` documents the opposite of what this plan does.**
`packages/repositories/src/interfaces.ts:35-40`:

> The one repository that deletes. A section is view configuration with no independent history,
> so §31's remove control is a real delete rather than a flag — which would need a contracts
> change §30 argues against.

**This plan disagrees with that comment, deliberately, and must rewrite it rather than work around
it** (AGENTS.md §2 rule 4: when intent changes, change the test *and* the implementation *and* the
doc). What the prototype disproved is the premise: a container is not "view configuration with no
independent history" — since the ownership phase it holds rows, and those rows are history. The
§30 clause is also a misreading worth correcting: §30 promises that adding a section *type* touches
one place, and says nothing about adding a *field* to `ProjectSection`. The comment was right about
views and is wrong about containers, which is exactly the split the ownership phase introduced
after it was written.

---

## Step 1 — Cascade archives the section, not just its rows *(resolved)*

Of the five options review round 1 put on the record, this is **D**, chosen by the user over the
first draft's C ("restore resolves the container").

> Removing a container that still holds work sets `archivedAt` on the **section** and on its live
> rows, and stamps each of those rows with `archivedWithSectionId`. The section leaves the canvas;
> nothing is deleted.

What that buys, all of it structural rather than a rule to remember:

- **`sectionId` can never dangle.** Every row's section still exists, so the integrity rule in
  Step 2 is strict for *every* row with no lenient branch — which is what makes the Goal's sentence
  enforceable rather than aspirational.
- **`resolveRestoreTarget` disappears.** The first draft's whole "where does a row come back to?"
  mechanism, and its subtask interaction with `resolveContainer`, evaporate: a row comes back to
  the section it names, because that section is still there.
- **The pre-archived-rows case closes for free.** A container holding only already-archived rows
  is archived rather than hard-deleted, so those rows keep a section too.
- **Undo becomes one operation.** Restoring the section brings back the section and the rows it
  archived, which is what a person means by undoing a removal. Under C it was a row-at-a-time
  reconstruction of something they removed in one click.
- **No `SCHEMA_VERSION` bump.** `archivedAt` is optional, so a document written before this phase
  still parses. The ownership phase's 1 → 2 bump is not repeated, and no reseed is forced.

**What it costs, stated plainly:** every read of sections must now exclude archived ones, and there
are more of those than the first draft's approach touched — `SectionService.ordered`/`list`,
`resolveContainer`, `requireContainer`, `duplicate`, `move`, `SectionQuery`, the sections route,
`list_sections`, and the canvas. Missing one is a bug that shows an archived section on the canvas
or lets a new row be created into one. Step 3 enumerates them; the test plan pins each.

**Removal keeps three behaviours, and only the cascade branch changes:**

| Case | Today | After |
|---|---|---|
| View section | hard delete | unchanged |
| Container, no rows at all | hard delete | unchanged |
| Container, only archived rows | **hard delete — leaves them dangling** | archive the section; no policy needed |
| Container, live rows, no policy | refuse, naming the count | unchanged |
| Container, live rows, `cascade` | archive rows, delete section | **archive section *and* rows, each row stamped `archivedWithSectionId`** |
| Container, live rows, `reassign` | repoint all rows, delete section | unchanged |

Hard delete stays the common path, so the document does not accumulate tombstones for sections
nobody put work in.

**This amends the decision of record**, and Step 6 must say so rather than only recording that
"undoable" became true. The ADR's removal semantics said cascade "archives the rows"; it now
archives the container. The invariant it states — every row has a `sectionId`, every section
renders, so no row can be invisible — is *strengthened*: it holds for archived rows too, with
"renders" narrowed to "exists and would render if restored".

---

## Step 2 — Contracts and repositories

`packages/contracts/src/section.ts` — `ProjectSectionSchema` gains
`archivedAt: z.string().datetime().optional()`, matching `Task`'s and `Reflection`'s field
exactly.

`packages/contracts/src/task.ts` and `reflection.ts` — both gain
`archivedWithSectionId: SectionIdSchema.optional()`: **present means this row was archived as part
of its container's removal, and names the container it came down with.** Absent means it was
archived on its own, or is live. Restoring a section brings back exactly the rows that name it;
restoring a row clears it.

Both fields are optional, so a document written before this phase still parses: no
`SCHEMA_VERSION` change and no reseed.

`packages/contracts/src/inputs.ts:180` — `SectionQuerySchema` gains
`includeArchived: z.boolean().optional()`, matching `TaskQuery`/`ReflectionQuery`.

`packages/repositories/src/json-repositories.ts:124` — `JsonSectionRepository.list` filters on it
with the same predicate the other two use (`json-repositories.ts:110`, `:154`):
`(query.includeArchived === true || section.archivedAt === undefined)`.

`packages/repositories/src/interfaces.ts:35-40` — **rewrite the `remove` comment** per Step 0. It
still deletes; what changes is when the service calls it and why.

`packages/repositories/src/data-store.ts` — the integrity rule, strict throughout:

```ts
const containerFor = (collection: string, id: string, row: OwnedRowShape, expected: OwnedDataKind) => {
  const section = sections.get(row.sectionId) ??
    fail(`${collection} "${id}" has missing section "${row.sectionId}"`);
  if (section.projectId !== row.projectId) fail(`${collection} "${id}" has a section from another project`);
  // The clause that makes this the ownership invariant rather than a foreign-key check: a
  // `progress` section renders nothing it owns, so a row held by one is a row nothing renders.
  if (ownedKindOf(section.type) !== expected) fail(`${collection} "${id}" is held by a ${section.type} section`);
  // A live row in an archived section is off the canvas with nothing saying so.
  if (row.archivedAt === undefined && section.archivedAt !== undefined) {
    fail(`${collection} "${id}" is live in an archived section`);
  }
  // The marker describes an archive that happened; it cannot outlive one.
  if (row.archivedWithSectionId !== undefined) {
    if (row.archivedAt === undefined) fail(`live ${collection} "${id}" is marked as archived with a section`);
    if (row.archivedWithSectionId !== row.sectionId) fail(`${collection} "${id}" is marked as archived with another section`);
  }
};
```

The live-in-archived clause is the one this approach earns. Under the rejected alternative it could
not exist, because an archived row's section was allowed to be gone entirely.

The two marker clauses are why the column is worth its redundancy: `archivedWithSectionId` always
equals `sectionId` when present, so the integrity pass can assert it, and a bug that sets one
without the other — or leaves the marker behind on restore — fails at the next commit rather than
surfacing as a section that restores the wrong rows weeks later.

Two notes, both checked: `sections` is built at `data-store.ts:97`, before the row loops at
129-139; and no seed carries `archivedAt` on any row (`seeds.ts:89,103,202`), so all six pass
unchanged. Run `pnpm --filter @cwm/prototype-data test` first regardless — a wrong seed fails every
suite at document load rather than in one place.

**Before the first run of this phase, delete any stale `.prototype/e2e-data.json`** — see
*Environment*.

**Verify:** `pnpm --filter @cwm/contracts test`, `pnpm --filter @cwm/repositories test`,
`pnpm --filter @cwm/prototype-data test`.

---

## Step 3 — Domain: SectionService

**Every read of sections becomes live-only.** The enumeration is the checklist:

- `ordered(projectId)` — the canvas order, and the basis of `position`. Live only.
- `list` — through `ordered`, so live only, with `includeArchived` reserved for Step 5's region.
- `resolveContainer` (`:153`) and `requireContainer` (`:166`) — **must ignore archived sections**.
  A new row must never be created into, or moved into, an archived container; `resolveContainer`
  falling through to `addWithin` is the correct behaviour when the only container is archived.
- `duplicate` and `move` — refuse on an archived section.
- `require` (`:79`) stays as it is: it is the unchecked lookup the write paths use, and restore
  needs to find an archived section by id.

**`remove` gains the archive branch** per Step 1's table. Mechanically:

- `settleRows`' early return at `:298` becomes: no rows at all → fall through to hard delete; rows
  but none live → archive the section, no policy required.
- The cascade branch sets `archivedAt` on the section and on each live row, and
  `archivedWithSectionId` on each of those rows. One clock read for tidiness, but nothing depends
  on the timestamps matching.
- Archiving renumbers the surviving live siblings exactly as deletion does — an archived section
  leaves the position sequence, and `renumber` already takes the list to keep dense.
- Records `project.section_archived`, a new `SectionAction`. `project.section_removed` stays for
  the delete branches, because they are different events and the feed should not claim otherwise.

**`restoreSection(actor, id)`** — new, under `projects.write`:

- Clears the section's `archivedAt` and appends it at the end of the canvas (`position` = the live
  count), which is where `addWithin` puts a new one. A restored section going back to its old index
  would need positions the canvas has since reused.
- Restores **the rows it archived**: those whose `archivedWithSectionId` is this section. Their
  `archivedAt` and `archivedWithSectionId` both clear. A row archived on its own beforehand carries
  no marker, so it stays archived — which is what the person who archived it asked for.
- Records `project.section_restored`.

**On nested units of work:** `addWithin`'s comment (`:100-107`) says "`runUnitOfWork` does not
re-enter -- a nested call throws `UnitOfWorkInProgressError`". That is true of
`DataStore.runUnitOfWork` (`data-store.ts:49-60`), and **not** of the `UnitOfWork` the services
actually hold: `unitOfWorkFor` explicitly *joins* a nested call on the same async stack
(`data-store.ts:306-308`), because queueing it would deadlock. So a service method calling another
service's `run` is safe. `addWithin` is still the right seam for its own reasons, but the comment
overstates the constraint and should be corrected while this phase is in the file.

**Verify:** `pnpm --filter @cwm/domain test`.

---

## Step 4 — Domain: rows

### `packages/domain/src/task-service.ts` — `restore(actor, id)`

Mirrors `archive` (`:202`), with the rule the first draft missed:

**Subtasks restore with their parent, never alone.** `sectionFor` enforces that a subtask is
rendered by its parent's section and cannot be given another (`:154-159`, `:250-256`), and
`moveSubtree` (`:264`) repoints descendants when a parent moves. Cascade archives parents and
children alike, so this is the normal path.

- Restoring a task **with an archived parent** is refused with a `DomainRuleError` naming the
  parent — the same shape as the existing subtask messages.
- Restoring a task **restores its archived descendants with it**.
- **If the row's section is archived, restoring the row restores the section too.** The container
  is what renders it; bringing back a row into an invisible container would recreate the defect
  this phase closes, in a new shape.
- Clears `archivedAt` **and `archivedWithSectionId`** — the marker describes an archive that is
  over, and the integrity pass rejects a live row still carrying one.
- Idempotent — a live task returns unchanged, as `archive` does for an already-archived one.
- `TaskService.archive` sets `archivedAt` only. `archivedWithSectionId` is `SectionService`'s to
  write: it means "came down with its container", which an individual archive did not.
- Records `task.restored`, a new `TaskAction`, verb `Restored`.
- Does **not** touch `status` or `completedAt`. Archiving never changed them.

**On §45:** restore does not read a clock for the archive field, but it goes through `commit`
(`:214`), which stamps `updatedAt` from the injected clock, and `record` writes an activity event.
The lint stays quiet because everything uses the injected `Clock` — but an implementer who reads
"restore clears a timestamp" and skips `updatedAt` breaks the §62 refresh Step 6 depends on.

### `packages/domain/src/reflection-service.ts`

`archive` and `restore` matching the task pair (no parents, so no subtree rule), **and `list` must
learn `includeArchived`**: it currently takes `(actor, projectId, sectionId?)` and forwards
neither the flag nor a default, so the repository excludes archived rows and no caller can ask
otherwise.

**Verify:** `pnpm --filter @cwm/domain test`.

---

## Step 5 — Host API and MCP

`apps/prototype-host/api/routes.ts`:

- `POST /api/tasks/:id/restore`, symmetric with the existing archive route.
- `POST /api/reflections/:id/archive` and `/restore`.
- `POST /api/sections/:id/restore`.
- `GET /api/projects/:id/sections` accepts `includeArchived`.
- **`GET /api/reflections` must forward `includeArchived`.** It parses `ReflectionQuerySchema` —
  which has the field (`inputs.ts:143`) — then passes only `query.sectionId` (`routes.ts:143-154`),
  and omits it from `queryObject`'s boolean list, unlike the tasks route at `:223`. Three
  omissions on one read path.

`packages/mcp-tools/src/tools/sections.ts` — `list_sections` returns live sections only. No new
tool (see non-goals), so `SPEC_TOOL_NAMES` is unchanged and the two-sided registry assertion stays
green.

**Verify:** `pnpm --filter @cwm/prototype-host test`, `pnpm --filter @cwm/mcp-tools test`.

---

## Step 6 — Web

`WorkManagerGateway`:

- `sections.list` gains `includeArchived`; `sections.restore(id)`.
- `tasks.restore(id)`; `reflections.archive(id)`, `reflections.restore(id)`, and `includeArchived`
  on `reflections.list`. `tasks.archive` already exists and finally gains a caller, which that
  file's own rule requires of a declared method.
- **`TaskGateway` is pinned to §9 "verbatim" (`work-manager-gateway.ts:38`)**, and spec line 374
  declares `archive` and nothing else. Adding `restore` is legitimate under AGENTS.md §2 rule 5 —
  correct the spec when the prototype disproves it — but it means editing §9 and recording it,
  not quietly widening the interface.
- `archive` returns `Promise<void>`, so the store cannot read the updated row back from it. Both
  archive and restore re-read, or the list goes stale.

**An `Archived` region at the foot of the project canvas**, project-scoped, provided by
`ProjectPage`, with its own store. It lists archived **sections** — each with the number of rows
archived with it, and one **Restore** — above rows archived on their own. It hides entirely when
both are empty.

Restoring a section is the undo for a cascade, in one click, in the place the section used to be.
This is not the "computed unrendered-data region" the ADR rejected: that was rejected as a way of
*holding the ownership invariant* by surfacing orphaned live data. This shows deliberately
archived work, and it is the undo surface for an operation the ADR calls undoable.

- The region's store must not reach into the section-scoped stores; it reads with
  `includeArchived: true` and filters.
- Restoring a section **adds a section to the canvas**, so it must call `reconcileSections`
  (`project-page-store.ts:601`) and not only bump `projectDataRevision` (`:173`) — the revision
  makes existing containers re-read; it does not paint a new one.
- Per-row **Archive** in the live task list, so the region has a second way to be reached and
  §58's "archive task → confirmation" has something to confirm later.

**Verify:** `pnpm --filter web test`, then `pnpm lint` and `pnpm build`.

---

## Step 7 — Docs

- `docs/decisions/2026-09-what-undo-means-for-an-archived-row.md` — the §78 entry, recording all
  five options round 1 put on the record and why D won.
- `docs/decisions/2026-09-sections-own-their-data.md` — amend: "undoable" now points at a real
  operation, cascade archives the *container* rather than only its rows, and the invariant is
  strengthened rather than narrowed. Its *Confidence* line "Low for the reassign policy, which has
  no UI behind it yet" changes.
- `Canvas Work Manager — …Specification.md` §9 — `TaskGateway` gains `restore`, per §2 rule 5.
- `development.md` — a third unnumbered-phase entry.
- `.prototype/notes.json` — resolve `note-2026-09-01-002` by writing what using it found.

---

## Acceptance check

Against `pnpm prototype:reset` (`personal-workspace`), host restarted:

1. **The dangle cannot come back.** Hand-edit `.prototype/data.json` to point a live task at a
   missing section id; restart. It refuses to load, naming both. Repeat pointing it at the
   `rich-text` section — refuses, naming the type. Repeat with the task live and its section
   `archivedAt` set — refuses, "live in an archived section".
2. **A document written before this phase still loads**, unedited, with no reseed. `archivedAt` is
   optional and `SCHEMA_VERSION` is unchanged.
3. **Cascade and undo, in one click each.** Add a second Task List, drag a task in, remove it with
   *Archive the rows and remove*. It leaves the canvas and appears in the region as a section
   holding 1 row. **Restore** puts the section back at the end of the canvas *with its task*, with
   no reload, and `data.json` shows `archivedAt` gone from both.
4. **The only container.** Do the same to the project's only Task List. It restores identically —
   the case the rejected alternative had to invent a resolution mechanism for.
5. **A row archived beforehand stays archived.** Archive one task from its row, then cascade the
   container, then restore the section: the cascaded rows come back and the individually archived
   one does not. In `data.json`, only the cascaded rows ever carried `archivedWithSectionId`, and
   none carries it once restored.
6. **Subtasks.** Create a subtask, cascade its container, try to restore the child alone — refused,
   naming the parent. Restore the parent: both come back, in the same list.
7. **Nothing shows an archived section.** `GET /api/projects/:id/sections` omits it,
   `list_sections` over MCP omits it, the canvas omits it, and Quick add's Duplicate/Move controls
   cannot reach it. Creating a task with no `sectionId` while the only container is archived makes
   a **new** container rather than reviving the archived one.
8. **Reflections** behave the same way, both directions.
9. `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm e2e`.

Items 4, 5 and 7 are the ones that matter: 4 is why this approach was chosen, 5 pins the timestamp
pairing, and 7 is the cost the approach incurs — the read path most likely to be missed.

---

## Test plan — written first

House convention: `.test.ts` in `packages/*`, `.spec.ts` in `apps/web`.

| Test | Proves |
|---|---|
| `repositories/data-store.test.ts` — a live task with a missing `sectionId` fails to load | The gap that let the dangle commit |
| `repositories/data-store.test.ts` — a live task whose section is a **view** type fails | The kind clause; without it this is a foreign-key check, not the invariant |
| `repositories/data-store.test.ts` — a live task in an **archived** section fails | The clause this approach earns |
| `repositories/data-store.test.ts` — an **archived** task in an archived section loads | The normal post-cascade state |
| `repositories/data-store.test.ts` — a section from another project fails; same set for reflections | Scope, both row types |
| `repositories/json-repositories.test.ts` — `list` excludes archived unless asked | The predicate every read depends on |
| `domain/section-service.test.ts` — cascade stamps `archivedWithSectionId` on each live row and on none of the already-archived ones | The pairing restore relies on |
| `domain/section-service.test.ts` — cascade, then validate the document | The regression test for the friction note |
| `domain/section-service.test.ts` — a container holding **only archived** rows is archived, not deleted, with no policy | The second dangle, which no policy ever reached |
| `domain/section-service.test.ts` — a view, and an empty container, are still hard-deleted | The common path did not become a tombstone |
| `domain/section-service.test.ts` — archiving renumbers surviving siblings densely | Positions, which `add` then depends on |
| `domain/section-service.test.ts` — `restoreSection` appends at the end and restores only rows naming it, clearing both fields | Acceptance items 3 and 5 |
| `repositories/data-store.test.ts` — a **live** row carrying `archivedWithSectionId` fails; so does one naming a section other than its own | The marker cannot outlive what it describes |
| `domain/section-service.test.ts` — `resolveContainer` skips an archived container and creates a new one | Acceptance item 7's last clause, the subtlest read path |
| `domain/section-service.test.ts` — `requireContainer` refuses an archived section; `duplicate`/`move` refuse one | The rest of the read-path sweep |
| `domain/task-service.test.ts` — restoring a row in an archived section restores the section too | The defect this phase closes, in its new shape |
| `domain/task-service.test.ts` — restoring a subtask alone is refused, naming the parent | The rule round 1 found missing |
| `domain/task-service.test.ts` — restoring a parent restores archived descendants into one section | `moveSubtree`'s promise, under restore |
| `domain/task-service.test.ts` — restore is idempotent; `status`/`completedAt` untouched; `updatedAt` stamped | Idempotence, unconflated archive, and the §62 refresh |
| `domain/task-service.test.ts` — an actor **without** `tasks.write` is refused; a task in another workspace answers not-found, not a rule error | Permission and scoping, per the `task-service.ts:62` idiom |
| `domain/reflection-service.test.ts` — archive, restore, idempotence, and `list` honouring `includeArchived` | The asymmetry closed, and the read path that makes it visible |
| `host/routes.test.ts` — the four new routes; sections and reflections routes forwarding `includeArchived` | The seam, including the forwarding round 1 found missing |
| `mcp-tools/contract.test.ts` — `list_sections` omits an archived section | The agent's canvas matches the person's |
| `web/archived-region.spec.ts` — hides when empty; restoring a section calls `reconcileSections`, not only the revision bump | The empty state and the repaint round 1 found missing |
| `web/archived-region.spec.ts` — a failed restore rolls back and shows a message | The failure path, per `task-list-store.spec.ts:224` |
| `e2e` — cascade the only container and restore it through the UI | Acceptance item 4, end to end |

Mutation-check the kind clause, the live-in-archived clause, the subtask refusal, the
`resolveContainer` skip and the marker-scoped restore: each passes against a plausible wrong
implementation without it.

---

## Boundaries touched (§1, §8, §12, §70)

- **No `new Date()` in domain.** Everything goes through the injected `Clock` — see the §45 note in
  Step 4, which corrects the first draft's reasoning without changing its conclusion.
- **MCP tools call services, never repositories.** No new tools; `list_sections` changes only in
  what the service returns it.
- **`SectionService` gains no knowledge of tasks.** It already holds `TaskRepository` and
  `ReflectionRepository` for `settleRows`; `restoreSection` uses the same two. Never `TaskService`,
  so `TaskService → SectionService` stays acyclic.
- **`TaskService` calling `SectionService.restoreSection` inside its own unit is safe** —
  `unitOfWorkFor` joins a nested call (`data-store.ts:306-308`).
- **Contracts defined once.** `archivedAt` on `ProjectSection` matches the two existing row fields
  rather than inventing a shape.
- **Components depend on gateway interfaces.** The region calls its store; the store calls the
  gateway; it must not reach into the section-scoped stores.
- **The integrity pass is not a migration.** It rejects a bad document rather than repairing one.
- **`TaskGateway` is spec-pinned.** Step 6 widens it and Step 7 updates §9. Doing the first without
  the second is the violation.
- **`SectionRepository.remove`'s doc comment is a boundary artefact of the old design** and is
  rewritten in Step 2, not left to contradict the code.

---

## Explicit non-goals

- **No MCP archive or restore tools.** §54 has no archive tool at all. This is **Slice 22** work
  (§58 lists "archive task → confirmation"), not Slice 24 — Slice 24's §56 experiments are
  *variants of existing tools*, and this would be a new one.
- **No `includeArchived` on `list_sections`.** An agent has no undo surface to build; adding the
  parameter without a consumer is a claim no test backs.
- **No archived-project guard on restore.** The first draft's test plan asserted a 409 for it; no
  such rule exists in `TaskService`, which checks only `assertProjectVisible` (`:59-63`).
- **No project restore.** Projects archive by status, a different mechanism with its own decision.
- **No trash view, no workspace-wide archive browser, no bulk restore, no undo stack.**
- **No purge or retention** (§80). Archived sections accumulate; that is the point, and a prototype
  document is disposable.
- **No `cancelled` unification** (`2026-08-task-status-transitions-and-archive.md`).
- **No milestone archive.** Milestones have no container.

---

## Open questions

**1. ~~Is same-timestamp the right way to pair a restored section with its rows?~~ Resolved: no —
an explicit `archivedWithSectionId`.** See *Why a column and not a timestamp* below.

**2. Should an archived section be restorable when a container of its type already exists?**
Recommended **yes, always** — two containers of one type is the thing the ownership phase made
normal, so refusing would be a rule invented for no reason.

**3. Does the region show archived sections from sub-projects?** Recommended **no**, project-scoped
only, matching every other section read.

**Why a column and not a timestamp.** The first draft paired a restored section with its rows by
matching `archivedAt` exactly, on the reasoning that one cascade is one write. It is exact, and it
is the wrong mechanism: it couples two records through a value that looks incidental, so the next
person to touch either write path has no way to know the equality is load-bearing. A field named
`archivedWithSectionId` says what it is for.

Two alternatives were considered and rejected:

- **A boolean, `archivedWithSection: true`.** It carries identical information — `sectionId`
  already names the section, and an archived row cannot be moved — so the id is redundant. It was
  rejected on two grounds. The codebase's idiom is *optional presence carries the fact*
  (`archivedAt`, `completedAt`, `title`), and a boolean that is only ever `true` or absent is that
  idiom wearing a worse type. And redundancy that can be **checked** is not duplication: the two
  clauses above turn the extra field into a consistency assertion the boolean could not express.
- **Do not archive the rows at all — let the section's `archivedAt` hide them.** Genuinely
  elegant: no marker, no pairing, and restoring a section brings its rows back because they were
  never archived. Rejected because row visibility would then depend on the section's state, so
  every row query — dashboard, upcoming work, search, progress — would need a join to a second
  collection. That is precisely the join `2026-09-sections-own-their-data.md` refuses when it keeps
  `projectId` on rows alongside `sectionId`: "a join on every read is not free when a unit of work
  already clones and validates the whole document twice." Stamping the rows is the denormalisation
  that keeps those reads flat, and the marker is what makes the denormalisation reversible.

**4. Does `TaskQuery` need `archivedOnly`?** Cheap either way. Start with `includeArchived: true`
plus a client filter; add the field only if search or the dashboard wants it. Decide in Step 6.

1 blocks Step 3. 2 and 3 block Step 6. 4 can be settled inside Step 6.

---

## Decision entries this phase must write

- `docs/decisions/2026-09-what-undo-means-for-an-archived-row.md` — the §78 entry. Its interesting
  content is the five options, why archiving the container beats resolving a target on restore,
  and the subtask rule — where the abstract question turns out to already have an answer in the
  codebase.
- An amendment to `2026-09-sections-own-their-data.md` per Step 7. A decision that claimed
  something untrue for a fortnight is worth recording as such — §77's rule is that the prototype
  correcting the design is the output, not an embarrassment.

---

## Commit sequence

```
contracts+repositories: a section can be archived, and a live row cannot dangle
domain: removing a container with work archives it whole
domain: restore, for rows and for the sections that hold them
host+mcp: restore routes, and reads that can ask for archived
web: archived work is visible, and restorable, from the canvas
docs+spec: what undo means for an archived row
```

The first commit is green on its own: nothing yet produces an archived section, and the strict
integrity rule is satisfied by every existing document — including one written before this phase,
since no seed carries `archivedAt` and `reassign` already repoints all rows including archived
(`:325`). The second is the one that must not be split, because it is the commit that starts
producing archived sections.

---

## Sequencing against the sibling plan

`2026-09-section-names-implementation.md` and this one are independent, except that both touch
`docs/decisions/2026-09-sections-own-their-data.md` and `development.md`. Expect a trivial conflict
in those two. One genuine interaction: the names plan's removal dialog says *"Archive the rows and
remove"*, which after this phase is inaccurate — it archives the section too. Whichever lands
second updates that label.

---

## Environment

`pnpm e2e` was **already failing before either plan was written**, for a reason neither causes.
Playwright starts the host with `CWM_DATA_FILE=.prototype/e2e-data.json`
(`playwright.config.ts:28`), and that file was last written on 31 August — before the ownership
phase bumped `SCHEMA_VERSION` to 2. It held `schemaVersion: 1` and a task with no `sectionId`, so
`JsonDataStore.load` rejected it and the host never came up for the specs to seed it.

The schema pin behaving as designed, in the one place the ownership phase could not see: `pnpm e2e`
is deliberately not part of `pnpm test`
(`docs/decisions/2026-08-e2e-owns-its-servers-and-its-data.md`). The file is gitignored generated
state; the host reseeds when it is absent (`store.ts:56-58`). It has been deleted.

Worth carrying forward: **a `SCHEMA_VERSION` bump invalidates every data file, not only
`.prototype/data.json`.**

---

## Revisions

**Round 1** — cold-start reviewer, briefed with the plan, the spec §N list and AGENTS.md §1. Five
blocking findings and nine minor; all checked against the code, all held.

1. **Subtasks were missing entirely.** `sectionFor` refuses to give a subtask a section other than
   its parent's (`task-service.ts:154-159`, `:250-256`) and cascade archives parents and children
   alike, so a naive restore breaks on the first subtask anyone restores. Step 4 now refuses a lone
   child and restores a subtree together.
2. **The integrity rule did not enforce the plan's own Goal** — it checked existence and project
   only, so a live task pointing at a `progress` section would have passed. Step 2 gained the kind
   clause `requireContainer` already encodes on the write path.
3. **The decisive acceptance check was unreachable** — it restored from a dashboard surface that
   does not exist (`dashboard-service.ts:80` filters archived rows), via a per-section disclosure
   that cannot exist once the only section is gone.
4. **The reflections half had no read path** — `ReflectionService.list` takes no `includeArchived`
   and `GET /api/reflections` parses the flag then drops it, in three places.
5. **Step 1 was a decision dressed as a survey.** It rejected "clear `sectionId`" on a false ground
   and never evaluated the two options that mattered.
6. The commit-sequence rationale was self-contradictory; plus a test asserting a domain rule that
   does not exist, `TaskGateway` being §9-pinned, `archive` returning `void`, the §45 reasoning,
   Slice 22 versus 24, missing permission/empty-state/failure-path tests, a "restore into the
   original section" test that passes without any re-resolution, and archive appearing four times
   in the spec rather than three.

**Round 2 — Step 1 resolved by the user: archive the section rather than delete it.** The plan is
rewritten around it, and three of round 1's findings dissolved rather than being fixed: there is no
`resolveRestoreTarget` to get wrong (1's hardest half), no lenient integrity branch (2 gets a
*stronger* clause instead — a live row may not sit in an archived section), and no reachability
problem (3 — an archived section is project-scoped and always listable). Restoring is now one
click on the thing that was removed, rather than a row-at-a-time reconstruction.

Rewriting it also surfaced three things round 1 did not:

- **`SectionRepository.remove`'s doc comment argues explicitly against this design** — "a section
  is view configuration with no independent history … a real delete rather than a flag". The
  premise stopped being true when the ownership phase gave containers rows. Step 0 confronts it and
  Step 2 rewrites it, per AGENTS.md §2 rule 4.
- **A container holding only already-archived rows is hard-deleted today**, dangling them with no
  policy involved. No option other than this one closed that case.
- **`addWithin`'s comment overstates the unit-of-work constraint.** `DataStore.runUnitOfWork`
  rejects re-entry, but `unitOfWorkFor` — what the services actually hold — *joins* a nested call
  (`data-store.ts:306-308`). Round 1 flagged the discrepancy; it matters here because `TaskService`
  restoring a row now calls into `SectionService`.

Round 3 has not been run. The plan changed substantially, and the read-path sweep in Step 3 is
exactly the kind of enumeration a fresh reviewer catches an omission in.

**Round 3 — the pairing mechanism, at the user's direction.** Same-timestamp matching is replaced
by an explicit `archivedWithSectionId` on `Task` and `Reflection`, for the reasons under *Why a
column and not a timestamp*. The alternative of not archiving rows at all is recorded there too: it
is the most elegant option on paper and reintroduces exactly the join the ownership decision
refuses, which is worth knowing the next time someone has the same idea. The column also earns two
integrity clauses the timestamp could not support, so the pairing is now enforced rather than
assumed. Still optional fields throughout — no `SCHEMA_VERSION` bump.
