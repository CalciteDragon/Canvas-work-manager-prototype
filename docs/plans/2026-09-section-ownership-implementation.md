# Implementation plan — container sections own their rows

Decision of record: `docs/decisions/2026-09-sections-own-their-data.md`. Read it first; this
plan implements it and does not re-argue it.

**Goal.** A project can hold several *different* instances of one data type, and no data can
exist in a project without being rendered. Sections stop being views over the project's rows
and become owners of them.

**Not in scope.** Milestones gain no container (§35 keeps them distinct; the timeline view
still renders them). Scoping a view to a single container is explicitly deferred.

---

## Step 0 — Two facts that change the obvious approach

**There is no migration mechanism, and that is deliberate.** `PrototypeDocumentSchema` pins
`schemaVersion: z.literal(SCHEMA_VERSION)`, and the comment in
`packages/contracts/src/document.ts` says a mismatch is fatal "so a stale file fails at load
instead of halfway through a session." No migration runner exists anywhere in the repo.
Prototype data is disposable, so:

> **Bump `SCHEMA_VERSION` from 1 to 2 and reseed. Do not write a migration.**
> A stale `.prototype/data.json` will fail loudly at load, which is the designed behaviour.
> `pnpm prototype:reset` rebuilds it. The host loads the file once at startup, so restart it.

**The registry is in the web app, but the domain needs `kind`.** `SECTION_REGISTRY` lives at
`apps/web/src/app/features/projects/sections/registry.ts`, and `SectionService` (in
`packages/domain`) cannot import from `apps/web`. Cascade-on-remove and container resolution
both need to know whether a type owns rows.

Resolve this by putting the ownership map in `packages/contracts` and having the web registry
read from it, with **`view` as the default for any unregistered type** — an unknown type can
then never cascade, which keeps the failure mode non-destructive.

This costs something worth stating: adding a *container* type now touches two files (the
contracts map, plus the web registry and its folder) rather than the one §30 promises. Views
are unaffected. Record it in the ADR's "what we learned" if it survives review.

---

## Step 1 — Contracts

`packages/contracts/src/section.ts`

Add the kind enum and the ownership map, keyed by the same open `type` strings the registry
uses:

```ts
export const SectionKindSchema = z.enum(['container', 'view']);
export const OwnedDataKindSchema = z.enum(['tasks', 'reflections']);

/** Types absent from this map are views. An unknown type must never cascade. */
export const SECTION_OWNERSHIP: Record<string, OwnedDataKind> = {
  'task-list': 'tasks',
  reflections: 'reflections',
};

export const sectionKindOf = (type: string): SectionKind =>
  type in SECTION_OWNERSHIP ? 'container' : 'view';
export const ownedKindOf = (type: string): OwnedDataKind | undefined => SECTION_OWNERSHIP[type];
```

`rich-text` is a container conceptually but owns its data through `config.text`, not through
rows. Leave it out of the map — it has nothing to cascade, and deleting the section already
deletes its text.

Then:

- `packages/contracts/src/task.ts` — add `sectionId: SectionIdSchema` (required).
- `packages/contracts/src/reflection.ts` — the same.
- `packages/contracts/src/document.ts` — `SCHEMA_VERSION = 2`.

`packages/contracts/src/inputs.ts`

- `CreateTaskInputSchema`: add `sectionId: SectionIdSchema.optional()`.
- `CreateReflectionInputSchema`: the same.
- `UpdateTaskInputSchema`: add `sectionId: SectionIdSchema.optional()` — this is the move.
- Add `RemoveSectionInputSchema`:

```ts
export const RemoveSectionInputSchema = z.object({
  policy: z.enum(['cascade', 'reassign']).optional(),
  reassignToSectionId: SectionIdSchema.optional(),
});
```

**Verify:** `pnpm --filter @cwm/contracts test`. Expect failures elsewhere in the workspace;
contracts itself should pass.

---

## Step 2 — Seeds

`packages/prototype-data/src/seeds.ts`

The `task(...)` helper takes `projectId`; it now needs a section too. Every seeded project
already gets `section-${projectId}-tasks` (around line 163) and `section-${projectId}-reflections`
(around line 170), so the ids are predictable — pass `section-${projectId}-tasks` as the owning
section for every seeded task, and the reflections section for every seeded reflection.

Two things to check rather than assume:

- Every project that seeds tasks must actually seed a `task-list` section. Confirm before
  relying on the id convention.
- `prototype/seeds/agent-heavy.json` is a committed JSON fixture, not generated. Update it by
  hand to match.

**Verify:** `pnpm --filter @cwm/prototype-data test`, then `pnpm prototype:reset` and confirm
the file parses.

---

## Step 3 — Domain

### `packages/domain/src/section-service.ts`

Add container resolution — the piece that keeps default layout from becoming a separate
mechanism:

```ts
/**
 * The container a row goes to when none is named. The first container of the matching type,
 * and otherwise a new one created through `add` — the same operation the Add Section button
 * calls, so a default layout is the existing behaviour reached by a different door.
 */
async resolveContainer(actor, projectId, owned: OwnedDataKind): Promise<ProjectSection>
```

It must call `this.add(actor, projectId, { type })` rather than build a section inline, so
positioning, `createDefaultConfig` and the `project.section_added` activity event all stay on
one path. Note that `add` opens a unit of work — check whether `unitOfWork.run` re-enters, and
if it does not, factor the body into a private method both call inside one transaction.

Change `remove` to take a policy:

- View section → never touches data, whatever the policy says.
- Container, no rows → remove silently.
- Container, rows, `cascade` → set `archivedAt` on the rows, then remove the section.
  `archivedAt` already exists and is deliberately distinct from `cancelled`, so this is undoable.
- Container, rows, `reassign` → require `reassignToSectionId`; assert it is a container of the
  same type in the same project; repoint the rows; remove.
- Container, rows, no policy → throw `DomainRuleError` naming the row count, so the API can
  surface a choice rather than guess.

### `packages/domain/src/task-service.ts`

- `create`: resolve `sectionId` through `sections.resolveContainer` when absent; assert a
  supplied one is a `task-list` container in the same project.
- Subtasks inherit `parentTaskId`'s `sectionId` — tighten the existing same-project check.
- `update`: moving `sectionId` asserts the same; moving `projectId` must move both keys together.
- Put the invariant in one helper: **a row's section must belong to the row's project.**

### `packages/domain/src/reflection-service.ts`

The same create path, with owned kind `reflections`.

This gives `TaskService` a dependency on `SectionService`. Check for a cycle — `SectionService`
depends on `ProjectRepository` and not on tasks, so it should be clean.

**Verify:** `pnpm --filter @cwm/domain test`. Tests worth adding: create-with-no-section makes
exactly one section; doing it twice reuses that section; removing a view leaves rows untouched;
cascade archives rather than deletes; reassign repoints; an unknown section type is treated as a
view.

---

## Step 4 — Host API

`apps/prototype-host/api/routes.ts`

- `DELETE /api/sections/:id` reads the policy through `RemoveSectionInputSchema`.
- Confirm `PATCH /api/tasks/:id` passes `sectionId` through; add it if the route enumerates
  fields rather than forwarding the parsed input.

**Verify:** `pnpm --filter @cwm/prototype-host test`.

---

## Step 5 — MCP tools

`packages/mcp-tools/src/tool.ts` — add `sections: SectionService` to `WorkManagerServices`.

New file `packages/mcp-tools/src/tools/sections.ts`, following `tools/reflections.ts` verbatim
in shape (`defineTool`, a declared `permission`, an `inputSchema`, and an `execute` that
delegates straight to a service):

| Tool | Permission | Delegates to |
|---|---|---|
| `list_sections` | `projects.read` | `sections.list(actor, projectId)` |
| `create_section` | `projects.write` | `sections.add(actor, projectId, input)` |
| `update_section` | `projects.write` | `sections.update(actor, id, input)` |
| `remove_section` | `projects.write` | `sections.remove(actor, id, policy)` |

`create_task` gains `sectionId` for free once `CreateTaskInputSchema` has it.

`packages/mcp-tools/src/registry.ts` — add the four names to `SPEC_TOOL_NAMES` and wire
`sectionTools` in.

Do **not** add permission checks inside the tools. The registry deliberately does not check;
`assertPermitted` inside the service throws; and `contract.test.ts` pins the declaration to the
enforcement from both sides. `import-lint.test.ts` separately enforces that a tool reaches
services and never repositories.

Wire the new service wherever the registry is constructed — check `apps/prototype-host/mcp/`
and `packages/mcp-tools/test/harness.ts`.

**Verify:** `pnpm --filter @cwm/mcp-tools test`. `SPEC_TOOL_NAMES` is asserted from two sides,
so a missed registration fails loudly.

---

## Step 6 — Web

`apps/web/src/app/features/projects/sections/registry.ts`

Add `kind` to each entry, sourced from `sectionKindOf` so the contracts map stays the single
source.

`apps/web/src/app/features/projects/project-page.ts`

- **`TaskListStore` and `ReflectionsStore` become section-scoped, not page-scoped.** This
  inverts the rationale in the class comment around line 33, which currently shares one store
  precisely so duplicate lists *cannot* drift. Under ownership they must differ. Move those
  providers from the page down to the section components, and rewrite that comment — leaving it
  would leave a documented justification for the opposite of what the code now does.
- `ProgressStore` stays page-scoped: progress is a view over the whole project.

Section components load by `sectionId` rather than `projectId`.

New UI, in this order:

1. **Drag a task between containers** — the operation that makes two lists worth having.
2. **Removal dialog** — only for containers holding rows; names the count and offers cascade or
   reassign. Views remove without ceremony.

**Verify:** `pnpm --filter web test`, then `pnpm lint` and `pnpm build`.

---

## Step 7 — End to end

1. `pnpm prototype:reset`, then restart the host — it loads the file once at startup.
2. `pnpm test` and `pnpm lint` across the workspace.
3. Over MCP: `create_project`, then `create_task` with no `sectionId`. The project must render
   that task with no section created by hand. **This is the bug the whole change exists to
   close.** Confirm `list_sections` shows the container that `create_task` caused.
4. Add a second Task List, drag a task across, confirm the two lists differ.
5. Remove a view section and confirm no data moves. Remove a non-empty container with `cascade`
   and confirm the rows archive rather than vanish.

---

## Commit sequence

One commit per step, in order. Steps 1–3 are the only ones that must land together to keep the
tree green. Suggested subjects, matching repo style:

```
contracts: sections own their rows, and the schema knows which ones
seeds: every seeded row names its container
domain: resolve a container on create, cascade or reassign on remove
host: removal takes a policy
mcp: section tools, and a task that can name its container
web: section-scoped stores, drag between containers, removal dialog
```

---

## Progress — paused 2026-09-01

**Steps 1–6 are done and committed**, one commit per step, subjects as suggested above
(`5e61e54`..`a94ef26`). `pnpm test` (1122), `pnpm lint` and `pnpm build` all pass on a clean
tree.

**Step 7 is partly done.** Seed reset, host restarted, and item 3 — the bug the change exists
to close — verified against the running host: a project with an empty canvas, then
`POST /api/tasks` with no `sectionId`, answered a task owning `section-bdaadc55`, and
`GET /api/projects/:id/sections` went from `[]` to `task-list@0`.

### What is left

- Step 7 items 4 and 5 in the running app: two Task Lists with a drag across, then a view
  removal and a cascade through the UI. Both are covered by tests; neither has been clicked.
- `docs/mcp-setup.md` still says "fourteen tools" in its opening line and its `tools/list`
  expectations. It is eighteen now — the four section tools.
- `development.md` slice status for this phase.
- This plan's step 0 asked to record in the ADR, if it survived review, that adding a
  *container* type now touches two files (the contracts map plus the web registry and its
  folder) rather than the one §30 promises. It did survive: `SECTION_OWNERSHIP` lives in
  `packages/contracts/src/section.ts` and `registry.ts` reads `kind` back out of it.

### Three deviations from the plan, all deliberate

1. **`Reflection` gained `archivedAt`** (and `ReflectionQuery` gained `includeArchived`). The
   plan justified cascade-as-archive with "`archivedAt` already exists" — true only of
   `Task`. Without the field, cascading a `reflections` container would have had to hard
   delete, which the decision rules out.
2. **`TaskQuery` and `ReflectionQuery` gained `sectionId`**, without which a section-scoped
   list cannot read what its container owns. `contracts` also gained `containerTypeFor`,
   deriving the type to create from `SECTION_OWNERSHIP` rather than restating the mapping.
3. **Two seeds changed shape, not just ids.** `nested-projects` lost `task-cabinets-samples`
   so Cabinets can keep its deliberately empty canvas — under ownership an empty canvas and
   an unrendered row are the same defect. `agent-heavy`'s Agent operations project gained the
   `reflections` container its seeded reflection always needed. The plan's claim that
   `prototype/seeds/agent-heavy.json` is hand-maintained is wrong: `seeds.test.ts` compares
   all six snapshots byte-for-byte against `buildSeed`, so they are generated.

Also worth knowing: `runUnitOfWork` does **not** re-enter, so `SectionService.add` delegates
to a private `addWithin` that `resolveContainer` also calls inside the caller's transaction.
Neither `resolveContainer` nor `requireContainer` checks `projects.write`, following
`TaskService.require`'s rule that reads and writes a *write* does on its own behalf are not
re-checked — an agent holding `tasks.write` alone must still be able to create a task.

### Environment

A prototype host predating the session was holding `:4310` with a schema-version-1 document;
it was stopped and restarted. The running host serves the `agent-heavy` seed and contains an
`Agent smoke test` project left by the verification above. `pnpm prototype:reset` and a host
restart clears both.
