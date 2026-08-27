# How repository queries combine and compare values

**Question**

The Slice 2 contracts define `ProjectQuery` and `TaskQuery`, but not how several filters
combine, whether due-date bounds include their endpoints, or how free-text search treats
case and whitespace. What is the smallest predictable behavior for the JSON repositories?

**Options tested**

- *Leave every field to the later service/API consumer*: rejected because §13 places
  `list(query)` on the repository interface, and two implementations could otherwise
  interpret the same shared query differently.
- *Inclusive due bounds*: rejected for now; `dueBefore`/`dueAfter` read as strict
  boundaries and exclusive comparison avoids one instant satisfying both adjacent ranges.
- *Exact, case-sensitive text matching*: rejected; the prototype's in-memory search is
  for people, and casing should not make a project or task disappear.
- *AND composition, membership arrays, exclusive date bounds, and normalized text
  matching*: chosen and pinned by repository tests.

**What we learned**

The implementation stays small when each supplied field is a predicate and all predicates
must pass. Missing due dates naturally fail a requested due-date predicate. Trimming the
search term makes an empty input a no-op, while case-insensitive substring matching over
name/title and description makes the same query useful before Slice 21 adds a broader
search experience.

**Current decision**

All supplied filters compose with AND. Status and priority arrays use membership.
`dueBefore` and `dueAfter` are exclusive, and an undated task satisfies neither.
Project/task search trims the query and performs a case-insensitive substring match over
name/title or description; an empty trimmed query applies no text filter.

**Confidence**

Medium. The behavior is coherent and fully tested, but no UI has exercised it yet.

**Revisit when**

Slice 5 exposes list queries through domain services and HTTP; Slice 11 builds due-date
dashboard views; and Slice 21 tests whether simple substring search remains useful.

---

## Amendment — Slice 5: `includeArchived` and `ActivityQuery`

Slice 5 added two filters and, in doing so, tested the rule this entry set: query
semantics belong to the repository, not to the caller of the repository.

The first draft of the plan had `TaskQuery.includeArchived` on the contract but filtered
it in `TaskService`. That is the failure this entry exists to prevent —
`taskRepository.list({ includeArchived: true })` would type-check and lie, and a future
`PostgresTaskRepository` would implement it while the JSON one silently ignored it. It is
now a predicate in `JsonTaskRepository.list`, alongside the others.

`ActivityRepository.list()` took no query at all, which would have forced the same split
for the new `ActivityQuery`. Its signature was widened to `list(query?)` rather than
making activity the exception.

**Semantics**

- `includeArchived` — archived tasks (`archivedAt` set) are **excluded** unless this is
  `true`. It composes with every other filter by AND, like the rest.
- `ActivityQuery.projectId` — exact match on the event's `projectId`.
- `ActivityQuery.limit` — applied **last**, after filtering, so it truncates the result
  rather than the collection. Capped at 200 in the schema because it arrives off a query
  string. `ActivityService.list` re-applies it after workspace scoping and sorting, for
  the same reason: a limit pushed down would truncate before the rows the caller can
  actually see are known.

**Revisit when** unchanged, plus: Slice 13, when the activity feed needs paging rather
than a bare limit.
