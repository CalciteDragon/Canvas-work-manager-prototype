# Implementation plan — a section has a name

Follow-up to `docs/plans/2026-09-section-ownership-implementation.md`, from the friction that
phase's browser pass recorded (`.prototype/notes.json`, `note-2026-09-01-001`). That phase made
two Task Lists on one canvas a normal thing to have; this one makes them tellable apart.

**Goal.** Every section has one name — set by a person or an agent, defaulted the same way
everywhere — and every surface that refers to a section uses it.

**Spec sections.** §29 (the section registry), §30 (adding a section type touches one place),
§31 (the section frame's affordances), §32 (Edit Layout Mode gates layout chrome), §55 (tool
definitions), §63 (optimistic writes), §78 (the decision log format).

**Not in scope.** Renaming section *types*, milestones, and anything about archived rows, which
is the sibling plan `2026-09-archive-restore-implementation.md`.

---

## Step 0 — Three facts that change the obvious approach

**The write path already ships end to end; only the control is missing.**
`UpdateSectionInputSchema.title` exists and is nullable-optional so clearing falls back
(`packages/contracts/src/inputs.ts:97`); `SectionService.update` (whose `apply` deletes the key
on `null`, `section-service.ts:47-51`), `PATCH /api/sections/:id` (`routes.ts:183`),
`SectionGateway.update` (`work-manager-gateway.ts:101`) and the `update_section` MCP tool
(`tools/sections.ts:36-43`) all carry it. Storybook exercises titled frames in five stories. So
today **an agent can name a section and a person cannot** — which is the wrong way round for a
control that lives on the frame. No route and no tool changes; this phase is mostly *reaching*
an existing capability.

> Resist widening it. The only new persistence is nothing at all.

**There are four different answers to "what is this section called", and they disagree.**

| Surface | Expression | Says, for an untitled Task List |
|---|---|---|
| Frame header (`project-section-frame.ts:56`) | `title ?? definition.displayName` | Task List |
| Removal dialog (`section-removal-dialog.html:18`) | `title ?? type` | task-list |
| Activity summary (`section-service.ts:388`) | `title ?? type` | Removed the task-list section |
| Rich Text aria-label (`rich-text-section.html:10`) | `title ?? 'this section'` | Notes for this section |

The frame is right and the rest are not, but they are not wrong by carelessness: `displayName`
lives in `SECTION_REGISTRY` in the web app, and neither the domain nor a non-web caller can
reach it. The default name has to move below both, exactly as `kind` did last phase.

**The default is mostly derivable, and one type proves it needs an escape hatch.** Six of the
seven registered display names are the title-cased kebab type. `sub-projects` is not:
`registry.ts:68` says `Sub-Projects`, and a split-on-hyphen derivation yields `Sub Projects`.
The registry is right and the derivation is wrong — the specification spells it `Sub-Projects`
(spec line 1109), so this is not a typo to tidy away, and no rule distinguishes the hyphen in
`sub-projects` from the one in `task-list`.

> So: **a derivation, plus an overrides table that starts with exactly one entry**, guarded by a
> registry test that keeps the two in step.

This is a real §30 cost and the plan states it rather than arguing it away. Adding a section
type touches the contracts file **only when its display name is not derivable** — `ai-summary`
(Slice 24) would be the second such entry. That is smaller than `SECTION_OWNERSHIP`'s
unconditional cost for containers, and larger than the nothing an earlier draft of this plan
claimed. The registry test is what makes the cost visible at the moment it is incurred rather
than discovered later in a dialog.

---

## Step 1 — Contracts: one default name

`packages/contracts/src/section.ts`, beside `SECTION_OWNERSHIP`:

```ts
/**
 * Display names that the derivation below cannot produce. One entry today: the spec spells
 * sub-projects with a hyphen, and nothing distinguishes that hyphen from `task-list`'s.
 * `registry.spec.ts` fails when a registered name and this pair disagree, so the table grows
 * exactly when a new type earns an entry and never silently.
 */
export const SECTION_DISPLAY_NAMES: Record<string, string> = { 'sub-projects': 'Sub-Projects' };

/** The name a section carries when it has no `title` override. */
export const displayNameOf = (type: string): string =>
  SECTION_DISPLAY_NAMES[type] ??
  type.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

/** A section's name for prose: its override, else the derived default. */
export const nameOf = (section: Pick<ProjectSection, 'type' | 'title'>): string =>
  section.title ?? displayNameOf(section.type);

/** What a refusal to remove a non-empty container carries beyond its sentence — see Step 6. */
export const RemovalRefusalDetailsSchema = z.object({ liveRowCount: z.number().int().nonnegative() });
export type RemovalRefusalDetails = z.infer<typeof RemovalRefusalDetailsSchema>;
```

`nameOf` is the single expression every surface uses. Four call sites currently disagree; after
this there is one thing to be wrong.

**Verify:** `pnpm --filter @cwm/contracts test`.

---

## Step 2 — Domain: activity says the name

`packages/domain/src/section-service.ts:388` — `record` composes
`` `${verb} the ${section.title ?? section.type} section` ``. Replace with `nameOf(section)`.

This is the only domain use. `requireContainer` and `settleRows` raise with ids on purpose:
those messages answer an **agent**, which holds ids and not names, matching
`EntityNotFoundError`'s existing rule that a message names what the caller gave it. Leave them —
Step 5 is how the *person* stops seeing them.

**Verify:** `pnpm --filter @cwm/domain test`.

---

## Step 3 — Web: every surface reads the same name

- `registry.spec.ts` gains the guard:

  ```ts
  it('keeps every display name in step with the contracts default', () => {
    for (const definition of SECTION_REGISTRY)
      expect(definition.displayName).toBe(displayNameOf(definition.type));
  });
  ```

  `SECTION_REGISTRY` keeps `displayName` as an explicit field — it is what a designer edits and
  what the Quick add menu renders (`project-page.html:108`). The test is the single source, not
  a second definition.

- `project-section-frame.ts:56` → `nameOf(this.section())`. **The Sub-Projects header must still
  read `Sub-Projects` after this change** — that is the regression the overrides table exists to
  prevent, and it is worth an explicit assertion rather than trusting the guard above.
- `rich-text-section.html:10` → `nameOf(section())`, replacing `'this section'`.

**Verify:** `pnpm --filter web test`.

---

## Step 4 — Web: the frame can rename

`project-section-frame.html` — a name field at the **top of the inspector region**, above
`definition().inspectorComponent`, present for every type:

```html
<label class="section-frame__name">
  <span>Name</span>
  <input
    data-section-name
    type="text"
    [value]="section().title ?? ''"
    [attr.placeholder]="definition().displayName"
    [attr.aria-label]="'Name of ' + title()"
    (change)="rename($any($event.target).value)"
  />
</label>
```

Four things this settles deliberately:

- **The placeholder is the default, and an empty field clears the override.** `title` is
  nullable-optional precisely so clearing falls back rather than storing the default as a
  literal — a stored `"Task List"` would silently stop tracking the registry.
- **A whitespace-only name clears too.** `UpdateSectionInputSchema.title` is
  `z.string().min(1)…`, so `"   "` is currently accepted and stored, and a section named three
  spaces is a section with no visible name. `rename` trims and maps empty to `null`.
- **It lives in the inspector, not the header.** §32 gates the inspector behind Edit Layout Mode
  with every other layout affordance, and an always-editable header title would put a text input
  where View Mode wants clean chrome (`2026-08-view-mode-section-chrome.md`).
- **`This section has no settings.` stops being reachable.** Every section now has at least a
  name, so that branch is dead — delete `project-section-frame.html:83` *and*
  `project-section-frame.spec.ts:186`, rather than leaving prose that is no longer true.

`project-section-frame.ts` — a `renamed` output emitted with `string | null`. The frame stays
**chrome only**: it emits intent, it does not touch a gateway, matching `resized` and
`collapseToggled` beside it.

`project-page.html` / `project-page.ts` — wire `(renamed)`.
`project-page-store.ts` — `renameSection(id, title)` delegating to the existing private
`updateSection(id, { title })`, which already patches the array in place. Optimistic per §63.

**Verify:** `pnpm --filter web test`.

---

## Step 5 — Web: the removal dialog asks a human question

Today the dialog renders the domain's sentence as its body (`{{ prompt().message }}`) and its
target options as `title ?? type`. Both become UI-composed prose:

```
Remove “Backlog”?
It still holds 3 tasks. What should happen to them?
[ Move them to ▾ Shipped ]
[ Keep the section ]  [ Move the rows and remove ]  [ Archive the rows and remove ]
```

`SectionRemovalPrompt` (`project-page-store.ts:30`) stops carrying `message: string` and carries
what the UI needs to write its own: `sectionName: string`, `rowCount: number`,
`ownedKind: OwnedDataKind`, `targets: ProjectSection[]`. Pluralisation is the UI's — `1 task`,
not the domain's `1 tasks`.

**Untitled duplicates must still be distinguishable.** `nameOf` renders every untitled Task List
as `Task List`, so naming alone does not close the friction note: the user who has not named
anything is exactly the user the note describes. When two or more offered targets resolve to the
same name, the select appends canvas position — `Task List (2nd on the canvas)` — computed in
the dialog from `ProjectSection.position`, which `targets` already carries. Sections keep no
uniqueness rule; the disambiguation is presentational and appears only where it is needed.

**Changed by this step, all of which must be in the change list:**
`section-removal-dialog.{ts,html,spec.ts}`, `project-page-store.ts`, `project-page.ts`,
`project-page.html`, and **`project-page.spec.ts:263`**, which currently asserts the dialog body
contains `still holds 2 tasks` and will fail the moment `message` is removed.

**Verify:** `pnpm --filter web test`.

---

## Step 6 — A refusal that carries its count

`ProjectPageStore` cannot count the rows itself: it holds none. Its own class comment (line 39)
records why — "It no longer composes `TaskListStore`: a Task List section owns its rows and
provides its own store" — and that separation is the ownership phase's deliberate result. The
rows live in the section-scoped store, which the page does not reach into.

So the page can only state a count if it is told one:

- `packages/domain/src/errors.ts` — `DomainRuleError` gains
  `readonly details?: Readonly<Record<string, unknown>>` as an optional second constructor
  argument. Every existing call site is unchanged.
- `section-service.ts:301` — the refusal passes `{ liveRowCount: live.length }`. The sentence
  stays, for MCP and `curl` callers who have no UI to compose one. `ownedKind` is deliberately
  **not** sent: the store has the section and `ownedKindOf` is already exported from contracts,
  so shipping it would duplicate a derivation contracts owns.
- `apps/prototype-host/api/errors.ts:46` — the 409 envelope forwards `details` when present.
- `apps/web/src/app/core/gateway/gateway-error.ts` — `GatewayError` gains `details`, populated in
  `toGatewayError` from the same envelope.
- `project-page-store.ts:445` — parses it with `RemovalRefusalDetailsSchema`. **On a parse
  failure the dialog drops the count and asks the countless question** — `It still holds tasks.
  What should happen to them?` — rather than inventing a number. There is no local count to fall
  back to, per the paragraph above.

One optional field on an envelope that already exists (`{ error, message }`), not a new error
taxonomy. §71's "deliberately disposable" host stays disposable.

**Verify:** `pnpm --filter @cwm/domain test`, `pnpm --filter @cwm/prototype-host test`,
`pnpm --filter web test`.

---

## Step 7 — Docs

- `docs/decisions/2026-09-a-section-has-a-name.md` — the §78 entry.
- `docs/decisions/2026-09-sections-own-their-data.md` — one line under *What we learned*: the
  §30 cost recorded there for ownership is now joined by a smaller, conditional one for names.
- `docs/mcp-setup.md` — `update_section` takes `title`; an agent naming the sections it creates
  is the difference between a legible canvas and seven identical frames.
- `development.md` — a second unnumbered-phase entry.

---

## Acceptance check

Against `pnpm prototype:reset` (`personal-workspace`) with the host restarted:

1. Edit layout → Settings on the Task List → **Name** → type `Backlog`, then leave the field
   (the binding is `(change)`, so it commits on blur or Enter, not per keystroke). The header
   reads `Backlog`, and `.prototype/data.json` has `"title": "Backlog"` on that section.
2. Clear the field and leave it. The header returns to `Task List`, and `title` is **absent**
   from the record — not the string `"Task List"`. Repeat with three spaces: same result.
3. Confirm a Sub-Projects section's header still reads `Sub-Projects`, not `Sub Projects`.
4. Quick add a second Task List, name it `Shipped`, drag a task into it.
5. Remove `Backlog` while it holds rows. The dialog reads `Remove “Backlog”?` /
   `It still holds 2 tasks. What should happen to them?`, its select offers `Shipped` by name,
   and **no section id appears anywhere in it**.
6. Add a *third*, unnamed Task List and repeat. The select distinguishes the two untitled
   candidates by canvas position.
7. Move the rows and confirm the activity feed reads `Removed the Backlog section`.
8. Remove a Progress section and confirm it still goes without a dialog.
9. Over MCP: `update_section` with a `title`, and the frame shows it after §62's event arrives.
10. `pnpm test`, `pnpm lint`, `pnpm build`.

Items 5 and 6 are the acceptance checks that matter: together they are the friction note,
resolved. Item 3 is the regression the overrides table exists to prevent.

---

## Test plan — written first

House convention: `.test.ts` in `packages/*`, `.spec.ts` in `apps/web`.

| Test | Proves |
|---|---|
| `contracts/section.test.ts` — `displayNameOf` over all seven types, including `sub-projects` | The derivation *and* its one override |
| `contracts/section.test.ts` — `nameOf` prefers `title`, falls back on `undefined` | One expression, both branches |
| `web/registry.spec.ts` — every `displayName` equals `displayNameOf(type)` | Registry and contracts cannot drift; the next non-derivable type fails here, at the moment it is added |
| `web/project-section-frame.spec.ts` — an untitled `sub-projects` frame renders `Sub-Projects` | The regression the override exists to prevent |
| `domain/section-service.test.ts` — removal activity of an untitled section reads `the Task List section` | Living prose is not a raw type (`2026-08-activity-summary-ownership.md`) |
| `domain/section-service.test.ts` — a refusal carries `liveRowCount` matching the live rows, with an archived row present | The count is live-only, and travels as data |
| `host/routes.test.ts` — the 409 envelope carries `details.liveRowCount` | The seam that lets the UI stop parsing sentences |
| `web/project-section-frame.spec.ts` — typing a name emits `renamed`; blank and whitespace emit `null` | Chrome-only, and clearing means fall back |
| `web/project-section-frame.spec.ts` — `[data-section-no-settings]` is **absent** for a type with no inspector component | The dead branch is really dead — asserting the name field exists proves nothing |
| `web/project-page-store.spec.ts` — `renameSection` paints before the gateway resolves and reverts on failure | §63 |
| `web/section-removal-dialog.spec.ts` — renders `1 task` for one and `2 tasks` for two | The `1 tasks` defect, pinned |
| `web/section-removal-dialog.spec.ts` — no rendered text matches `/section-[0-9a-f]/` (unanchored) | The id leak cannot come back. Anchoring at `^` would pass with the id mid-sentence |
| `web/section-removal-dialog.spec.ts` — two **untitled** same-type targets render distinguishable options | The friction note's second half. Titled fixtures would test the case that was never broken |
| `web/section-removal-dialog.spec.ts` — malformed `details` renders the countless question, not `NaN` | The only failure path this phase introduces |

Mutation-check the last four and the registry guard: delete the line each covers and watch it
fail. The registry guard passes trivially against a wrong derivation if written over one type.

---

## Boundaries touched (§1, §8, §12, §70)

- **Contracts defined once.** `displayNameOf`, `nameOf` and `RemovalRefusalDetailsSchema` live
  only in `packages/contracts`. The registry keeps `displayName` as data and is *tested* against
  the default rather than importing it as its value.
- **Domain knows nothing about the web.** Step 2 works off the `type` string the domain already
  holds. `SECTION_REGISTRY` is not imported into `packages/domain`, and must not be.
- **The frame emits intent.** `renamed` is an output; the store calls the gateway.
- **Step 6 crosses domain → host → gateway and is not a violation.** `DomainRuleError.details` is
  a plain record — the domain gains no HTTP, MCP or JSON knowledge; `api/errors.ts` is already
  the single translation point; `GatewayError` remains the only failure type the UI sees and the
  store still branches on `code`
  (`2026-08-gateway-surface-grows-with-implementations.md`). Giving the payload a Zod schema in
  contracts is what keeps it from becoming a shape three packages agree on by convention.

---

## Explicit non-goals

- **No rename from the section header.** §32 keeps layout affordances inside Edit Layout Mode.
- **No uniqueness rule on names.** Two sections may share one. Step 5 disambiguates where it
  matters — in the reassign select — rather than constraining the data.
- **No override map beyond the one entry `sub-projects` earns.** The registry test is what makes
  the next one appear.
- **No new MCP tool.** `update_section` already does this; a `rename_section` shape experiment is
  §56 work, which `development.md` puts in Slice 24.
- **No name on milestones, projects or tasks.** They have names already.
- **Nothing about archived rows.** Sibling plan.

---

## Open questions

**1. Should `title` become required, defaulted at creation?** Recommended **no**. A stored default
stops tracking the registry, so renaming a display name would leave every existing section on the
old one. Keep the override optional and derive at read time. This is the decision entry's
interesting half.

**2. Does `list_sections` return the resolved name to agents?** Recommended **not in this phase**.
It would mean denormalising a `name` into the tool output or having agents derive it — and an
agent deriving it today would produce `Sub Projects`, which is wrong. Note it under *Revisit
when*.

**3. Is the positional disambiguator (Step 5) the right shape, or should untitled duplicates be
prevented instead?** Recommended **disambiguate, do not prevent**: forcing a name at creation
would put a modal in front of Quick add, which §26's quick-add exists to avoid. Worth recording,
because it is the question the friction note actually asks.

None of the three blocks Step 1. Question 3 must be settled before Step 5.

---

## Decision entry this phase must write

`docs/decisions/2026-09-a-section-has-a-name.md`, in §78 format. The question is *what is a
section called, and who decides*. Its interesting content is Open question 1 (why the default is
derived at read time rather than stored), Open question 3, and the §30 accounting: ownership cost
containers an unconditional entry in the contracts map, names cost one only for a type whose name
is not derivable — with `sub-projects` as the worked example that proves the escape hatch is
needed rather than hypothetical.

---

## Commit sequence

One per step; Steps 1–3 land together to keep the tree green.

```
contracts: a section's name, derived where it can be
domain: activity says the section's name, not its type
web: one name expression, four call sites
web: the frame can rename a section
web: the removal dialog asks about a named section
domain+host+web: a refusal carries its row count as data
docs: what a section is called, and who decides
```

---

## Revisions

Round 1, against a cold-start reviewer briefed with the plan, the spec §N list and AGENTS.md §1.
It returned four blocking findings and nine minor ones; all were checked against the code before
acting, and all held.

1. **The derivation did not work.** The plan's central claim — that all seven display names are
   the title-cased type — was false: `sub-projects` derives to `Sub Projects` against a registry
   (and spec, line 1109) that says `Sub-Projects`. The "derivation costs nothing, so §30 survives
   intact" argument went with it. Step 0 now states the real, conditional cost and Step 1 carries
   a one-entry overrides table. This was the finding worth the review on its own.
2. **Step 6's justification was false.** The plan rejected a client-side count because it would
   "disagree with `settleRows` the moment an archived row exists". It would not:
   `json-repositories.ts:110` implements `includeArchived` with the same predicate `settleRows`
   uses, and `TaskQuery` already carries `sectionId`. The recommendation survived on a better
   argument the reviewer's own next finding supplied — `ProjectPageStore` holds no rows by
   design, so the page can only state a count if it is told one.
3. **Step 6's compatibility fallback was unimplementable** for the same reason: it fell back to
   "the section's own local live-row count", which that store does not have. Replaced with
   degrading to a countless question.
4. **The plan did not close the friction note's second half.** `nameOf` leaves every *untitled*
   duplicate reading `Task List`, and a non-goal asserted the select "shows position order
   anyway" — it does not; it renders `title ?? type` and nothing else. Step 5 now adds a
   positional disambiguator, Open question 3 records the choice, and the corresponding test was
   changed to use untitled fixtures, having previously tested the case that was never broken.
5. Smaller corrections: a fourth disagreeing name surface (`rich-text-section.html:10`);
   `project-page.spec.ts:263` missing from the change list; `.test.ts` versus `.spec.ts` naming;
   two tests that would have passed trivially (`no-settings` presence, and an `^`-anchored id
   regex); an acceptance step that assumed per-keystroke binding; a §62 latency budget the spec
   does not state; a missing **Spec sections** list, which AGENTS.md §3 requires; a §78 citation
   that should have named `2026-08-activity-summary-ownership.md`; a redundant `ownedKind` in the
   wire payload; and whitespace-only names, which the schema accepts today.

The reviewer also confirmed, against the code, that every line-number citation was correct, that
the write path really does ship end to end, that no UI can set a title today, that the
`no settings` branch really does become unreachable, that the §32 argument for the inspector
holds, and that **Step 6 is not a boundary violation** — the objections to it were cost and
feasibility, both now addressed.
