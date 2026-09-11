<!-- completed-record id="U3" closed="2026-09-04" summary="Removing a section archives it; cascade and restore for sections, tasks and reflections; integrity rules" -->
# Archive keeps its promise

> **Completed record — frozen at closeout.** Status **done**, closed **2026-09-04**.
> This file is history, not current truth: the outcome as it was recorded when the work
> closed, the slice definition from the build order, and the implementation plan as it was
> executed. Later work may have changed what it describes. The current state of every
> system it touched lives in [`docs/architecture/`](../../architecture/overview.md); the status
> board is [`progress.md`](../progress.md). The build order these records cite as
> `development.md` was split into `docs/roadmap/` on 2026-09-10.

## Outcome

The third friction-chosen phase, from the second of the two notes the ownership phase's browser
pass left (`note-2026-09-01-002`). Cascading a container archived its rows and hard-deleted the
container, so every archived row pointed at a section that no longer existed — and nothing in
the repository had ever cleared `archivedAt`, so the "this is undoable" the ownership decision
rested on was a claim with no operation behind it.

**Status:** done — decision: [docs/decisions/2026-09-what-undo-means-for-an-archived-row.md](../../decisions/2026-09-what-undo-means-for-an-archived-row.md),
plan: [2026-09-archive-restore-implementation.md](2026-09-archive-restore-implementation.md).
Removing **any** section now archives it; nothing hard-deletes. A cascade takes the container
down with its live rows, each stamped `archivedWithSectionId`; a reassign moves the rows out
and archives the emptied section, marking nothing. `restoreSection` is the canonical undo and
restores exactly what the removal took — a row archived beforehand stays archived.
`TaskService.archive` now cascades to live descendants under `archivedWithTaskId`, with
`restore` as its mirror, and `ReflectionService` finally has the archive/restore pair it never
had. The phase first shipped an **Archived** region at the foot of the canvas as the undo
surface, visible in View Mode because it was content rather than layout chrome (§32). Slice
25.6 replaced that page-local surface with the root-wide Archive page, while `TaskRow` retained
the per-row Archive control §34 describes.

No `SCHEMA_VERSION` change: every new field is optional, and the current `.prototype/data.json`
was booted unedited to prove it. The structural change is in `validateDocumentIntegrity`, which
learned the ownership invariant the previous phase left to the write path — every row's section
must exist, belong to its project and hold its kind; a live row is never in an archived section
or under an archived parent; a parent and child share a section; and each archive marker names
an archive still in progress. The document that produced the friction note now fails to load.

Corrections this phase owed rather than made quietly: §9's `TaskGateway` gained `restore`, the
ownership decision was amended on two counts it got wrong, the activity decision's rejected
soft-delete was taken, and AGENTS.md's "repositories + `Clock` only" was widened to the acyclic
domain composition the code has enforced since the ownership phase.

**Deferred:** permanent deletion — wanted, and deliberately not built here, with
`SectionRepository.remove` kept as its seam and `archivedWithSectionId` reducing it to a query
on one column. Bulk restore remains deferred; Slice 25.6 supplies the root Archive projection,
explicit project reactivation and canonical archive/restore MCP tools.

---

## Implementation plan — Implementation plan — archive keeps its promise

Follow-up to `docs/roadmap/completed/2026-09-section-ownership-implementation.md`, from the friction that
phase's browser pass recorded (`.prototype/notes.json`, `note-2026-09-01-002`).

**Goal.** Removing **any** section archives it, and removing a container archives its live rows
with it. Restoring brings back exactly what the removal took — no more, no less. No row, live or
archived, ever points at a section that does not exist.

**Spec sections.** §9 (`TaskGateway`'s pinned surface), §11/§14 (one shared contract and the
hand-readable file that must stay backwards-compatible), §29/§30/§31 (the registry, adding a type,
the frame's remove control), §33/§34 (subtasks), §45 (injected clock), §54/§56 (the tool set and
tool-shape experiments), §57 (activity events), §58 (agent confirmations), §61 (prototype API),
§62 (live updates), §63 (optimistic project-status paint), §69 (end-to-end tests),
§71 (deliberately disposable), §77 (correcting the design from use), §78 (the decision log),
§80 (never build); §4 (the component workbench, for the region's stories); and §32 (Edit Layout Mode gates the remove control, and now the region and
the per-row Archive button that sit beside it).

**Landed prerequisite, not work to repeat.** `2026-09-section-names-implementation.md` is now on
`main`. This phase consumes its `nameOf`/`SectionRemovalRefusalDetailsSchema` contracts and its
UI-owned removal prompt, and preserves its optional-title compatibility rule. It does not add a
second name field, a second resolved-name helper, or a second error discriminator.

---

### Step 0 — Six facts that change the obvious approach

**The decision already claims what this plan has to build.**
`docs/decisions/2026-09-sections-own-their-data.md` justifies cascade-as-archive with
"`archivedAt` … is deliberately distinct from `cancelled`, so this is undoable." True of the field
and untrue of the application: a repo-wide search of `packages` and `apps` for `unarchive`,
`restore`, or a write of `archivedAt: null | undefined` returns only unrelated prose,
`vi.restoreAllMocks`, optimistic-rollback comments and test names. **Nothing has ever performed
the undo the decision promises.** The specification mentions archive four times — line 374
(`archive(id: TaskId)` in §9's `TaskGateway`), 2008 and 2011 (§58), 2922 (§81) — and restore never.

**`settleRows` contains the argument against its own cascade branch.**
`section-service.ts:293-296` says, of reassign:

> Reassign still repoints the archived ones, because unarchiving a row into a section that no
> longer exists would be the worse outcome.

Cascade produces exactly that: `section-service.ts:314-318` writes only `archivedAt`, and
`remove` at `:277-289` hard-deletes the section. The ownership phase's browser pass captured the
historical bad record in `.prototype/notes.json` (`note-2026-09-01-002`):

```
section-4f7e064c | Measure the hallway shelf | archivedAt= 2026-09-02T06:13:32.422Z
```

`section-4f7e064c` no longer existed. The names phase has since reset `.prototype/data.json`, so
this is evidence in the note, **not a claim about the current file**. Rows archived *before* a
cascade dangle too: `section-service.ts:303-305` filters them out of `live`, then returns early
when nothing is live, and the section is hard-deleted without touching them. That second case is
not fixed by any policy — it happens with no policy at all — and it is the one this plan's
approach closes for free.

**The integrity pass never learned about the field the last phase added.**
`validateDocumentIntegrity` (`data-store.ts:129-139`) checks a task's `projectId` and
`parentTaskId`, and a section's, milestone's and reflection's `projectId`. The string `sectionId`
does not appear in the function. Validation runs at unit close (`data-store.ts:280`) and again in
`persist` (`:263`/`:376`), not per write; both passes see committed state, so a rule added here has
no intra-unit ordering hazard.

**Archive is half-built on both rows it applies to.** `TaskService.archive` exists
(`task-service.ts:202`) and `TaskGateway.archive` is declared (`work-manager-gateway.ts:44`) —
but **no UI calls it**: the one `.archive(` in `apps/web` is `project-page.ts:131`, the *project*.
`ReflectionService` has no archive at all, so a reflection can acquire `archivedAt` only by having
its container cascaded, and nothing can ever clear it.

**The names phase landed the archive phase's error and naming seams.** The non-empty refusal is
now the shared, positive discriminator
`{ reason: 'section_not_empty', liveRowCount }` (`contracts/src/section.ts:114-118`), forwarded by
the host, retained as untrusted `GatewayError.details`, and parsed by `ProjectPageStore` before it
opens the dialog. The archive phase's already-archived and archived-target 409s therefore need no
new detail shape and must stay on the ordinary error path. `nameOf` is likewise the one contract
for stored overrides, legacy blank titles and derived defaults. Archive cards and archive/restore
activity summaries use it directly; they do not reproduce the dialog's or registry's fallback.

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

### Step 1 — Removing a section archives it *(resolved)*

Of the five options review round 1 put on the record, this is **D**, chosen by the user over the
first draft's C ("restore resolves the container"), and widened at the user's direction in round 3
from *cascaded containers* to *every section*.

> Removing a section sets `archivedAt` on it. If it is a container holding live rows, those rows
> are archived too and each is stamped with `archivedWithSectionId`. The section leaves the canvas;
> nothing is deleted.

**Archiving is uniform; ownership governs only the rows.** An earlier draft archived a container
and hard-deleted a view, on the reasoning that a view owns nothing worth keeping. That is true of
`progress`, `timeline` and `recent-activity`, which recompute from data they do not hold — and
false of `rich-text`, whose prose lives in `config.text` and exists nowhere else. `SECTION_OWNERSHIP`'s
own comment (`contracts/src/section.ts:42-45`) has said so since the ownership phase:

> `rich-text` is a container conceptually, but it owns its data through `config.text` rather than
> through rows.

Three ways to resolve that were on the table. Making `rich-text` a container means giving it an
`OwnedDataKind`, a repository and row records — rewriting how Notes stores text for no behavioural
gain. Carving it out by type means a second type-keyed table, which is the §30 cost the sibling
plan spent a round arguing down. **Archiving every section costs one field write and needs no table
at all**, and archiving preserves `config` for free because it preserves the whole record — which
also keeps a Progress section's milestone selection, or a Timeline's range, rather than making
someone set it up again. "Removing a section is undoable" is a rule that fits in a sentence;
"… unless it is a view, except `rich-text`" is not.

`SectionKind` keeps meaning exactly what it meant — *owns rows or does not* — and stops being
overloaded to mean *survives removal or does not*, which was never the same question. It also has
nothing to do with how many of a type a project may have: nothing in `addWithin` (`:111-143`) or
`duplicate` (`:233-265`) constrains that, for views or containers.

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
  still parses. The ownership phase's 1 → 2 bump is not repeated, and no **schema-version-driven**
  reseed is required. The names phase already reset the historical dangling-row defect out of the
  current prototype data; Step 2 verifies that clean legacy-shaped file before acceptance reset.

**What it costs, stated plainly:** every read of sections must now exclude archived ones, and there
are more of those than the first draft's approach touched — `SectionService.ordered`/`list`,
`resolveContainer`, `requireContainer`, `duplicate`, `move`, `SectionQuery`, the sections route,
`list_sections`, and the canvas. Missing one is a bug that shows an archived section on the canvas
or lets a new row be created into one. Step 3 enumerates them; the test plan pins each.

**Every branch changes, because every branch stops deleting:**

| Case | Today | After | Dialog? |
|---|---|---|---|
| View section | hard delete | **archive the section** | no |
| Container, no rows at all | hard delete | **archive the section** | no |
| Container, only archived rows | **hard delete — leaves them dangling** | archive the section; no policy needed | no |
| Container, live rows, no policy | refuse, naming the count | unchanged | — |
| Container, live rows, `cascade` | archive rows, delete section | **archive section *and* rows, each row stamped `archivedWithSectionId`** | yes |
| Container, live rows, `reassign` | repoint all rows, delete section | repoint the rows, **archive the emptied section**, no marker written | yes |
| **Already-archived section** | archives/deletes again | **refused** — see below | — |

**Only the fifth and sixth rows show a dialog, and that is unchanged.** The dialog exists to ask
what should happen to the *rows*; the first three rows of the table have no rows to settle, so
there is no question to ask and they archive silently. The Archived region is the undo, which is
what makes a silent removal safe — today it is a silent *delete*, which is not. After the names
phase, `ProjectPageStore` opens the dialog only when the gateway's untrusted details parse as the
discriminated `section_not_empty` refusal. These success branches produce no refusal, so the prompt
trigger needs no archive-specific branch; Step 6 changes only the wording and adds the undo surface.

**Reassign archives the emptied section too, and writes no marker.** The rows moved out under their
own policy, so they are not "archived with" anything; restoring the section brings back an empty
section, which is what the person removed. Step 2 distinguishes the section marker that cannot
legally reach this branch from task-subtree markers that must move intact.

**Nothing hard-deletes any more, so `SectionRepository.remove` loses its only caller.** Keep the
method: it is the seam the permanent-delete operation of settled decision 5 will use, it is still
covered by `repositories.test.ts:452-482`, and deleting and re-adding it is churn. Its doc comment
is rewritten in Step 2 to say that it is deliberately unreferenced by `SectionService` and why.

**This is in tension with AGENTS.md §4** — "Prefer deleting to adding … do not build abstraction
for a second use case that has not appeared" — which is close to the reasoning above, and the
local form of the same rule is stated in `work-manager-gateway.ts:93-94`. The trade, stated rather
than assumed: this is not speculative abstraction, because the method exists, is tested, and was
called until this commit. If settled decision 5 is not taken up in the next phase, delete it then.

**This amends the decision of record**, and Step 6 must say so rather than only recording that
"undoable" became true. The ADR's removal semantics said cascade "archives the rows"; it now
archives the container. The invariant it states — every row has a `sectionId`, every section
renders, so no row can be invisible — is *strengthened*: it holds for archived rows too, with
"renders" narrowed to "exists and would render if restored".

---

### Step 2 — Contracts and repositories

`packages/contracts/src/section.ts` — `ProjectSectionSchema` gains
`archivedAt: IsoDateTimeSchema.optional()`, matching `Task`'s and `Reflection`'s field exactly
(`task.ts:52`, `reflection.ts:26`; `IsoDateTimeSchema` is `z.iso.datetime()` at `common.ts:9` —
the Zod 4 API and the house idiom, not `z.string().datetime()`).

`packages/contracts/src/task.ts` and `reflection.ts` — both gain
`archivedWithSectionId: SectionIdSchema.optional()`: **present means this row was archived as part
of its container's removal, and names the container it came down with.** Absent means it was
archived on its own, or is live. Restoring a section brings back exactly the rows that name it;
restoring a row clears it.

`packages/contracts/src/task.ts` — also gains `archivedWithTaskId: TaskIdSchema.optional()`, the
same idea one level down: **present means this task came down with an ancestor's archive, and
names that ancestor.** Step 4 makes `TaskService.archive` cascade to descendants, and a cascade
without a marker is not undoable — the same argument that produced `archivedWithSectionId`, so it
gets the same shape rather than a second mechanism. Reflections have no parents and get neither.

A row carries **at most one** marker. A section cascade only ever archives *live* rows, and Step
4's new invariant makes a live row's ancestors live **while the existing parent/child section
co-location rule is promoted into document integrity** — so the rows a section takes down are
whole subtrees, and the section marker is the only one written.

Both fields are optional, so a document written before this phase still parses: no
`SCHEMA_VERSION` change and no schema-version-driven reseed. `SCHEMA_VERSION` is `2` at
`contracts/src/document.ts:18` and does not move; there is no migration runner to update. The
names phase's browser pass already reset the historical dangling row out of the current local
file. This plan therefore requires no pre-implementation repair reset; acceptance still begins
from `pnpm prototype:reset` so its scenario is deterministic.

`archivedWithSectionId` and `archivedWithTaskId` are fields on `Task` that §33 does not declare, exactly as
`sectionId` and `archivedAt` were. Both of those carry a justifying comment under §33's "Start
flexible" (`contracts/src/task.ts:20-25`, `:29-35`); these get the same treatment. This plan
is careful to demand a §9 correction for `TaskGateway` in Step 6 and owes itself the same
consistency here — a comment, not a spec edit, because §33 describes a *shape to start from*
rather than a pinned interface.

#### The marker's write contract

**The two markers have different movement rules; never clear “the marker” generically.**

- `archivedWithSectionId` is set by `SectionService` cascade and cleared by `restoreSection`.
  Integrity requires it to equal the row's `sectionId` and requires that section to be archived;
  Step 3 refuses row updates in an archived section. Therefore no valid ordinary task/reflection
  move or live-section reassign can encounter this marker. Do not add unreachable cleanup branches
  that would hide an integrity defect.
- `archivedWithTaskId` is set by `TaskService.archive` and cleared by the matching task restore.
  A section reassign moves every row in the section, so a task archive group remains co-located and
  its task markers are preserved. Likewise, moving an unmarked archive root between live sections
  repoints its whole subtree and preserves descendant markers that still name that root.
- Re-parenting is the one operation that can split a task archive group. After computing the new
  parent/section, if a moved archived task B carries marker A and A is no longer B's strict
  ancestor, clear B's marker and rewrite only descendants still marked A to B. The detached subtree
  remains one reversible archive; restoring A cannot revive it. If A remains an ancestor (a move
  within the same archive group), preserve the markers. Descendants with a different valid root
  are untouched.

The re-parent normalization runs even when `sectionId` stays the same — current `moveSubtree` is
gated on a section change, so reusing it unchanged misses the same-section `A → B → C` detach.
When a move does change sections, compare the computed `next.sectionId`, not merely whether the
input named one: `update` can overwrite it from the new parent's section at `:159`. Tests assert the
final marker group and document validity, not an implementation-specific sequence of clears.

`packages/contracts/src/inputs.ts:187` — `SectionQuerySchema` gains
`includeArchived: z.boolean().optional()`, matching `TaskQuery`/`ReflectionQuery`.

`packages/repositories/src/json-repositories.ts:124` — `JsonSectionRepository.list` filters on it
with the same predicate the other two use (`json-repositories.ts:110`, `:154`):
`(query.includeArchived === true || section.archivedAt === undefined)`.

**Four doc comments become false in this step and are rewritten with it** (AGENTS.md §2 rule 1):

- `packages/repositories/src/interfaces.ts:35-40` — the `remove` comment per Step 0. It still
  deletes; what changes is that nothing calls it.
- `packages/repositories/src/json-repositories.ts:50-55` — "A hard delete is safe for a section —
  it is view configuration with no history of its own (§31 offers no undo)." §31 now offers undo.
- `packages/contracts/src/section.ts:22-27` (`SectionKindSchema`) — "removing it takes them with
  it; a view … removing it touches nothing." Removing a view now archives it.
- `packages/contracts/src/section.ts:43-45` (`SECTION_OWNERSHIP`) — "removing the section already
  removes its text." It archives it. Step 1 quotes this comment approvingly for its *first* half
  and must not leave the second standing.

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
    if (section.archivedAt === undefined) fail(`${collection} "${id}" is marked with a live section`);
  }
};
```

Tasks add the parent co-location and archive-group clauses earned by Step 4's cascade:

```ts
// A live task's ancestors are live. `archive` cascades to descendants, so a live row under an
// archived parent is a row nothing can reach -- the same defect as a live row in an archived
// section, one level down.
if (task.archivedAt === undefined && task.parentTaskId !== undefined) {
  const parent = tasks.get(task.parentTaskId);
  if (parent?.archivedAt !== undefined) fail(`task "${id}" is live under an archived parent`);
}
if (task.parentTaskId !== undefined) {
  const parent = tasks.get(task.parentTaskId)!; // existence/project were checked above
  if (parent.sectionId !== task.sectionId) fail(`task "${id}" has a parent in another section`);
}
if (task.archivedWithSectionId !== undefined && task.archivedWithTaskId !== undefined) {
  fail(`task "${id}" carries two archive markers`);
}
if (task.archivedWithTaskId !== undefined) {
  if (task.archivedAt === undefined) fail(`live task "${id}" is marked as archived with a task`);
  if (task.archivedWithTaskId === task.id) fail(`task "${id}" is marked with itself`);
  const root = tasks.get(task.archivedWithTaskId) ?? fail(`task "${id}" has a missing archive root`);
  if (root.archivedAt === undefined) fail(`task "${id}" is marked with a live archive root`);
  if (root.projectId !== task.projectId || root.sectionId !== task.sectionId) {
    fail(`task "${id}" has an archive root outside its project section`);
  }
  // Walk parentTaskId with the existing acyclic guarantee; `root` must be a strict ancestor.
  if (!hasAncestor(task, root.id, tasks)) fail(`task "${id}" is marked with a non-ancestor`);
}
```

The live-parent clause is new behaviour; the same-section clause makes structural a rule every
service write already maintains. Before adding either, audit all seeds and `validDocument()`
fixtures for archived parents and cross-section children. `parentTaskId` existence and project
scope are already checked at `data-store.ts:129-139`, and the existing acyclic pass makes the
archive-root ancestry walk finite.

The live-in-archived clause is the one this approach earns. Under the rejected alternative it could
not exist, because an archived row's section was allowed to be gone entirely.

The marker clauses are why the columns are worth their redundancy: `archivedWithSectionId` always
equals `sectionId` when present, so the integrity pass can assert it, and a bug that sets one
without the other — or leaves the marker behind on restore — fails at the next commit rather than
surfacing as a section that restores the wrong rows weeks later.

Two notes, both checked: `sections` is built at `data-store.ts:97`, before the row loops at
129-139; and no seed carries `archivedAt` on any row, so all six pass unchanged. Run
`pnpm --filter @cwm/prototype-data test` first regardless — a wrong seed fails every suite at
document load rather than in one place.

**`data-store.test.ts`'s own fixture fails the kind clause and must be fixed in the same commit.**
`validDocument()` puts `reflection-1` in `section-1`, whose `type` is `task-list` (`:36-40`,
`:71-75`), and the fixture is used **29 times**, each construction validating at
`data-store.ts:231`. Add a second section of type `reflections` and repoint the reflection at it.
This is independent of the clean `.prototype/data.json` baseline below.
(`repositories.test.ts` is **not** affected — its inserts run outside a unit of work, so
`assertCanMutateDataStore` (`:48-60`) returns before anything validates. Leave it alone.)

Validation runs **twice** per unit, not once: at unit close (`data-store.ts:280`) and again inside
`persist()` (`:263` for `InMemoryDataStore`, `:376` for `JsonDataStore`). The conclusion above is
unaffected — both passes see committed state, so there is still no intra-unit ordering hazard —
but anyone budgeting the four new clauses should know they run twice, which is also what the
ownership ADR means by "clones and validates the whole document twice".

#### Baseline after the names phase

**The current `.prototype/data.json` is already clean.** The names phase's real-app pass reset it:
`task-personal-shelf` is live in `section-project-personal-tasks`, and the historical
`section-4f7e064c` dangle survives only in `note-2026-09-01-002`. `validateDocumentIntegrity`
runs on `JsonDataStore` construction (`data-store.ts:231`), so after the first repository commit
start `pnpm dev:host`, observe `prototype-host listening … data …\.prototype\data.json`, and stop
it without making a request **before** resetting anything. That process cannot print ready unless
`loadPersistence()` constructed `JsonDataStore` from the current default file, so it is the
backwards-compatible clean-data proof the package fixtures cannot provide.

Use `pnpm prototype:reset` only when beginning the deterministic acceptance scenario. The stale
`.prototype/e2e-data.json` described under *Environment* is already absent; do not add a deletion
step unless a generated copy has reappeared.

**Verify:** the default-file host boot above, then `pnpm --filter @cwm/contracts test`,
`pnpm --filter @cwm/repositories test`, `pnpm --filter @cwm/prototype-data test`.

---

### Step 3 — Domain: SectionService

**Every ordinary read of sections becomes live-only.** The one explicit archived read is the
Step 6 region. The enumeration is the checklist:

- `ordered(projectId)` — the canvas order, and the basis of `position`. It remains live-only.
- `list(actor, projectId, query: Omit<SectionQuery, 'projectId'> = {})` — the default delegates to
  `ordered`. With `{ includeArchived: true }`, it reads the repository with
  `{ includeArchived: true, projectId }` (mandatory scope last) and returns both states, ordered by
  position then id for deterministic transport; the Archived region applies its timestamp order
  after selecting archived records. No internal canvas/write caller opts in.
- `resolveContainer` (`:158`) and `requireContainer` (`:171`) — **must ignore archived sections**.
  A new row must never be created into, or moved into, an archived container; `resolveContainer`
  falling through to `addWithin` is the correct behaviour when the only container is archived.
- `duplicate` and `move` — refuse on an archived section.
- **`update` (`:187-208`) — refuse on an archived section**, same family as `duplicate` and
  `move`. It resolves through the unchecked `require` and refuses nothing today, so
  `PATCH /api/sections/:id` (`routes.ts:183`) and the `update_section` MCP tool can retitle,
  resize, collapse or **replace the `config` of** an archived section — including the
  `config.text` whose survival is Step 1's entire justification for archiving views. An archived
  section is off the canvas; there is no edit to make on one that restoring first would not allow.
- **`get` (`:76-79`) deliberately keeps returning archived sections.** It resolves through
  `require`, and `restoreSection`, the region and the acceptance checks all depend on it. Said
  explicitly because "every read becomes live-only" reads as a blanket rule, and an implementer
  who filters here breaks restore.
- **`settleRows`' reassign target (`:328`)** — the subtlest one, and the one an earlier draft's
  enumeration missed. It resolves through the *unchecked* `require`, and the checks that follow
  are project (`:329`) and type (`:332`) only, so
  `DELETE /api/sections/A?policy=reassign&reassignToSectionId=<archived B>` moves **live** rows
  into an archived container — producing the state Step 2's new clause forbids, as an integrity
  failure and rollback rather than a `DomainRuleError`. Refuse an archived target, in the same
  family as the refusals at `:322-334`.
- `require` (`:82`) stays as it is: it is the unchecked lookup the write paths use, and restore
  needs to find an archived section by id.

**The archived-parent write policy is exact, not a slogan.** Add a small service-local active-
project assertion in each domain service; do not add a new abstraction layer. An archived project
refuses section add/update/move/duplicate and any restore that would change archived state;
it likewise refuses task/reflection create/update/complete and state-changing restore.
Section removal and row archive remain allowed as idempotent tidying operations. An archived section
refuses row create/update/complete/restore; an archived row, whether independent or group-marked,
remains editable only while its project and owning section are live. Movement also applies Step 2's
marker-normalization rules. These checks run before repository mutation and raise
`DomainRuleError`, never a commit-time `DocumentIntegrityError`. `remove` inside an archived project
remains the deliberate exception described below.

**`remove(...): Promise<ProjectSection>` archives on every branch** per Step 1's table and returns
the archived record after the write. Mechanically:

- **An already-archived section is refused**, with a `DomainRuleError` naming it. It is reachable:
  `require` (`:82`) finds archived sections deliberately, and the region shows their ids, so the
  API and the `remove_section` tool can both be pointed at one. Removing something already removed
  is not a second archive, and a silent no-op would still write an activity event and answer two
  identical calls with two successes. Permanent deletion is the operation this case really wants
   and it is deferred — settled decision 5.
- The no-policy/non-empty refusal preserves the names phase's typed
  `{ reason: 'section_not_empty', liveRowCount }` details. Every other rule error in this phase has
  no such discriminator, so the web surfaces it as an error instead of reopening the policy dialog.
- `settleRows`' early return at `:305` becomes: no rows at all, or rows but none live → archive
  the section, no policy required. A view never reaches `settleRows` at all and archives directly.
- The cascade branch sets `archivedAt` on the section and on each live row, and
  `archivedWithSectionId` on each of those rows. One clock read for tidiness, but nothing depends
  on the timestamps matching.
- The reassign branch repoints every row and archives the emptied section. It writes no section
  marker and preserves any `archivedWithTaskId` groups because their complete same-section
  subtrees move together.
- Set `archivedAt` before calling `renumber`, then renumber only the surviving live siblings to the
  same dense sequence deletion produced. The archived section keeps its old, now-stale `position`;
  position uniqueness applies only to the live canvas, and `restoreSection` overwrites the value
  when it appends the section. This fixes the operation order rather than leaving two equivalent
  implementations for the next person to choose between.
- Records `project.section_archived`, a new `SectionAction`. Its summary is
  `Archived the ${nameOf(section)} section`; restore records the matching `Restored …` summary.
  This deliberately reuses the names phase's frozen-at-write activity rule. A legacy blank title
  therefore falls back safely, and a later rename does not rewrite either event.
  `project.section_removed` no longer
  has a branch that produces it; it stays in the union for the events already in `data.json`.
- Returns the archived section. The web/HTTP path may discard that value; the MCP tool needs it and
  must not perform a second `get` that would add a `projects.read` permission check.

**`restoreSection(actor, id)`** — new, under `projects.write`, and the **only** way an archived
section or a row that came down with one returns:

- After permission and workspace-scoped lookup, a section that is already live returns unchanged:
  no reposition, timestamps, row writes or activity. Idempotence prevents the public restore route
  from turning a retry into a canvas move.
- Clears the section's `archivedAt` and appends it at the end of the canvas (`position` = the live
  count), which is where `addWithin` puts a new one. A restored section going back to its old index
  would need positions the canvas has since reused.
- Restores **exactly the rows it archived**: those whose `archivedWithSectionId` is this section.
  Their `archivedAt` and `archivedWithSectionId` both clear. A row archived on its own beforehand
  carries no marker and stays archived — archiving a list and restoring it changes no other state.
  That is what makes this a canonical undo rather than a bulk unarchive.
- **Refused while the section's project is archived.** The exact write policy above protects HTTP,
  MCP and stale clients. The project page is reachable by direct URL for an archived project, so
  Step 6 also disables its Restore controls with reactivation guidance rather than offering a
  button guaranteed to fail.

  Two things this needs, neither free. `assertProjectVisible` (`:424`) and `isProjectVisible`
  (`:419-422`) test **workspace** only, while a project archives by `status: 'archived'`
  (`project-service.ts:143-151`) — so `restoreSection` adds its own status test. And the freeze is
  **escapable**, which is what makes it safe rather than a trap: `ProjectService.update` (`:119`,
  `:134`) already accepts a status change away from `archived`, so nothing is stranded behind it.
- **Removing a section inside an archived project is *not* refused**, deliberately. The freeze
  stops work coming *back* into a project someone has put away; it does not stop them tidying one
  before or after. Said because "one rule" would otherwise imply both directions.
- Records `project.section_restored`.

**On nested units of work:** `addWithin`'s comment (`:103-110`) says "`runUnitOfWork` does not
re-enter -- a nested call throws `UnitOfWorkInProgressError`". That is true of
`DataStore.runUnitOfWork` (`data-store.ts:266-291`, the rejection at `:267-269`), and **not** of
the `UnitOfWork` the services actually hold: `unitOfWorkFor` explicitly *joins* a nested call on
the same async stack (`data-store.ts:321`, under the doc comment at `:306-308`), because queueing
it would deadlock. The comment overstates the constraint and should be corrected while this phase
is in the file. **No step of this plan now depends on that** — Step 4's refusal removed the one
cross-service call it was justifying — but the comment is wrong either way.

**Verify:** `pnpm --filter @cwm/domain test`.

---

### Step 4 — Domain: rows

Before the archive/restore methods, close the two existing write doors that the new integrity rule
would otherwise turn into 500s:

- `TaskService.create` refuses an archived `parentTaskId`; `TaskService.update` refuses re-parenting
  to an archived task. The refusal happens before any write. Parent and child must share a section
  as well as a project; document integrity enforces that for hand-edited data.
- Task and reflection create/update/complete/restore apply Step 3's active-project and live-section
  policy. Keep these checks inside the existing services/repository dependencies.
  `TaskService` and `ReflectionService` continue their established, acyclic calls to
  `SectionService.requireContainer`/`resolveContainer`; restore adds no new cross-service call, and
  `tasks.write`/`reflections.write` do not acquire `projects.write`.
- Archive remains allowed/idempotent in an archived project or section so a caller can tidy hidden
  work without bringing it back.

#### `packages/domain/src/task-service.ts` — `archive` now cascades

**Archiving a task archives its live descendants**, stamping each with
`archivedWithTaskId = <the archived task's id>`. The root itself carries no marker. Descendants
already archived are untouched, keeping whatever marker they had.

This is a change to a shipped method, and it is deliberate. Today `archive` (`:202-213`) archives
one row, so archiving a parent leaves its children live — and because `apps/web` renders the task
list flat (`parentTaskId` is used for no rendering anywhere in the web app), that state is
currently invisible rather than obviously broken. It is still the same defect this phase exists to
close: a row whose context is gone. Cascading makes the rule uniform — removing something takes
what hangs off it — and buys the invariant the rest of Step 4 rests on:

> **A live row's ancestors are live.**

That is what Step 2's parent clause enforces, and it is what makes a section cascade coherent: the
live rows in a section are now whole subtrees, so marking them all with the section is never a
partial archive. That conclusion depends equally on Step 2's parent/child same-section integrity;
live ancestry alone does not stop a hand-edited child from sitting in another Task List.

§58's "archive task → confirmation" gains a reason to exist — the confirmation should say how many
rows are coming down, not just that one is.

#### `packages/domain/src/task-service.ts` — `restore(actor, id)`

Two refusals and one sweep:

1. **Refused if the row's section is archived**, naming the section and saying to restore that
   instead. The container is what renders it, and a live row in an archived section is the state
   Step 2 forbids.
2. **Refused if the task's parent is archived**, naming the parent. Reachable despite the cascade:
   archive C on its own, then archive its parent P — the cascade skips C because it is already
   archived, so restoring C alone would put a live row under an archived parent.
3. Otherwise it restores the row **and every task carrying `archivedWithTaskId === id`**. `archive`
   marks the whole subtree with the *root's* id rather than each row's parent, so this is one
   lookup, not a recursive walk — the same shape as `restoreSection`.

It clears `archivedAt` and **both** markers; the integrity pass rejects a live row carrying either.
Restoring an archived row is also refused while its project is archived. A row in an archived
section is refused first with the section-specific message; both checks occur before writes. A live
row remains an idempotent no-op even if an ancestor was archived after the original restore.

Nothing is left stranded. Walk the states:

| State | Restore the section | Restore the row |
|---|---|---|
| Section cascade over parent P and child C (both marked with the section) | both back, one click | refused (1) |
| C archived on its own, section live | — | C back |
| P archived on its own → C cascades with it, marked with P | — | restore P: both back. Restore C alone: refused (2) |
| C archived on its own, **then** P archived (cascade skips C) | — | restore P: P back, **C stays archived**, then C restores separately |
| P archived on its own (C cascades), **then** the section removed | section back; P and C still archived, since neither was live to mark | restore P: both back |
| C archived on its own, **then** the section cascaded (P marked, C not) | P back, **C stays archived** | C then restores on its own |

Rows four and six are the ones that pin the undo semantics: archiving something and restoring it
changes no other state. Row five is the case a naive implementation strands — the section cascade
finds nothing live to mark, so `restoreSection` restores no rows, and P's own marker is what brings
C back afterwards.

- Idempotent — a live task returns unchanged, as `archive` does for an already-archived one.
- `archivedWithSectionId` stays `SectionService`'s to write and `archivedWithTaskId` stays
  `TaskService`'s. Each means "came down with *that*", and no row ever carries both.
- Records `task.restored`, a new `TaskAction`, verb `Restored`.
- Does **not** touch `status` or `completedAt`. Archiving never changed them.

**Task restore therefore never calls `SectionService`.** The existing create/move paths still use
its container resolver, as the ownership decision requires. An earlier draft had restore call
`restoreSection`, which crossed a permission boundary the review caught: `restoreSection`
asserts `projects.write` while `TaskService.restore` is gated on `tasks.write`, so an agent
granted `tasks.write` alone — the case `section-service.ts:147-151` legislates for by name, and
the reason `addWithin` exists beside `add` — would have got a `PermissionDeniedError` from inside
a task write. Refusing instead removes the call, so no `restoreSectionWithin` door is needed and
the nested-unit question stops being load-bearing.

**On §45:** restore does not read a clock for the archive field, but it goes through `commit`
(`:214`), which stamps `updatedAt` from the injected clock, and `record` writes an activity event.
The lint stays quiet because everything uses the injected `Clock` — but an implementer who reads
"restore clears a timestamp" and skips `updatedAt` breaks the §62 refresh Step 6 depends on.

#### `packages/domain/src/reflection-service.ts`

`archive` and `restore` matching the task pair (no parents, so rule 2 does not apply; rule 1 does),
recording **`reflection.archived`** and **`reflection.restored`** — named here because
`ReflectionService.record` takes `action: string` (`reflection-service.ts:103`) and nothing but
`ActivityActionSchema`'s regex (`activity.ts:27`) would catch a typo. **And `list` must learn
`includeArchived`**: replace the positional optional section with
`list(actor, projectId, query: Omit<ReflectionQuery, 'projectId'> = {})`, then forward
`{ ...query, projectId }` to the repository, with the mandatory service scope written last so it
cannot be overridden by an untyped caller. This uses the shared contract instead of inventing a
parallel options type, keeps the project scope mandatory at the service boundary, and lets the
archived region request `{ includeArchived: true }` without a placeholder argument. Update the
existing section-scoped caller to pass `{ sectionId }`.

Reflection create/update/restore use the same active-project/live-section checks as tasks;
reflection archive remains allowed for tidying. A live restore is idempotent and records nothing.

**Verify:** `pnpm --filter @cwm/domain test`.

---

### Step 5 — Host API and MCP

`apps/prototype-host/api/routes.ts`:

- `POST /api/tasks/:id/restore`, symmetric with the existing archive route.
- `POST /api/reflections/:id/archive` and `/restore`.
- `POST /api/sections/:id/restore`.
- `GET /api/projects/:projectId/sections` accepts `includeArchived`; both this route and the
  reflections route parse it through
  `queryObject(request.query, [], [], ['includeArchived'])`, so the services receive a boolean,
  not the truthy string `"false"`. Pass only `{ includeArchived: query.includeArchived }` beside
  the path's `projectId`; ignore `SectionQuery.projectId` so a query parameter cannot override the
  route's scope.
- **`GET /api/reflections` must forward `includeArchived`.** It parses `ReflectionQuerySchema` —
  which has the field (`inputs.ts:146-153`) — then passes only `query.sectionId` (`routes.ts:143-154`),
  and omits it from `queryObject`'s boolean list, unlike the tasks route at `:223`. Parse the
  required project scope from `query.projectId`, then pass only
  `{ sectionId: query.sectionId, includeArchived: query.includeArchived }` as the service filters.
  Three omissions on one read path, without ever letting an options object restate project scope.

`packages/mcp-tools/src/tools/sections.ts` — `list_sections` returns live sections only. No new
tool (see non-goals), so `SPEC_TOOL_NAMES` (`registry.ts:16-35`) is unchanged and the two-sided
assertion in `contract.test.ts` stays green.

**`remove_section`'s description and return shape both become false and must be rewritten.** The
description at `:47` is the agent's entire contract for the operation:

> … A container still holding rows needs a policy: "cascade" archives them …

After this phase cascade archives the section too, and a container holding only archived rows needs
no policy at all. `:52-53` returns `{ removed: sectionId }` under the comment
`// The section is gone, so there is nothing to echo` — which is now true of nothing. Return the
`ProjectSection` returned directly by `services.sections.remove`, so an agent can see `archivedAt`
and knows the operation is undoable rather than inferring it from a bare id. Do not call `get`
afterward: `remove_section` requires `projects.write`, and a second read would incorrectly require
`projects.read`. `DELETE /api/sections/:id` deliberately remains 204 and the web gateway deliberately
remains `Promise<void>`; both discard the service return. Leaving the old tool shape or comment in
place is AGENTS.md §2 rule 6.

**Verify:** `pnpm --filter @cwm/prototype-host test`, `pnpm --filter @cwm/mcp-tools test`.

---

### Step 6 — Web

`WorkManagerGateway`:

- `sections.list` becomes
  `list(projectId, query: Omit<SectionQuery, 'projectId'> = {})`; `sections.restore(id)` is added.
  `SectionService.list` takes the same query after `actor` and `projectId`. Both merge the required
  path/service `projectId` into the repository query, so callers cannot accidentally broaden scope.
- `tasks.restore(id)`; `reflections.archive(id)` and `reflections.restore(id)` are added.
  `reflections.list` becomes
  `list(projectId, query: Omit<ReflectionQuery, 'projectId'> = {})`, matching the domain shape
  above. `tasks.archive` already exists and finally gains a caller, which that file's own rule
  requires of a declared method.
- **`TaskGateway` is pinned to §9 "verbatim" (`work-manager-gateway.ts:38-45`)**, and spec line 374
  declares `archive` and nothing else. Adding `restore` is legitimate under AGENTS.md §2 rule 5 —
  correct the spec when the prototype disproves it — but it means editing §9 and recording it,
  not quietly widening the interface.
- `archive` returns `Promise<void>`, so the store cannot read the updated row back from it. Both
  archive and restore re-read, or the list goes stale.

**The removal dialog's prose is wrong after this phase and is this plan's to fix**, both action
labels and all three comments: `section-removal-dialog.ts:16-20` says a view and an empty
container are "already **gone**" (they are archived, and they still never reach the dialog — the
first half stays, the word does not); the template's `:1-3` already says only "removed" and stays.
The template's `:41-42` says the domain
cascades this way "rather than destroying the rows" — now it does not destroy the section either.
`section-removal-dialog.html:38` and `:49` carry the two labels, and `project-page.ts:166-169`
the matching comment
`` `cascade` archives the rows — undoable ``. All three now understate what happens: the section
archives too.

**See the two-state table under *Landed names baseline* for the exact strings.** This phase updates the
names-created dialog spec for both `tasks` and `reflections`; labels remain derived from
`prompt.ownedKind`, never hard-coded to tasks. Preserve the now-shipped
`SectionRemovalPrompt { sectionName, rowCount, ownedKind, targets }` shape and the positive
`SectionRemovalRefusalDetailsSchema` parse. Do not add archive-specific `details`, change
`GatewayError`, or turn an already-archived/archived-target 409 into a second dialog.

**An `Archived` region at the foot of the project canvas**, project-scoped, provided by
`ProjectPage`, with its own store. It lists archived **sections** — each with the number of rows
archived with it, and one **Restore** — above rows archived on their own. It hides entirely when
both are empty. Files:

| File | Responsibility |
|---|---|
| `apps/web/src/app/features/projects/archived-region/archived-region.ts` | The region component |
| `apps/web/src/app/features/projects/archived-region/archived-region.html` | Section and standalone-row projections |
| `apps/web/src/app/features/projects/archived-region/archived-region.scss` | Token-only styling |
| `apps/web/src/app/features/projects/archived-region/archived-region.stories.ts` | Empty, sections, standalone rows, failure |
| `apps/web/src/app/features/projects/archived-region/archived-region.spec.ts` | Projection, naming, restore, pending and failure paths |
| `apps/web/src/app/features/projects/archived-region/archived-region-store.ts` | Project-scoped archived reads and filtering; never section-scoped stores |
| `apps/web/src/app/features/projects/project-page.ts` | Hosts the region and restore callbacks |
| `apps/web/src/app/features/projects/project-page.html` | Places the region after the canvas |
| `apps/web/src/app/features/projects/project-page-store.ts` | Public restore reconciliation/invalidation entry points and a pre-paint, overlap-safe project-write pending signal kept distinct from the existing all-write refresh counter |
| `apps/web/src/app/features/projects/project-page-store.spec.ts` | Section/row restore invalidation and pending-before-optimistic-paint ordering |
| `apps/web/src/app/features/projects/section-removal-dialog.html` | Both owned-kind labels |
| `apps/web/src/app/features/projects/section-removal-dialog.spec.ts` | Names-phase harness updated for all four final labels |
| `apps/web/src/app/features/tasks/task-row.ts` | The per-row Archive output and pending input |
| `apps/web/src/app/features/tasks/task-row.html` | The per-row Archive control |
| `apps/web/src/app/features/tasks/task-row.scss` | Pending/Archive control styling with tokens |
| `apps/web/src/app/features/tasks/task-row.spec.ts` | Archive intent and pending/disabled state |
| `apps/web/src/app/features/tasks/task-row.stories.ts` | Live and pending archive states |
| `apps/web/src/app/features/tasks/task-list-store.ts` | Its store method, beside the `includeArchived: false` reads at `:92` and `:141` |
| `apps/web/src/app/features/tasks/task-list-store.spec.ts` | Re-read after void archive; failure preserves row and reports error |
| `apps/web/src/app/features/projects/sections/tasks/task-list-section.ts` | Delegates TaskRow archive to the store and notifies the page on success |
| `apps/web/src/app/features/projects/sections/tasks/task-list-section.html` | Binds `archiveRequested` and pending state |
| `apps/web/src/app/features/projects/sections/tasks/task-list-section.spec.ts` | Connected row → wrapper → store/revision wiring |
| `apps/web/src/app/features/projects/sections/reflections/reflections-store.ts` | Migrate the section-scoped read to the shared query-object signature |
| `apps/web/src/app/features/projects/sections/reflections/reflections-store.spec.ts` | Pin `{ sectionId }` forwarding after the signature change |
| `apps/web/src/app/core/gateway/work-manager-gateway.ts` | The interface — the new methods below |
| `apps/web/src/app/core/gateway/prototype-work-manager-gateway.ts` | The concrete HTTP adapter that implements them |
| `apps/web/src/app/core/gateway/testing/fake-gateway.ts` | The fake |

**The region lists both section types**, because Step 1 archives views too — so its empty state and
its row-count column must both cope with a section that owns nothing. A `rich-text` section in the
region shows no count.

**The region's projection is exact:**

- Fetch current-project sections, tasks and reflections with `includeArchived: true`; never include
  sub-project data. Archived sections are those with `archivedAt`, newest first with id as the
  deterministic tie-break. Their label is `nameOf(section)`, so `Backlog` stays `Backlog` and an
  untitled section reads `Task List`, never a raw type or id. Equal resolved names gain a local
  `archive 1`, `archive 2` suffix in that sorted order; duplicate names remain legal.
  `SectionRemovalDialog.targetOptions` is not reusable here: its position suffix identifies a
  *live canvas target*, while an archived section keeps a deliberately stale position and is being
  identified inside this already-sorted region. Both surfaces reuse `nameOf`; each owns only its
  local collision suffix.
- A section's count includes only rows whose `archivedWithSectionId === section.id`. A view shows no
  count. An emptied/reassigned container shows `0 tasks` or `0 reflections` rather than pretending
  it owns none.
- A standalone task is archived, has neither marker, belongs to a **live** section, and has no
  archived ancestor. Descendants carrying `archivedWithTaskId` are hidden, as is a child archived
  independently before its parent: the root must return first. Because the region fetches every
  current-project task with `includeArchived: true`, it can walk `parentTaskId` against that map;
  document integrity already guarantees the walk is finite and stays in the same project/section.
  Only executable archive roots are offered. A standalone reflection is archived, has no section
  marker, and belongs to a live section. Rows inside an archived section are not separately
  offered; after the section returns, independently archived rows become visible here.
- Standalone rows sort newest first with id as tie-break. Tasks use `title`; reflections use their
  trimmed nonblank title or `Reflection`. The whole region hides only when both projections are
  empty.
- The project page remains reachable by direct URL when `project.status === 'archived'`. Keep the
  region visible so archived work is not erased from view, but disable every Restore control and
  show `Reactivate this project to restore archived work.` Reusing the loaded project status is
  not enough by itself because `setStatus` paints optimistically. `ProjectPageStore` exposes a
  `projectWritePending` computed signal backed by a small **project-write counter**. Increment it
  in `writeProject` **before** `projectState.set(paint(before))`, and decrement it in a `finally`
  only after success or rollback. Do not derive it from the existing `pendingWrites`: that counter
  is non-reactive, includes section writes, and today increments inside `whileWriting` only after
  the optimistic paint. The counter shape also keeps two overlapping project writes from clearing
  the disabled state when the first one settles. Restore is disabled when the project is archived,
  when `projectWritePending` is true, or while that restore itself is pending. Once the existing
  status editor's reactivation succeeds, the controls enable without a reload; after failure the
  project rolls back to archived and they stay disabled. Do not make a speculative restore request.
  HTTP/MCP still enforce the domain refusal.

**§32 gates the new chrome.** The remove control already lives behind Edit Layout Mode
(`2026-08-view-mode-section-chrome.md`); the region is *not* layout chrome — it is content, and it
shows in View Mode, or the undo is invisible exactly when someone needs it. The per-row Archive
button is a row affordance like complete, not a layout one. Stating this because the three
controls look alike and §32 is the reason they differ.

**How the region refreshes.** The canvas is covered — `onLiveEvent` routes `project.*` to
`refreshProject` (`project-page-store.ts:174-180`), which re-reads sections at `:233`. A row
archived through the new per-row button emits `task.archived`, which reaches
`notifyProjectDataChanged` (`:184`) and returns before `refreshProject`,
so **the region's store reads `ProjectPageStore.projectDataRevision` (`:119`)** and re-reads when
it changes. Note the precedent is not quite what it looks like: the section-scoped *stores* do not
subscribe: their **components** take the revision as a required `input` fed from
`project-page.html:175` (`progress-section.ts:11,14`, `reflections-section.ts:6,8`). Reading the
signal directly is simpler and fine — said so no one goes looking for a subscription that is not
there.

Restoring a section is the undo for a cascade, in one click, in the place the section used to be.
This is not the "computed unrendered-data region" the ADR rejected: that was rejected as a way of
*holding the ownership invariant* by surfacing orphaned live data. This shows deliberately
archived work, and it is the undo surface for an operation the ADR calls undoable.

- The region's store must not reach into the section-scoped stores; it reads with
  `includeArchived: true` and filters.
- Restoring a section **adds a section to the canvas**, so it must reach `reconcileSections`
  (`project-page-store.ts:647`) and not only bump `projectDataRevision` — the revision makes
  existing containers re-read; it does not paint a new one. **`reconcileSections` is `private`**,
  and the region's store must not reach into other stores, so `ProjectPageStore` gains a public
  entry point — `sectionRestored()` — that calls `reconcileSections` and then
  `notifyProjectDataChanged`. Naming it here because the two constraints are otherwise
  contradictory.
- **Restoring a *row* needs the mirror invalidation.** A restored task becomes live inside a live
  container whose store re-reads only when its component's `projectDataRevision` input changes, so
  a row restore calls `notifyProjectDataChanged()`. Without it acceptance item 3's "with no
  reload" holds for sections and silently fails for rows.
- Per-row **Archive** in the live task list emits `archiveRequested`, delegates through
  `TaskListSection`, disables while pending, and re-reads because `TaskGateway.archive` returns
  void. On success it calls `notifyProjectDataChanged`; on failure it preserves the row and shows
  the store error. This gives the region a second way to be reached and §58's later confirmation
  experiment something real to wrap.

**Verify:** `pnpm --filter web test`, then `pnpm lint` and `pnpm build`.

---

### Step 7 — Docs

- `docs/decisions/2026-09-what-undo-means-for-an-archived-row.md` — the §78 entry, recording all
  five options round 1 put on the record and why D won.
- `docs/decisions/2026-09-sections-own-their-data.md` — amend: "undoable" now points at a real
  operation, cascade archives the *container* rather than only its rows, and the invariant is
  strengthened rather than narrowed. Its *Confidence* line "Low for the reassign policy, which has
  no UI behind it yet" changes. Also record the already-shipped acyclic
  `TaskService`/`ReflectionService` → `SectionService` composition and why container creation stays
  on one domain path.
- `docs/decisions/2026-08-section-activity-targets-the-project.md` — amend the rejected
  soft-delete option and the "removal stays a hard delete" decision. The conclusion that section
  events target the project still holds; the reason is now durable activity identity, not the
  asserted absence of section archives.
- `docs/decisions/2026-09-a-section-has-a-name.md` — Archived becomes a fifth `nameOf` consumer.
  Preserve its compatibility rule for padded/blank legacy titles and record that the Archived
  region owns a local collision suffix instead of reusing the live-canvas position suffix.
- `AGENTS.md` — correct the over-narrow domain-boundary shorthand. Domain code may compose an
  acyclic domain service to preserve an invariant, as this repository already does, but it may
  depend only on domain/repository abstractions and must never know HTTP, MCP, JSON adapters or
  other infrastructure. This documents current architecture; it does not authorize a new edge.
- `Canvas Work Manager — Prototype Product, Design & Development Specification.md` — §9 adds
  `TaskGateway.restore`; §31 says remove archives and describes canonical section restore plus the
  project-scoped Archived region, including disabled Restore guidance while its project is
  archived; §32 says Archived remains visible in View Mode because it is content/undo, not layout
  chrome; §34 adds task archive/restore to the interaction list. §33 still
  needs no field-by-field rewrite: it describes a shape to start from, so the marker fields get
  justifying comments beside `sectionId` and `archivedAt` instead.
- Update stale source comments in `packages/contracts/src/inputs.ts:111-117`,
  `packages/domain/src/section-service.ts:267-275`, `apps/prototype-host/api/routes.ts:51`,
  `apps/web/src/app/features/projects/project-page-store.ts:456-466` and `:640-645`,
  `apps/web/src/app/features/projects/project-page-store.spec.ts:322`, and
  `apps/web/src/app/features/projects/section-removal-dialog.ts:16-20`, in addition to Step 2's
  four comments and Step 6's template comments. The post-write reconcile explanation must say a
  repeated remove now answers an already-archived 409, not 404.
- `development.md` — add the third unnumbered phase as **in progress before the first failing
  test**, and mark it **done only after** the full app/MCP/E2E acceptance pass. In the existing
  ownership summary, replace "removing a view touches no data" with the final archive semantics;
  in the completed names summary, change "all four naming surfaces" to include Archived.
- `.prototype/notes.json` — resolve `note-2026-09-01-002` by writing what using it found.

---

### Files changed

This is the implementation checklist; every path is concrete.

| File | Responsibility |
|---|---|
| `packages/contracts/src/section.ts` | Optional section archive field and corrected ownership comments; preserve the names helpers/refusal schema |
| `packages/contracts/src/section.test.ts` | Section archive parsing |
| `packages/contracts/src/task.ts` | Section/task archive markers and comments |
| `packages/contracts/src/task.test.ts` | Marker parsing |
| `packages/contracts/src/reflection.ts` | Section archive marker and comments |
| `packages/contracts/src/reflection.test.ts` | Marker parsing |
| `packages/contracts/src/inputs.ts` | `SectionQuery.includeArchived` and corrected removal prose |
| `packages/contracts/src/inputs.test.ts` | Section query parsing |
| `packages/repositories/src/interfaces.ts` | Correct the permanent-delete seam comment |
| `packages/repositories/src/json-repositories.ts` | Filter archived sections; correct hard-delete prose |
| `packages/repositories/src/repositories.test.ts` | Default/include-archived section reads and retained hard-delete seam |
| `packages/repositories/src/data-store.ts` | Section ownership, parent co-location, live-ancestor and marker integrity |
| `packages/repositories/src/data-store.test.ts` | All integrity cases and the corrected reflection fixture |
| `packages/domain/src/section-service.ts` | Live-only operations, archive/restore, typed refusal, return contract, project freeze |
| `packages/domain/src/section-service.test.ts` | Section behavior, permission, scope, idempotence, activity and return tests |
| `packages/domain/src/section-ownership.test.ts` | Rewrite old deletion/cascade expectations |
| `packages/domain/src/task-service.ts` | Parent checks, subtree archive/restore, marker normalization, archived-parent policy |
| `packages/domain/src/task-service.test.ts` | Task archive/restore, invariants, marker moves, permissions and activity |
| `packages/domain/src/reflection-service.ts` | Include-archived reads, archive/restore and archived-parent policy |
| `packages/domain/src/reflection-service.test.ts` | Reflection symmetry, permissions, scope and activity |
| `apps/prototype-host/api/routes.ts` | Restore routes and section/reflection query forwarding; section DELETE remains 204 |
| `apps/prototype-host/api/routes.test.ts` | New routes, forwarding, idempotence and response contracts |
| `packages/mcp-tools/src/tools/sections.ts` | Correct remove description and return archived service result |
| `packages/mcp-tools/src/contract.test.ts` | Live-only section list and write-only removal result |
| `apps/web/src/app/core/gateway/work-manager-gateway.ts` | Restore/archive/query methods and §9 correction |
| `apps/web/src/app/core/gateway/prototype-work-manager-gateway.ts` | HTTP adapter methods and query serialization |
| `apps/web/src/app/core/gateway/prototype-work-manager-gateway.spec.ts` | New adapter paths and schemas |
| `apps/web/src/app/core/gateway/testing/fake-gateway.ts` | Faithful archive filtering and new method fakes |
| `apps/web/src/app/features/projects/archived-region/archived-region.ts` | New region component |
| `apps/web/src/app/features/projects/archived-region/archived-region.html` | Archived sections and standalone rows |
| `apps/web/src/app/features/projects/archived-region/archived-region.scss` | Token-only layout/styles |
| `apps/web/src/app/features/projects/archived-region/archived-region.stories.ts` | Visual states |
| `apps/web/src/app/features/projects/archived-region/archived-region.spec.ts` | Projection, naming, restore, pending and failure tests |
| `apps/web/src/app/features/projects/archived-region/archived-region-store.ts` | Project-scoped archived projection and writes |
| `apps/web/src/app/features/projects/project-page.ts` | Host region and callbacks; corrected removal comment |
| `apps/web/src/app/features/projects/project-page.html` | Place Archived beneath the canvas |
| `apps/web/src/app/features/projects/project-page.spec.ts` | Connected region placement and final removal flow |
| `apps/web/src/app/features/projects/project-page-store.ts` | Reconciliation/invalidation entry points, stale comments, and the dedicated overlap-safe pre-paint `projectWritePending` counter/signal |
| `apps/web/src/app/features/projects/project-page-store.spec.ts` | Section/row restore invalidation and project-write pending ordering |
| `apps/web/src/app/features/projects/section-removal-dialog.ts` | Correct archived semantics comment |
| `apps/web/src/app/features/projects/section-removal-dialog.html` | Final dynamic task/reflection labels |
| `apps/web/src/app/features/projects/section-removal-dialog.spec.ts` | Update names-phase expectations for all four labels |
| `apps/web/src/app/features/tasks/task-row.ts` | Archive intent and pending input |
| `apps/web/src/app/features/tasks/task-row.html` | Archive button |
| `apps/web/src/app/features/tasks/task-row.scss` | Token-only pending/button styling |
| `apps/web/src/app/features/tasks/task-row.spec.ts` | Intent and disabled state |
| `apps/web/src/app/features/tasks/task-row.stories.ts` | Live/pending visual states |
| `apps/web/src/app/features/tasks/task-list-store.ts` | Archive/re-read/error behavior |
| `apps/web/src/app/features/tasks/task-list-store.spec.ts` | Void response, refresh and failure tests |
| `apps/web/src/app/features/projects/sections/tasks/task-list-section.ts` | Delegate archive and notify project data change |
| `apps/web/src/app/features/projects/sections/tasks/task-list-section.html` | Bind TaskRow archive/pending state |
| `apps/web/src/app/features/projects/sections/tasks/task-list-section.spec.ts` | Connected row-to-store wiring |
| `apps/web/src/app/features/projects/sections/reflections/reflections-store.ts` | Pass the owning section through the query-object list signature |
| `apps/web/src/app/features/projects/sections/reflections/reflections-store.spec.ts` | Section-scoped reflection query forwarding |
| `apps/e2e/web.spec.ts` | Extend the existing journey; no third E2E test |
| `Canvas Work Manager — Prototype Product, Design & Development Specification.md` | Correct §9, §31, §32 and §34 |
| `AGENTS.md` | Align the domain boundary wording with the existing, acyclic domain composition |
| `docs/decisions/2026-09-what-undo-means-for-an-archived-row.md` | Canonical undo and archived-parent policy |
| `docs/decisions/2026-09-sections-own-their-data.md` | Amend removal/invariant/confidence claims |
| `docs/decisions/2026-08-section-activity-targets-the-project.md` | Remove the now-false soft-delete rejection while preserving project-targeted events |
| `docs/decisions/2026-09-a-section-has-a-name.md` | Record Archived as a `nameOf` consumer and its local duplicate-name treatment |
| `development.md` | In-progress then done phase state; correct the ownership and names phase summaries to the final archive/name surfaces |
| `.prototype/notes.json` | Resolve the originating note from actual use |

---

### Acceptance check

Run items 1–2 **before reset**, then run `pnpm prototype:reset` once and restart the host on the
`personal-workspace` seed for items 3–13:

1. **A document written before this phase, and free of the defect this phase closes, still loads**
   unedited with no reseed: perform Step 2's default-file host boot against the current names-phase
   `.prototype/data.json`. `archivedAt` is optional and `SCHEMA_VERSION` is unchanged.
2. **The dangle cannot come back.** Make three fresh OS-temporary copies of that valid file; never
   edit `.prototype/data.json`. In one scratch copy point a live task at a missing section id; in
   the second point it at the `rich-text` section; in the third leave the task live and set its
   owning section's `archivedAt`. Start the host once per copy with `CWM_DATA_FILE` set to that
   exact scratch path. Each start refuses before listening, respectively naming the missing id,
   the wrong section type, and "live in an archived section". Remove the scratch files and clear
   `CWM_DATA_FILE`, then reset once for the interactive checks below.
3. **Cascade and undo, in one click each.** Name a second Task List `Backlog`, drag a task in,
   remove it with
   *Archive the section and its tasks*. It leaves the canvas and appears in the region as a
   section named `Backlog` holding 1 row. **Restore** puts the section back at the end of the canvas
   *with its task* and the same title, with no reload; `data.json` shows `archivedAt` gone from both
   and `title: "Backlog"` unchanged. Repeat once with an untitled list and confirm `Task List`, not
   the raw type, in the region.
4. **The only container.** Do the same to the project's only Task List. It restores identically —
   the case the rejected alternative had to invent a resolution mechanism for.
5. **A row archived beforehand stays archived.** Archive one task from its row, then cascade the
   container, then restore the section: the cascaded rows come back and the individually archived
   one does not. In `data.json`, only the cascaded rows ever carried `archivedWithSectionId`, and
   none carries it once restored.
6. **Subtasks.** Create a subtask, cascade its container, try to restore the child alone — refused,
   naming the **section** (rule 1 fires before rule 2). Restore the section: parent and child both
   come back, in the same list. Then archive the child alone, archive the parent, and restore the
   parent — the parent and descendants it took down return, while the child archived first stays
   archived.
7. **A view archives and restores too.** Remove the seeded `rich-text` section with text in it —
   no dialog, it just leaves the canvas. It appears in the region with no row count; **Restore**
   brings it back **with its text intact**, because `config` rode along on the section record.
   Quick add `progress`, then repeat: its configuration survives too (`personal-workspace` does not
   seed a Progress section).
8. **Removal and editing are refused where they should be.** Remove an already-archived section
   through `DELETE /api/sections/:id` — refused, naming it. `PATCH` its `config` — refused.
   Try to restore a task that came down with a section — refused, naming the section. Try to
   reassign into an archived target — refused. Creating or re-parenting a task beneath an archived
   parent is a rule error, not an integrity 500. Archive the project and confirm state-changing
   section/task/reflection restores are refused; archive/tidying remains allowed. Open that
   archived project by direct URL: Archived remains visible, every Restore is disabled with
   `Reactivate this project to restore archived work.` Start reactivation against a gated request:
   Restore stays disabled during the optimistic status paint and enables only after success.
   Archive the project again, repeat with failure injection, and confirm rollback leaves Restore
   disabled.
9. **A subtree archives and restores as one.** Give a task two subtasks, archive the parent from
   its row: all three leave the list, and `data.json` shows `archivedWithTaskId` on the two
   children and not the parent. Restore the parent from the region: all three come back. Then
   archive one child alone, archive the parent, restore the parent — the parent and its *other*
   child return, and the one archived first stays archived.
10. **Nothing shows an archived section.** `GET /api/projects/:projectId/sections` omits it,
   `list_sections` over MCP omits it, the canvas omits it, and Quick add's Duplicate/Move controls
   cannot reach it. Creating a task with no `sectionId` while the only container is archived makes
   a **new** container rather than reviving the archived one.
11. **Reflections** behave the same way, both directions — minus the subtree rules, which they
    have no parents to need.
12. Extend the existing `apps/e2e/web.spec.ts` journey after its dashboard assertion: return to the
    created project, archive its only Task List, restore it from Archived, and see its task without
    reloading. Do **not** add a third E2E test; `apps/e2e/mcp.spec.ts` stays unchanged.
13. `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm e2e`.

Items 4, 5, 7, 9 and 10 are the ones that matter: 4 is why this approach was chosen, 5 and 9 pin
the undo semantics at both levels, 7 is why views archive at all, and 10 is the cost the approach
incurs — the read path most likely to be missed.

---

### Test plan — written first

House convention: `.test.ts` in `packages/*`, `.spec.ts` in `apps/web`.

| Test | Proves |
|---|---|
| `repositories/data-store.test.ts` — a live task with a missing `sectionId` fails to load | The gap that let the dangle commit |
| `repositories/data-store.test.ts` — a live task whose section is a **view** type fails | The kind clause; without it this is a foreign-key check, not the invariant |
| `repositories/data-store.test.ts` — a live task in an **archived** section fails | The clause this approach earns |
| `repositories/data-store.test.ts` — an **archived** task in an archived section loads | The normal post-cascade state |
| `repositories/data-store.test.ts` — a section from another project fails; same set for reflections | Scope, both row types |
| `repositories/repositories.test.ts` — `list` excludes archived unless asked | The predicate every read depends on |
| `domain/section-service.test.ts` — cascade stamps `archivedWithSectionId` on each live row and on none of the already-archived ones | The pairing restore relies on |
| `domain/section-service.test.ts` — cascade, then validate the document | The regression test for the friction note |
| `domain/section-service.test.ts` — a container holding **only archived** rows is archived, not deleted, with no policy | The second dangle, which no policy ever reached |
| `domain/section-service.test.ts` — a view, and an empty container, are **archived rather than deleted**, and `list` omits both | Step 1's widening. This row asserted the opposite before round 3b |
| `domain/section-service.test.ts` — `list` defaults live-only and `{ includeArchived: true }` returns both states without crossing project scope | The sole archived section read is explicit, deterministic and scoped |
| `domain/section-service.test.ts` — archiving renumbers surviving siblings densely | Positions, which `add` then depends on |
| `domain/section-service.test.ts` — `restoreSection` appends at the end and restores only rows naming it, clearing both fields | Acceptance items 3 and 5 |
| `repositories/data-store.test.ts` — a **live** row carrying `archivedWithSectionId` fails; so does one naming a section other than its own | The marker cannot outlive what it describes |
| `repositories/data-store.test.ts` — a section marker whose section is live fails | A cascade marker cannot outlive the section archive it names |
| `repositories/data-store.test.ts` — live and archived children in a different section from their parent fail | Section cascades always operate on complete task subtrees |
| `domain/section-service.test.ts` — `resolveContainer` skips an archived container and creates a new one | Acceptance item 10's last clause, the subtlest read path |
| `domain/section-service.test.ts` — `requireContainer` refuses an archived section; `duplicate`/`move` refuse one | The rest of the read-path sweep |
| `domain/task-service.test.ts` — restoring a subtask alone is refused, naming the parent | The rule round 1 found missing |
| `domain/task-service.test.ts` — restoring a parent restores archived descendants into one section | `moveSubtree`'s promise, under restore |
| `domain/task-service.test.ts` — restore is idempotent; `status`/`completedAt` untouched; `updatedAt` stamped | Idempotence, unconflated archive, and the §62 refresh |
| `domain/task-service.test.ts` — an actor **without** `tasks.write` is refused; a task in another workspace answers not-found, not a rule error | Permission and scoping, per the `task-service.ts:62` idiom |
| `domain/task-service.test.ts` — create/re-parent beneath an archived parent is refused before mutation | The live-ancestor invariant produces a domain error, never an integrity 500 |
| `domain/task-service.test.ts` — state-changing restore in an archived project is refused; live restore remains a no-op | The exact archived-parent policy and retry semantics |
| `domain/task-service.test.ts` — archived project/section refuses create/update/complete while archive remains allowed | The task half of the exact freeze/tidying boundary |
| `domain/reflection-service.test.ts` — archive, restore, idempotence, and `list` honouring `includeArchived` | The asymmetry closed, and the read path that makes it visible |
| `host/routes.test.ts` — the four new routes; sections and reflections routes forwarding boolean `includeArchived`; section path scope wins over a stray query `projectId` | The seam, including the forwarding and scope protections round 1/final audit found missing |
| `web/prototype-work-manager-gateway.spec.ts` — section/reflection query objects serialize `includeArchived=true`; default calls omit it | The shared query shape reaches HTTP without changing live-only defaults |
| `web/reflections-store.spec.ts` — the live section read passes `{ sectionId }` | Migrating away from the positional parameter does not broaden a section's rows |
| `mcp-tools/contract.test.ts` — `list_sections` omits an archived section | The agent's canvas matches the person's |
| `web/archived-region.spec.ts` — hides when empty; restoring a section calls `reconcileSections`, not only the revision bump | The empty state and the repaint round 1 found missing |
| `web/archived-region.spec.ts` — a failed restore rolls back and shows a message | The failure path, per `task-list-store.spec.ts:224` |
| `web/project-page.spec.ts` — Archived is present in View Mode, hidden when empty, and section restore repaints the canvas | Region placement and §32 behavior through the real page wiring |
| `web/project-page-store.spec.ts` — a gated project update sets `projectWritePending` before optimistic status paint and clears it after success or rollback; with two overlapping project writes it stays true until both settle | Consumers cannot mistake optimistic status for persisted reactivation, and one response cannot release another request's guard |
| `web/project-page.spec.ts` — direct-load an archived project: the region remains visible with guidance; a gated reactivation keeps Restore disabled until success and a failed reactivation leaves it disabled | The UI never offers a restore the domain's project freeze will refuse |
| `apps/e2e/web.spec.ts` — extend the existing journey to cascade its only container and restore it | Acceptance item 4 end to end without creating a third E2E test |

New rows this phase's later rounds added:

| Test | Proves |
|---|---|
| `domain/section-service.test.ts` — a **view** with config is archived, not deleted, and restore returns its `config` unchanged | Step 1's widening, and the reason `rich-text` forced it |
| `domain/section-service.test.ts` — removing an **already-archived** section is refused | The case the region makes reachable |
| `domain/section-service.test.ts` — `reassign` to an **archived target** is refused, naming it | The read path the round-3 sweep found missing (`section-service.ts:328`) |
| `domain/section-service.test.ts` — reassign moves a complete archived task group, preserves its `archivedWithTaskId` markers, and the document validates | Reassign does not flatten a still-valid subtree undo group |
| `domain/task-service.test.ts` — moving an unmarked archived root between live sections repoints its descendants and preserves markers naming that root | A section move keeps one reversible archive group |
| `domain/task-service.test.ts` — moving within the same archive group preserves its root marker | Re-parent normalization splits a group only when ancestry actually changes |
| `domain/task-service.test.ts` — restoring a row whose section is archived is refused, naming the section — **both** for a marked row and for one archived individually beforehand | Step 4 rule 1, in both its cases |
| `domain/task-service.test.ts` — restoring a parent restores **only** the parent; a descendant archived individually stays archived | Step 4 rule 3, and the undo semantics |
| `domain/section-service.test.ts` — `restoreSection` into an **archived project** is refused | The freeze rule, which no UI reaches but the tool surface does |
| `domain/section-service.test.ts` — archived project refuses add/update/move/duplicate but still permits removal | The section half of the exact freeze/tidying boundary |
| `domain/section-service.test.ts` — restoring an already-live section is a no-op preserving position, timestamps, rows and activity count | Public-route retry cannot reorder the canvas or invent history |
| `domain/section-service.test.ts` — archive returns the archived `ProjectSection` | MCP can echo the result without a second permissioned read |
| `domain/section-service.test.ts` — archive/restore record exactly one `project.section_archived` / `project.section_restored`; idempotent restore records none | Activity and retry semantics |
| `domain/section-service.test.ts` — archive and restore summaries say `Archived/Restored the Backlog section`; a legacy blank title falls back through `nameOf` | The names phase's single naming contract survives both new activity paths |
| `web/archived-region.spec.ts` — a section owning nothing renders with no row count | Settled decision 6 |
| `mcp-tools` — `remove_section` echoes the archived section, not a bare id | The rewritten tool contract |
| `domain/task-service.test.ts` — `archive` on a parent archives its live descendants and stamps each with `archivedWithTaskId`; an already-archived descendant is untouched | The cascade, and the case that keeps its own marker |
| `domain/task-service.test.ts` — restoring a parent restores every task carrying its marker, in one lookup, clearing both fields | The undo, symmetric with `restoreSection` |
| `domain/task-service.test.ts` — restoring a task whose **parent** is archived is refused, naming the parent | Rule 2, in the case the cascade cannot prevent |
| `domain/task-service.test.ts` — detach marked B from archived A in `A → B → C`: B becomes the archive root and C's marker rewrites from A to B, for same-section, cross-section and top-level moves | The moved subtree stays reversible and restore A cannot revive detached descendants |
| `repositories/data-store.test.ts` — a live task under an archived parent fails; an archived one under an archived parent loads | The invariant the cascade earns |
| `repositories/data-store.test.ts` — a **live** task carrying `archivedWithTaskId` fails | The second marker cannot outlive its archive |
| `repositories/data-store.test.ts` — missing/live/self/non-ancestor/cross-project/cross-section task archive roots fail; dual markers fail | `archivedWithTaskId` really names one archived strict ancestor and markers are mutually exclusive |
| `domain/section-service.test.ts` — `update` on an archived section is refused, including a `config` replacement | The rich-text prose Step 1 exists to protect |
| `domain/section-service.test.ts` — missing `projects.write` and foreign-workspace restore are refused, with not-found winning for foreign ids | Permission and scope on the new method |
| `domain/reflection-service.test.ts` — archive/restore missing permission, foreign workspace, archived project and archived section cases | Reflection symmetry includes failure and privacy paths |
| `domain/reflection-service.test.ts` — archived project/section refuses create/update while archive remains allowed | The reflection half of the exact freeze/tidying boundary |
| `domain/task-service.test.ts`, `domain/reflection-service.test.ts` — archive/restore actions are recorded once; idempotent restores record nothing | New §57 action strings and event cardinality |
| `mcp-tools/contract.test.ts` — a `projects.write`-only agent receives the archived section from `remove_section` | No hidden `projects.read` requirement |
| `web/archived-region.spec.ts` — custom/fallback names, including padded and whitespace-only legacy `title` values; section counts; views; duplicate resolved-name suffixes; marker filtering; live-section and live-ancestor filtering; stable ordering | The exact project-scoped projection uses `nameOf`, not `title ?? displayNameOf`, including an independently archived child hidden until its archived parent returns, so every enabled Restore is executable |
| `web/section-removal-dialog.spec.ts` — final task and reflection reassign/cascade labels | The names-phase dynamic owned-kind contract survives the wording handoff |
| Preserve `web/project-page-store.spec.ts:532-560` — every malformed/differently discriminated 409 stays an ordinary error; add an archived-target race from an already-open prompt, which does not replace the prompt and also surfaces the error | The names-phase positive discriminator remains the only route into the policy dialog, while a person may still choose a different live target after a race |
| `web/task-row.spec.ts`, `web/task-list-section.spec.ts`, `web/task-list-store.spec.ts` — archive intent, pending disable, void-response re-read, revision notification and failure preservation | The new row control is wired across all three existing layers |

#### Existing tests this phase rewrites

AGENTS.md §2 rule 4 — change the test *and* the implementation *and* the doc. **Three of these
fail outright** on the second commit — the commit that must not be split — and four more keep
passing while their names stop describing the behaviour, which is worse:

| Test | Today | Must become |
|---|---|---|
| `domain/section-service.test.ts:170` — "deletes the section and closes the position gap" | expects `EntityNotFoundError` from `get` at `:176` | **Fails.** `get` goes through the unfiltered `require`, so an archived section is returned. Rename, and assert the section is archived, absent from `list`, and still returned by `get` |
| `domain/section-service.test.ts:216` — "is not idempotent — removing twice is not found" | expects `EntityNotFoundError` at `:221` | **Fails.** The second remove now raises `DomainRuleError`. Rename and re-assert — this is the §2 rule 4 case exactly |
| `domain/section-service.test.ts:226` — "records one event per mutation…" | asserts the literal `'project.section_removed'` at `:243` | **Fails.** `project.section_archived` |
| `domain/section-service.test.ts:252` — "names an untitled section by its default rather than by its type" | expects `Removed the Task List section` at `:263` | **Fails.** Keep the names-phase test and change the new final event to `Archived the Task List section`; add restore and custom/legacy-title cases rather than weakening it to an action-only assertion |
| `domain/section-ownership.test.ts:206` — "removes an empty container without ceremony" | asserts `list` is `[]` at `:212` | Keeps passing, name now lies. Assert archived-not-deleted |
| `domain/section-ownership.test.ts:224` — "cascades by archiving rather than deleting, so the removal is undoable" | asserts the task's `archivedAt` only (`:230-232`) | also assert the **section**'s `archivedAt`, and that `sectionService.list` omits it |
| `domain/section-ownership.test.ts:235` — "ignores rows that are already archived, so an emptied list goes quietly" | asserts `remove` resolves with no policy (`:240`) | rename, and assert the section is archived rather than deleted — this is "the second dangle" |
| `host/api/routes.test.ts:410-424` | asserts 204 on cascade, checks the task only | assert the section is archived and absent from a subsequent `GET` |
| `host/api/routes.test.ts:464-470` | removes a section, then expects the second DELETE to be 404 | the archived record still exists, so the second DELETE is the already-archived 409; keep the first response at 204 |

Mutation-check the kind clause, the live-in-archived clause, the two marker clauses, the task-group
preservation/re-rooting paths, the row-restore refusal, the `resolveContainer` skip, the reassign-target
refusal and the marker-scoped restore: each passes against a plausible wrong implementation
without it.

---

### Boundaries touched (§1, §8, §12, §70)

- **No `new Date()` in domain.** Everything goes through the injected `Clock` — see the §45 note in
  Step 4, which corrects the first draft's reasoning without changing its conclusion.
- **MCP tools call services, never repositories.** No new tools; `list_sections` changes only in
  what the service returns it.
- **`SectionService` gains no service-level knowledge of tasks.** It already holds `TaskRepository` and
  `ReflectionRepository` for `settleRows`; `restoreSection` uses the same two. Never `TaskService`,
  so `TaskService → SectionService` stays acyclic.
- **No new domain-service edge.** Task and reflection create/move already compose the acyclic
  `SectionService` container operations recorded by the ownership ADR. Restore does not call it;
  Step 4's refusal avoids the permission mismatch and the need for an unchecked
  `restoreSectionWithin` door. Step 7 corrects AGENTS.md's “repositories + Clock only” shorthand
  to the boundary the code actually enforces: domain/repository abstractions only, never transport
  or concrete persistence. `unitOfWorkFor` *would* have joined a nested call safely
  (`data-store.ts:321`) — the restore objection was permissions, not transactions.
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

### Explicit non-goals

- **No MCP archive or restore tools.** §54 has no archive tool at all. This is **Slice 22** work
  (§58 lists "archive task → confirmation"), not Slice 24 — Slice 24's §56 experiments are
  *variants of existing tools*, and this would be a new one.
- **No `includeArchived` on `list_sections`, `list_tasks` or `list_reflections`.** An agent has no
  undo surface to build; adding the parameter without a consumer is a claim no test backs. Named
  for all three because the two row queries already carry the field in contracts, so "the tools do
  not expose it" is a decision rather than an omission.
- **No project restore.** Restoring *into* an archived project is refused (Step 3) — that is in
  scope. Restoring the project itself is not; projects archive by status, a different mechanism
  with its own decision.
- **No trash view, no workspace-wide archive browser, no bulk restore, no undo stack.**
- **No purge, retention or permanent delete in this phase** (§80). Archived sections accumulate;
  that is the point, and a prototype document is disposable. Permanent deletion is wanted and is
  deferred deliberately — settled decision 5 records the shape.
- **No `cancelled` unification** (`2026-08-task-status-transitions-and-archive.md`).
- **No milestone archive.** Milestones have no container.

---

### Decisions settled for this phase

**1. ~~Is same-timestamp the right way to pair a restored section with its rows?~~ Resolved: no —
an explicit `archivedWithSectionId`.** See *Why a column and not a timestamp* below.

**2. An archived section is restorable when a container of its type already exists. Yes, always,**
while its project is active — two containers of one type is the thing the ownership phase made
normal, so refusing would be a rule invented for no reason.

**3. The region is project-scoped only.** It never shows archived sections or rows from
sub-projects, matching every other section read.

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

**4. `TaskQuery` does not gain `archivedOnly`.** The region uses `includeArchived: true` plus its
explicit client projection; add a query field only if a later search/dashboard consumer justifies
it.

The flat reads were checked and **none needs changing**. `TaskQuery.search` (`inputs.ts:171`) runs
through the task repository's live-by-default predicate; dashboard and upcoming work also retain
their explicit task guards (`dashboard-service.ts:80`, `workspace-service.ts:76` and `:118`).
Workspace search's reflections call is live-only because `JsonReflectionRepository.list()` applies
the same default when `includeArchived` is absent (`json-repositories.ts:148-154`) — it does not
have a second explicit filter. These are the reads the *Why a column* argument is built on, so their
actual exclusion mechanism is recorded rather than assumed.

**5. How does archived work get permanently deleted? — deferred, and wanted.** The user's direction
is explicit: this phase refuses `remove` on an already-archived section, and a later one adds a way
to clear out archived sections and their contents. The shape is open — a second `remove` request, a
distinct `delete` guarded on the section already being archived, a region-level *Empty archive*, or
a retention rule. Two things make it tractable whenever it comes: `SectionRepository.remove` is kept
for exactly this (Step 1), and `archivedWithSectionId` turns "delete this section and everything
that came down with it" into a **query on one column** rather than a graph walk. That is a third
reason the column beats the timestamp, alongside the two integrity clauses.

**6. The region shows sections that own nothing, uniformly.** Step 1
archives views too, so a removed Notes section is restorable like any other and hiding it would
make the region lie about what removal did. It simply shows no row count.

**Open questions: none.** Permanent deletion is wanted but deliberately deferred to the next
phase; Step 7 records it under *Revisit when*, not as a rejected option.

---

### Decision entries this phase must write

- `docs/decisions/2026-09-what-undo-means-for-an-archived-row.md` — the §78 entry. Its interesting
  content is the five options, why archiving the container beats resolving a target on restore,
  and the subtask rule — where the abstract question turns out to already have an answer in the
  codebase.
- An amendment to `2026-09-sections-own-their-data.md` per Step 7. A decision that claimed
  something untrue for a fortnight is worth recording as such — §77's rule is that the prototype
  correcting the design is the output, not an embarrassment.
- Amend `2026-08-section-activity-targets-the-project.md`: soft delete is no longer rejected, while
  project-targeted events still avoid activity references that can ever dangle.
- Amend `2026-09-a-section-has-a-name.md`: Archived consumes `nameOf` and owns its own collision
  suffix; the optional-title compatibility decision itself is unchanged.

---

### Commit sequence

```
contracts+repositories: archive metadata, filtered section reads, and parent-section integrity
domain: section archive/restore and section-marker integrity land together
domain: task cascade/restore, parent checks and task-marker integrity land together
domain: reflection archive/restore under the archived-parent rules
host+mcp: restore routes, and reads that can ask for archived
web: archived work is visible, and restorable, from the canvas
e2e: the existing web journey archives and restores its only list
docs+spec: what undo means for an archived row
```

The first commit is green **against the current clean names-phase data file**: it adds optional fields, section query
filtering, missing/wrong-kind section checks and parent/child section co-location, but it does not
yet enforce archive-marker or live-parent rules whose producing behavior has not landed. No seed
carries `archivedAt`, and every audited document free of the dangling-row defect passes.
Run Step 2's default-file host boot and repository checks once before `pnpm prototype:reset`; the
reset is acceptance setup, not data repair. The commit carries the `data-store.test.ts` fixture fix with it, since
`validDocument()` fails the new kind clause on its own. The section commit adds its marker clauses
atomically with every section-marker writer/clear.
The task commit adds the live-parent/task-marker clauses atomically with cascading archive,
restore, create/re-parent refusals and subtree marker normalization. There is never a green commit
where the existing public task archive route violates an invariant introduced earlier.

---

### Landed names baseline

`2026-09-section-names-implementation.md` landed through `918af90`. This plan has been rebased and
reviewed against that tree. The shared surfaces now have concrete contracts:

- `nameOf(section)` is the one resolved-name boundary, including legacy padded/blank stored titles.
- `SectionRemovalRefusalDetailsSchema` is the only 409 payload that opens the policy dialog;
  `GatewayError.details` remains untrusted until that feature parses it.
- `SectionRemovalPrompt` carries `sectionName`, `rowCount`, `ownedKind` and live target records.
  The dialog owns pluralisation and live-target collision labels.
- Section writes, including rename, share `ProjectPageStore.updateSection`; archive does not fork
  that path or add a second name-specific reconciliation mechanism.

The remaining label handoff is now current → archive behavior:

| Kind | Current names build | After this phase |
|---|---|---|
| tasks, reassign | `Move the tasks and remove` | `Move the tasks out, then archive` |
| tasks, cascade | `Archive the tasks and remove` | `Archive the section and its tasks` |
| reflections, reassign | `Move the reflections and remove` | `Move the reflections out, then archive` |
| reflections, cascade | `Archive the reflections and remove` | `Archive the section and its reflections` |

The archive phase changes those labels and their comments only. It preserves the prompt fields,
the `ownedKind` noun table, the resolved section/target names, positional disambiguation for live
targets, and the rule that every other 409 stays an ordinary error.

---

### Environment

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

### Revisions

**Round 7 — rebased after the names phase landed.** Re-read the actual names diff and current
contracts/domain/host/web code, then ran a cold-start plan audit against the rebased tree. The
review removed the now-false pre-commit repair reset (the names browser pass already restored the
working data to a clean seed), converted the dangling row to historical note evidence, and
replaced the future-tense sibling sequencing with the landed contracts this phase must preserve.
It added the names-created activity and 409 tests plus the host's second-DELETE test to the rewrite
list; added the activity-target and names ADRs and both stale `development.md` summaries to living
documentation; pinned `nameOf`'s padded/blank legacy behavior in Archived; and made
`projectWritePending` an overlap-safe, reactive project-write counter that starts before today's
optimistic paint rather than reusing the later, non-reactive all-write counter. Source citations
across the shared files were refreshed. The follow-up review then made the clean-data proof an
actual default-file host boot, moved the three invalid-document checks to isolated
`CWM_DATA_FILE` scratch copies before one acceptance reset, and corrected the remaining rebased
citations. The final re-review returned no substantive findings. Round 7 review findings are not
implementation work; the code remains untouched until the first TDD commit.

**Round 6 — post-edit consistency audit.** Distinguished a schema migration from the required
repair reset, made the section and reflection archived-read APIs explicit shared-contract query
objects, added their affected caller/tests to the checklist, and pinned boolean query parsing at
the host boundary. The final independent review then closed the independently-archived-child and
archived-project UI holes, corrected false claims about the existing acyclic domain composition,
and required its boundary wording to be reconciled in AGENTS.md and the ownership ADR. A final
invariant pass separated immobile section markers from movable task archive groups, preserving or
re-rooting the latter by ancestry instead of clearing markers generically. Rechecked the exact
projection, freeze policy, atomic commit order and sibling handoff after all changes. The follow-up
review then added pending-aware reactivation gating and explicit seed setup; the final re-review
returned no substantive findings.

**Round 5 — full two-plan review, with the remaining behavior decided.** The review found that the
new invariants were stronger than the write paths and commit order that maintained them. The plan
now refuses create/re-parent beneath archived parents, makes parent/child section co-location an
integrity rule, and lands live-parent/task-marker validation atomically with cascading task archive.
Detaching a marked middle node makes it the new archive root and rewrites its old-group descendants,
so restoring the former root cannot revive a detached partial subtree. Marker validation now checks
mutual exclusion, live/archive state, target existence, same project/section and strict ancestry.

Public restore is idempotent for already-live entities; a state-changing restore is refused under
an archived project, while archive/removal remains available for tidying. `SectionService.remove`
returns the archived section so a write-only MCP caller can receive it without a second read. The
Archived region now has an exact project-scoped projection: it uses the names phase's `nameOf`,
counts only section-marked rows, hides task-marked descendants and rows behind archived sections,
and deterministically orders/disambiguates duplicates. Missing TaskRow → TaskListSection → store
wiring, permission/activity tests, §31/§32/§34 corrections and stale comments are all enumerated.
The existing web E2E journey is extended rather than creating a third test. All formerly blocking
questions are decisions, and the archive phase must rebase and be reviewed again after names lands.

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

**Round 3a — the pairing mechanism, at the user's direction.** Same-timestamp matching is replaced
by an explicit `archivedWithSectionId` on `Task` and `Reflection`, for the reasons under *Why a
column and not a timestamp*. The alternative of not archiving rows at all is recorded there too: it
is the most elegant option on paper and reintroduces exactly the join the ownership decision
refuses, which is worth knowing the next time someone has the same idea. The column also earns two
integrity clauses the timestamp could not support, so the pairing is now enforced rather than
assumed. Still optional fields throughout — no `SCHEMA_VERSION` bump.

**Round 3b — five behavioural questions answered by the user, and a second cold-start review.**
The review returned eight blocking findings and thirteen minor; the user's answers dissolved two
of the blocking findings outright and widened Step 1.

What the user settled:

1. **Removing an already-archived section is refused for now**, with permanent deletion wanted as
   a later phase — Open question 5, recorded as *Revisit when* rather than a non-goal.
2. **A parent's archived state freezes everything beneath it.** Project freezes sections, section
   freezes rows; one rule, stated once, holding on the tool surface even where no UI reaches it.
3. **Rich Text should not be the odd one out.** Step 1 now archives *every* section rather than
   only cascaded containers — which turned out to be cheaper than the alternatives, since
   archiving preserves `config` for free and needs no second type-keyed table. `SectionKind` stops
   being overloaded to mean "survives removal".
4. **You cannot restore one row out of a list you archived** — it is refused, naming the section.
5. **Restore is a canonical undo**: archiving a list and restoring it changes no other state, so a
   row archived beforehand stays archived.

(4) and (5) together **removed** work rather than adding it. The plan had `TaskService.restore`
restore the row's section, which crossed a permission boundary the review caught — `restoreSection`
asserts `projects.write` against a `tasks.write` caller, the exact case `section-service.ts:147-151`
legislates for — and silently restored every other row the section had taken down. Refusing instead
deleted the cross-service call, the `restoreSectionWithin` door it would have needed, and the
subtree-restore rule; `TaskService.archive` does not cascade to descendants, so `restoreSection`
already covers every multi-row case.

What the review found on its own:

1. **The plan's first commit was red against the developer's actual data file.** It quoted the
   dangling row as Step 0 evidence and then asserted, seventy lines later, that every existing
   document passes the new rule. `validateDocumentIntegrity` runs on construction
   (`data-store.ts:231`), so the host would have refused to boot. Step 2 now reseeds first, and
   acceptance item 2 says which documents load.
2. **The marker went stale on three existing write paths**, each becoming an unhandled integrity
   failure: `settleRows` reassign (`:325`), `TaskService.update` (`:139`) and `moveSubtree`
   (`:264-265`) all move `sectionId` on archived rows. Step 2 gained a write-contract table and
   three tests. This was the cost round 3a's column added without noticing.
3. **The read-path sweep was one entry short** — `settleRows` resolves its reassign target through
   the unchecked `require` (`:318`), so live rows could be moved into an archived container.
4. **`remove_section`'s tool description and return shape**, and the removal dialog's two labels,
   all stated the old semantics; the dialog labels had been deferred to the sibling plan when they
   are this one's to fix.
5. **Three existing tests keep passing while their names stop describing the behaviour.**
   Enumerated now, with the assertion each gains.
6. Smaller corrections: `sectionFor` does not exist (it is `resolveSection`); four wrong line
   citations around `runUnitOfWork`/`unitOfWorkFor` and the seeds; validation runs twice per unit,
   not once; a stale `position` on an archived section, harmless and now said; the region's store
   had no stated invalidation and needs `projectDataRevision`; §32 was missing from the §N list;
   reflection activity actions were unnamed; Step 6 had no file paths at all, which AGENTS.md §3
   requires; and the cross-plan overlap was understated as two doc files when it is six shared
   source files.

The reviewer also confirmed, against the code, that all five of Step 0's facts hold and the
dangling row is still on disk; that `validateDocumentIntegrity` never mentions `sectionId`, so the
clause fits where the plan puts it; that the nested-unit claim is true through the whole call path
(one memoized adapter shared by all three services, the join preserved through the live-events
wrapper); that no `SCHEMA_VERSION` bump is needed; that the `includeArchived` predicate citations
are exact; that the reflections read-path gap is exactly as described in exactly three places;
that `ActivityActionSchema` is a regex so the new actions need no contracts change; that every §N
citation checks out; that the web repaint reasoning is right; and that the acceptance mechanics —
`pnpm prototype:reset`, the seeded canvas, cross-list drag, the gitignored e2e data file — are all
real. `TaskQuery.search`, `dashboard-service.ts:80` and `workspace-service.ts:76,118` were swept
and none needs changing.

**Round 4 — a second behavioural decision from the user, and a third cold-start review.** The
review returned seven blocking findings and nine minor. Round 3b's *substance* was re-verified and
held — the write-contract paths, the `TaskService.archive` claim, reassign coherence, the §32
reasoning, the marker clauses, both plans' handoff tables. What round 3b had not done was re-sweep
the **existing test suite and existing doc comments** against its own widening of Step 1.

**The user's decision: archiving a task cascades to its descendants.** The review found a state the
five-state table missed — archive a parent on its own, then cascade the section, and `restoreSection`
restores the still-live child while the parent stays archived, producing the live-under-archived
state Step 4 rule 2 refuses. Investigating it showed rule 2 was inventing an invariant nothing
enforced: `archive` did not cascade, `apps/web` renders the task list flat, so a live child under
an archived parent was already normal. Rather than drop the rule, the user chose to make the
invariant real. Step 4 now cascades, `Task` gains `archivedWithTaskId` for the same reason it has
`archivedWithSectionId`, Step 2 gains a parent clause and a marker clause, and the state table runs
to six rows. It is the larger option and it is the one that leaves a rule you can state in a
sentence: **a live row's ancestors are live.**

**The user's second decision: `update` is refused on an archived section.** It resolved through the
unchecked `require` and refused nothing, so `PATCH /api/sections/:id` and `update_section` could
replace the `config` of an archived section — including the `config.text` whose survival is Step
1's entire justification for archiving views.

What the review found on its own:

1. **Four more existing tests, three of them red on the second commit.**
   `section-service.test.ts:152`, `:180` and `:190` all fail outright (an archived section is still
   returned by `get`; a second remove now raises `DomainRuleError`; the recorded action changed),
   and `section-ownership.test.ts:206` keeps passing under a name that stops being true. Round 3b's
   rewrite table claimed completeness at three rows and was short by four.
2. **`data-store.test.ts`'s own `validDocument()` fails the kind clause** — `reflection-1` sits in
   a `task-list` — across 29 call sites, each validating at construction. Round 3b swept the seeds
   and stopped there, so the first commit was red in `@cwm/repositories` independently of the
   reseed it did catch.
3. **`json-repositories.test.ts` does not exist.** It was cited twice, including as the sole
   evidence for keeping `SectionRepository.remove`. The coverage is `repositories.test.ts:452-482`.
4. **`reconcileSections` is `private`**, while the plan required the region's store to drive it and
   to stay out of other stores — two constraints that could not both hold. And the invalidation was
   stated for the archive direction only: restoring a *row* left its container stale, so acceptance
   item 3's "with no reload" held for sections and silently failed for rows.
5. **The read-path sweep omitted `update` and `get`** — the first now refused (above), the second
   deliberately unfiltered and now said so, because "every read becomes live-only" reads as a
   blanket rule and filtering `get` breaks restore.
6. **Step 6's file paths pointed at the wrong directory.** The per-row Archive control lives in
   `features/tasks/`, not `sections/tasks/`, and the concrete HTTP adapter
   `prototype-work-manager-gateway.ts` was missing entirely — so round 3b's fix for "Step 6 had no
   file paths" substituted a glob over the wrong folder.
7. Smaller: `z.string().datetime()` for the house `IsoDateTimeSchema`; three more stale comments
   (`json-repositories.ts:50-55`, `section.ts:22-27` and `:42-45`) plus two in the dialog; "as the
   section-scoped stores do" describes a subscription that does not exist (their *components* take
   the revision as an input); ten line drifts in round-3b lines; §4 cited but not declared, and
   misread; Step 6 restated the label table with a "Before" column that will not be in the file
   once the names phase lands first; keeping an uncalled `SectionRepository.remove` is in direct
   tension with AGENTS.md §4 and is now stated as a trade rather than asserted; and the freeze rule
   needed both a status check `assertProjectVisible` does not do and an explicit note that removal
   in an archived project stays allowed.

Also closed: `update_section` on an archived section (above), the MCP row tools (`list_tasks` and
`list_reflections` are named in the non-goal now, not just `list_sections`), and `renumber`
ordering (arbitrary, and said to be).

One nuance worth carrying into implementation: `update` writes `sectionId` twice — from the input
at `:138` and again at `:159` when a subtask follows a re-parent — so the marker clear must key off
`next.sectionId !== current.sectionId`, not off whether the input named a section.
