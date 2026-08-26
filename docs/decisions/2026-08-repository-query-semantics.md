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
