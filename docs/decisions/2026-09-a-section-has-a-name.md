# A section has a name, and the default is derived rather than stored

**Question**

What is a section called, and who decides? The ownership phase made two Task Lists on one
canvas a normal thing to have (`2026-09-sections-own-their-data.md`), and immediately made
them impossible to tell apart. Using the prototype found four different answers to "what is
this section called", and they disagreed — for an untitled Task List the frame said
`Task List`, the removal dialog and the activity summary said `task-list`, and Rich Text's
aria-label said `this section` (`.prototype/notes.json`, `note-2026-09-01-001`).

The gap underneath was narrower than it looked. `ProjectSection.title` has existed since
Slice 8 as §31's optional frame-title override, and `UpdateSectionInput.title`,
`PATCH /api/sections/:id` and the `update_section` MCP tool all carried it — so **an agent
could name a section and a person could not**, which is the wrong way round for a control
that lives on the frame.

**Options tested**

- *Store the default as a literal at creation*: rejected. It makes every surface agree by
  construction, and it means a stored `"Task List"` silently stops tracking the registry —
  renaming a display name would leave every existing section on the old one, with no way to
  tell a deliberate name from an inherited one.
- *Keep the default in `SECTION_REGISTRY` and pass it down*: rejected. `displayName` lives
  in the Angular registry, which `SectionService` cannot import and no non-web caller can
  reach. That is exactly the constraint that moved `kind` below both last phase.
- *Derive the default from the `type` string*: chosen, **plus a one-entry overrides table**.
  Six of the seven registered display names are the title-cased kebab type. `sub-projects`
  is not: the registry and the spec (line 1109) both spell it `Sub-Projects`, and no rule
  distinguishes that hyphen from `task-list`'s. A derivation alone would have shipped a
  regression named in the spec.

**What we learned**

The claim that the derivation costs nothing was false, and the cost is worth stating
precisely rather than arguing away. **Adding a section type touches `packages/contracts` only
when its display name is not derivable.** `ai-summary` (Slice 24) would be the second such
entry. That is smaller than `SECTION_OWNERSHIP`'s unconditional cost for containers, and
larger than nothing. `registry.spec.ts` asserts `definition.displayName === displayNameOf(type)`
for every registered type, so the cost is paid at the moment it is incurred rather than
discovered later in a dialog.

Naming alone did not close the friction note. `nameOf` renders every *untitled* Task List as
`Task List`, and the user who has not named anything is exactly the user the note describes —
so the reassign select disambiguates equal **resolved** names (an explicit `Task List`
collides with an untitled one just as two untitled ones do) by absolute canvas position:
`Task List (position 4 on the canvas)`. A cardinal, not an ordinal: `4th` needs suffix logic
with the 11/12/13 exception, which is a rule to get wrong for a label nobody reads twice.

The domain's refusal sentence turned out to be doing harm rather than nothing. It answers an
**agent** — it names an id, says `1 tasks`, and explains the policy vocabulary — while the
buttons underneath already said it properly. `DomainRuleError` now carries an optional
`details` record, the non-empty refusal fills it with a discriminated
`{ reason: 'section_not_empty', liveRowCount }`, and the canvas opens its dialog **only** when
that payload parses. Anything else — missing, malformed, zero-valued or differently
discriminated — surfaces as an ordinary error. That is what stops a future 409 (the archive
phase adds two) from masquerading as a removal-policy question. The sentence stays for MCP
and `curl` callers, who have no UI to compose one.

Renaming is deliberately **not** optimistic. `ProjectPageStore.updateSection` awaits the
gateway and then patches, which is how `setCollapsed`, `setColumnSpan` and `updateConfig` all
behave; §63 asks for optimism on *important interactions*, and a name committed on blur
against a local host is not one. Buying it here would have meant either a bespoke path for
rename or silently changing the other three section writes. The control resets to the
persisted value on commit, because an Angular property binding does not write to the DOM when
the bound expression is unchanged — without that, committing whitespace on an untitled
section left three spaces in a field beside a header reading `Task List`.

Two things this changes that nobody will see. The activity `summary` now names the section
rather than its type, and the feed renders none of it — it composes its line from the entry's
parts (`2026-08-activity-summary-ownership.md`), and section events target the *project*
anyway. `summary` is the hand-read log line in `data.json` that §14 expects people to open,
and it freezes at write time, so renaming a section later does not rewrite its history.

**Current decision**

`title` remains an **optional override**; the default is derived at read time. `nameOf` in
`packages/contracts/src/section.ts` is the single expression every surface uses — the frame
header, the removal dialog, the Rich Text aria-label, and `SectionService`'s activity
summaries. `SECTION_DISPLAY_NAMES` holds the one name the derivation cannot produce.

The control is a **Name field at the top of the frame's inspector**, present for every
registered type, placeholder-driven so an empty field clears the override. §32 gates the
inspector behind Edit Layout Mode with every other layout affordance; an always-editable
header title would put a text input where View Mode wants clean chrome. Adding it made
`This section has no settings.` unreachable, so that branch is gone.

Typing the default as a literal is accepted rather than prevented. Normalising
`next === displayNameOf(type)` to `null` would stop the drift the first paragraph warns
about, and would also mean a person who deliberately names one of three lists `Task List`
cannot. The field is placeholder-driven, so the case is rare and self-inflicted.

**Duplicate names remain legal.** Forcing a name at creation would put a modal in front of
Quick add, which §26's quick-add exists to avoid; the disambiguation is presentational and
appears only in the one place it is needed.

One shared `SectionTitleSchema` (`z.string().trim().min(1)`) normalises every write — a
person's, HTTP's, and both MCP section tools' — and `SectionService` normalises again for
direct callers, since the domain package is a public API a caller can reach without a runtime
input schema. `ProjectSectionSchema.title` is deliberately **not** tightened: doing so would
reject a hand-edited document that parsed before this phase, which is a `SCHEMA_VERSION`
change this phase does not make. `nameOf` is the compatibility boundary; every new write is
strict.

**Confidence**

High that the default belongs at read time — the stored-literal failure mode is concrete.
High for the derivation plus overrides, now that a registry test keeps the two in step.
Medium for the positional disambiguator, which is the first thing to re-examine if people
start naming sections routinely and never see it. Medium for rename-in-the-inspector: it is
two clicks deep, and the same objection `note-2026-08-31-002` makes about the project More
menu applies here.

**Amended, 2026-09-04.** Archived (`2026-09-what-undo-means-for-an-archived-row.md`) is a
fifth `nameOf` consumer, and the first one that names a section which is no longer on the
canvas. The optional-title compatibility rule matters more there than anywhere else: an
archived section's stored `title` is whatever it had when it was removed, padding and blanks
included, and it has no frame left to fall back through.

The region **owns its own collision suffix** — `archive 1`, `archive 2` in its own sorted
order — rather than reusing the dialog's `(position N on the canvas)`. The two are answering
different questions: the dialog identifies a *live canvas target*, while an archived section
keeps a deliberately stale position and is being identified inside an already-sorted list.
Sharing `nameOf` and not sharing the suffix is the split that keeps both honest.

**Revisit when**

`list_sections` wants a denormalized resolved name. It does not get one now — it would mean
either denormalising a `name` into the tool output or having agents derive it, and an agent
deriving it today would produce `Sub Projects`, which is wrong. Or when a second type earns
an entry in `SECTION_DISPLAY_NAMES` (`ai-summary`, Slice 24), which is the first test of
whether the escape hatch stays a hatch. Or when §56's tool-shape experiments want a
`rename_section` tool distinct from `update_section` (Slice 24).
