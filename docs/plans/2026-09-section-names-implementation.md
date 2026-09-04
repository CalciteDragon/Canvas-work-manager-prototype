# Implementation plan — a section has a name

Follow-up to `docs/plans/2026-09-section-ownership-implementation.md`, from the friction that
phase's browser pass recorded (`.prototype/notes.json`, `note-2026-09-01-001`). That phase made
two Task Lists on one canvas a normal thing to have; this one makes them tellable apart.

**Goal.** Every section has one name — set by a person or an agent, defaulted the same way
everywhere — and every surface that refers to a section uses it.

**Spec sections.** §14 (the data file is read by hand), §26 (Quick add avoids a modal), §29 (the
section registry), §30 (adding a section type needs *minimal changes outside its own feature
folder* — the spec's words, at line 1126), §31 (the section frame's affordances), §32 (Edit
Layout Mode gates layout chrome), §63 (optimistic writes), §71 (the host is deliberately
disposable), §78 (the decision log format).

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

> Resist widening it. The only new persistence is nothing at all — `title` was already
> optional, so `SCHEMA_VERSION` (`contracts/src/document.ts:18`) does not move and no data
> file is invalidated. The sibling plan's closing lesson is that a bump invalidates *every*
> data file, not only `.prototype/data.json`; this phase does not go near it.

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

/**
 * The name a section carries when it has no `title` override.
 *
 * `Object.hasOwn`, not `??` — for the reason stated twenty lines above at `section.ts:52`:
 * `SECTION_DISPLAY_NAMES['constructor']` is `Object`, not `undefined`, so `??` would never
 * fire and this function would return a *function* from a signature declaring `: string`,
 * with the `Record<string, string>` index signature hiding it from the compiler. `type` is
 * an open `z.string().min(1)` (`inputs.ts:88`) that `create_section` exposes to agents and
 * that `data.json` can be hand-edited to hold, so this is reachable rather than theoretical.
 */
export const displayNameOf = (type: string): string =>
  Object.hasOwn(SECTION_DISPLAY_NAMES, type)
    ? SECTION_DISPLAY_NAMES[type]
    : type.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

/** A stored or incoming override, normalised without making legacy blank data fatal. */
export const normaliseSectionTitle = (title: string | null | undefined): string | undefined => {
  const normalised = title?.trim();
  return normalised === undefined || normalised === '' ? undefined : normalised;
};

/** A section's name for prose: its normalised override, else the derived default. */
export const nameOf = (section: Pick<ProjectSection, 'type' | 'title'>): string => {
  return normaliseSectionTitle(section.title) ?? displayNameOf(section.type);
};

/** The only 409 that the canvas may turn into a removal-policy question — see Step 6. */
export const SectionRemovalRefusalDetailsSchema = z.object({
  reason: z.literal('section_not_empty'),
  liveRowCount: z.number().int().positive(),
});
export type SectionRemovalRefusalDetails = z.infer<typeof SectionRemovalRefusalDetailsSchema>;
```

`nameOf` is the single expression every surface uses. Four call sites currently disagree; after
this there is one thing to be wrong. Trimming here is defensive compatibility for a hand-edited
old data file: it does **not** make a blank override valid state, but it keeps such a record visibly
named without invalidating the whole document.

`packages/contracts/src/inputs.ts` reuses one `SectionTitleSchema = z.string().trim().min(1)` for
`CreateSectionInputSchema.title` and the non-null branch of `UpdateSectionInputSchema.title`.
That makes HTTP, MCP and the web adapter store the same normalised override. Do **not** tighten
`ProjectSectionSchema.title` in this phase: doing so would reject a previously parseable hand-edited
document and falsify the no-version-bump claim. `nameOf` is the compatibility boundary; every new
write is strict.

`SectionService.addWithin` and `update` also call `normaliseSectionTitle` before persistence.
Runtime schemas guard HTTP/MCP, but domain services are public package APIs and tests or future
callers can invoke them with a structurally typed string. On create, blank becomes absent; on
update, blank has the same meaning as `null` and clears the override. This is normalization at the
domain boundary, not a second name definition.

**Verify:** `pnpm --filter @cwm/contracts test`.

---

## Step 2 — Domain: activity says the name

`packages/domain/src/section-service.ts:388` — `record` composes
`` `${verb} the ${section.title ?? section.type} section` ``. Replace with `nameOf(section)`.

**A second domain site becomes stale in the same change.** `activity-service.ts:193-197`
returns `undefined` for a section's activity title under a comment that says why:

> A section has no title of its own — §31's frame heads it from the *registry's* display
> name, which is a UI concern the domain has no business guessing.

Step 1 falsifies both halves — the default is no longer registry-only, and the domain now
*can* name a section. **Keep the `undefined` and rewrite the comment** to its true reason:
section events target the project (`section-service.ts:377-389`,
`2026-08-section-activity-targets-the-project.md`), so this branch is reached only by
hand-written fixtures and is not worth a repository read to resolve. Resolving it is a
different phase's work; leaving the old comment is a defect under AGENTS.md §2 rule 1.

`requireContainer` and `settleRows` raise with ids on purpose:
those messages answer an **agent**, which holds ids and not names, matching
`EntityNotFoundError`'s existing rule that a message names what the caller gave it. Leave them —
Step 5 is how the *person* stops seeing them.

**This change is invisible in the app, and that is fine.** The activity feed *composes* its
line from the entry's parts and never renders the stored `summary`
(`activity-feed.ts:26-29`, `2026-08-activity-summary-ownership.md`: "Nothing in `apps/web`
reads it"). `summary` is the hand-read log line in `data.json`, which §14 expects people to
open. So Step 2 improves that file and changes no pixel — and because `summary` freezes at
write time, renaming a section later does not rewrite history. Both facts belong in the
decision entry rather than being rediscovered as bugs.

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
    [value]="section().title?.trim() ?? ''"
    [attr.placeholder]="definition().displayName"
    [attr.aria-label]="'Name of ' + name()"
    (change)="rename($any($event.target))"
  />
</label>
```

`rename` takes the **element**, not its value, because it must reset the control to persisted state
while the non-optimistic write is pending:

```ts
rename(input: HTMLInputElement): void {
  const trimmed = input.value.trim();
  const next = trimmed === '' ? null : trimmed;
  // Rename is deliberately non-optimistic. Keep the control on the persisted value until the
  // gateway answer changes `section`; otherwise a rejection leaves an unpersisted DOM value.
  input.value = this.section().title?.trim() ?? '';
  this.renamed.emit({ id: this.section().id, title: next });
}
```

The assignment serves both success and failure. An Angular property binding writes to the DOM
only when the bound *expression* changes. On an already-untitled section, whitespace normalises
to `null` but the expression remains `''`; on a rejected rename, the persisted expression also
does not change. Resetting to the persisted override immediately leaves the field empty/unchanged
while the request is pending; a successful gateway answer then changes `section` and paints the
new value. The control and header therefore never claim an unpersisted name.

Five things this settles deliberately:

- **The placeholder is the default, and an empty field clears the override.** `title` is
  nullable-optional precisely so clearing falls back rather than storing the default as a
  literal — a stored `"Task List"` would silently stop tracking the registry.
- **Typing the default as a literal is accepted, deliberately.** Nothing stops someone typing
  `Task List` into the field and storing it, which is the drift the first bullet warns about.
  Normalising `next === displayNameOf(type)` to `null` would prevent it — and would also mean a
  person who deliberately names one of three lists `Task List` cannot. The field is
  placeholder-driven, so the case is rare and self-inflicted; it is not worth a rule that
  second-guesses a typed name. Recorded rather than silently allowed.
- **A whitespace-only name clears in the UI and is rejected on create/update from other callers.**
  The shared `SectionTitleSchema` trims every wire input; its update branch still accepts `null`
  as the explicit clear. `nameOf` defensively falls back for old hand-edited blank overrides.
- **It lives in the inspector, not the header.** §32 gates the inspector behind Edit Layout Mode
  with every other layout affordance, and an always-editable header title would put a text input
  where View Mode wants clean chrome (`2026-08-view-mode-section-chrome.md`).
- **"Present for every type" means every *registered* type.** An unregistered `type` renders
  through the `data-unknown-section` fallback (`project-page.html:185-210`), outside the frame
  entirely, and so has no name field and cannot be renamed. Its raw `“{{ section.type }}”`
  prose at `:199` stays as it is: that surface is a diagnostic, and showing the derived name
  there would hide the thing it exists to report.
- **`This section has no settings.` stops being reachable.** Every registered section now has
  at least a name, so that branch is dead — delete `project-section-frame.html:83`. In the spec,
  `:186` **flips** rather than being deleted: `.not.toBeNull()` becomes `.toBeNull()`, and the
  enclosing test at `:182` — "renders the definition's inspector when it has one, **and says so
  when it does not**" — is renamed, because deleting one assertion would leave a lying name and
  a `withoutInspector` render asserting nothing.

`project-section-frame.ts` — a `renamed` output emitted with `{ id: SectionId; title: string | null }`,
matching `collapseToggled`, `resized` and `configChanged` (`project-section-frame.ts:46-50`),
which all carry the id. The frame stays **chrome only**: it emits intent, it does not touch a
gateway.

`title()` (`project-section-frame.ts:56`) is renamed to `name()`. After Step 3 it holds the
*resolved* name while `section().title` is the override, and the frame now edits the second
beside the first; two things called `title` meaning different things, in one component, is a
week-old confusion waiting to happen. Call sites: `project-section-frame.html:21, 29, 39, 52,
60, 69` plus the new markup.

`project-page.html` / `project-page.ts` — wire `(renamed)`.
`project-page-store.ts` — `renameSection(id, title)` delegating to the existing private
`updateSection(id, { title })`.

**Rename is not optimistic, deliberately.** `updateSection` (`project-page-store.ts:550-561`)
awaits the gateway and *then* patches the array; on failure `mutate` parks a message in
`sectionErrorState` and the array is untouched. That is how `setCollapsed`, `setColumnSpan`
and `updateConfig` all behave, and rename joining them is one code path rather than a fourth
idiom. The store's optimistic route is `writeProject` (`:515-548`), which takes a `paint`
callback and restores `before` in a catch — the shape `rename` at `:477` uses. §63 asks for
optimism on *important interactions*; a name committed on blur, against a local host, is not
one, and buying it here would mean either a bespoke path for rename or silently changing the
other three section writes. If a later phase wants it, that is the decision to make then.

**Verify:** `pnpm --filter web test`.

---

## Step 5 — Web: the removal dialog asks a human question

Today the dialog renders the domain's sentence as its body (`{{ prompt().message }}`) and its
target options as `title ?? type`. Both become UI-composed prose:

```
Remove “Backlog”?
It still holds 3 tasks. What should happen to them?
[ Move them to ▾ Shipped ]
[ Keep the section ]  [ Move the tasks and remove ]  [ Archive the tasks and remove ]
```

**The two action labels change again when the sibling plan lands** — see *Sequencing*. They
say `tasks`/`reflections` rather than `rows` because the person is looking at tasks; the
words above are the ones that are true the day this phase ships.

`SectionRemovalPrompt` (`project-page-store.ts:30`) stops carrying `message: string` and carries
what the UI needs to write its own: `sectionName: string`, `rowCount: number`,
`ownedKind: OwnedDataKind`, `targets: ProjectSection[]`. Pluralisation is the UI's — `1 task`,
not the domain's `1 tasks`.

Two shapes to get right rather than discover:

- `ownedKindOf` returns `OwnedDataKind | undefined` (`section.ts:57-58`). Only containers
  refuse, so the prompt is only ever built for one — but the store must narrow explicitly
  rather than cast, and the narrowing failing is a bug worth an early throw.
- `OwnedDataKind`'s values are **already plural**: `'tasks' | 'reflections'` (`section.ts:32`).
  So the UI *singularises* rather than adding an `s`. Use a two-entry lookup, not a string
  operation — **not** because a strip gets the wrong answer (it does not: `'tasks'` and
  `'reflections'` both singularise correctly by dropping the final `s`) but because a lookup
  stops compiling when `OwnedDataKind` gains a member, which is the same reason
  `containerTypeFor` (`section.ts:64-70`) derives from the map rather than restating it. Both
  values get a test, as plain pluralisation coverage.

**Untitled duplicates must still be distinguishable.** `nameOf` renders every untitled Task List
as `Task List`, so naming alone does not close the friction note: the user who has not named
anything is exactly the user the note describes. When two or more offered targets resolve to the
same name, the select appends canvas position — `Task List (position 4 on the canvas)` —
computed in the dialog as `position + 1`, which `targets` already carries. **A cardinal, not an
ordinal**: `4th` needs suffix logic with the 11/12/13 exception, which is a rule to get wrong and
to test for a label nobody reads twice. Sections keep no uniqueness
rule; the disambiguation is presentational and appears only where it is needed.

**`position + 1`, not the index within `targets`.** `position` is absolute across *all*
section types (`section.ts:84`) while `targets` is filtered to one type
(`project-page-store.ts:465-469`), so an index into `targets` is not a canvas position and
the label would lie. Both layout modes iterate `store.sections()` in `position` order
(`project-page.html:212`, sorted by `byPosition` at `project-page-store.ts:24`), so reading order tracks
`position` in flow and in grid alike. Stronger than the plan needs, in fact: there is **one**
`@for` serving both modes (`project-page.html:157`), differing only by CSS class and
`cdkDropListOrientation` (`:142-144`), and the grid sets no `grid-auto-flow: dense`
(`project-page.scss:179-182`), so DOM order is visual order.

**Changed by this step:** `section-removal-dialog.ts`, `section-removal-dialog.html`,
`project-page-store.ts`, `project-page.ts`, `project-page.html`, and
**`project-page.spec.ts:263`**, which currently asserts the dialog body contains
`still holds 2 tasks` and will fail the moment `message` is removed.

**`section-removal-dialog.spec.ts` does not exist** — the dialog is exercised today only
through `project-page.spec.ts:237-276`. Four rows of the test plan depend on it, so this step
creates the file *and* its render harness. Budget for that rather than discovering it.

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
- `section-service.ts:301` — the refusal passes
  `{ reason: 'section_not_empty', liveRowCount: live.length } satisfies SectionRemovalRefusalDetails`.
  The producer is therefore checked against the contracts type rather than agreeing with the web
  by convention. The sentence
  stays, for MCP and `curl` callers who have no UI to compose one. `ownedKind` is deliberately
  **not** sent: the store has the section and `ownedKindOf` is already exported from contracts,
  so shipping it would duplicate a derivation contracts owns. The narrowing failing is a bug
  worth an early throw — which lands inside `removeSection`'s catch (`project-page-store.ts:443-451`)
  and propagates through `mutate` into `sectionErrorState`. That is the right place for it, and it
  is the one new failure mode this phase adds. Malformed `details` are not a second special case:
  they stay on the existing ordinary-error path described below.
- `apps/prototype-host/api/errors.ts:46` — the 409 envelope forwards `details` when present.
- `apps/web/src/app/core/gateway/gateway-error.ts` — `GatewayError` gains `details: unknown`,
  populated in `toGatewayError` from the same envelope. The adapter preserves untrusted wire data;
  feature code owns validation.
- `project-page-store.ts:445` — opens the prompt **only** when
  `SectionRemovalRefusalDetailsSchema.safeParse(error.details)` succeeds. Missing, malformed,
  zero-valued or differently discriminated details are not safely identifiable as the question
  this dialog can answer, so the original `GatewayError` is rethrown and `mutate` puts its message
  in `sectionError`. This is also the handoff the archive phase relies on: its new
  already-archived and archived-target 409s must never masquerade as a non-empty-section prompt.

One optional field on an envelope that already exists (`{ error, message }`), not a new error
taxonomy. §71's "deliberately disposable" host stays disposable.

**Verify:** `pnpm --filter @cwm/domain test`, `pnpm --filter @cwm/prototype-host test`,
`pnpm --filter web test`.

---

## Step 7 — Docs

- `docs/decisions/2026-09-a-section-has-a-name.md` — the §78 entry.
- `docs/decisions/2026-09-sections-own-their-data.md` — one line under *What we learned*: the
  §30 cost recorded there for ownership is now joined by a smaller, conditional one for names.
- `docs/mcp-setup.md` — **`create_section` takes `title` too** (`inputs.ts:89`), and naming at
  creation is the more natural path; `update_section` renames one afterwards. An agent naming the
  sections it creates is the difference between a legible canvas and seven identical frames.
- `development.md` — add the second unnumbered-phase entry as **in progress before the first
  failing test**, then change it to **done only after** the full acceptance pass.
- `.prototype/notes.json` — resolve `note-2026-09-01-001` with what the browser pass actually
  found, including any remaining friction; do not pre-write the conclusion.

---

## Files changed

AGENTS.md §3 wants this readable as a checklist.

| File | Responsibility |
|---|---|
| `packages/contracts/src/section.ts` | `SECTION_DISPLAY_NAMES`, `displayNameOf`, defensive `nameOf`, `SectionRemovalRefusalDetailsSchema`; and the stale `title` comment |
| `packages/contracts/src/section.test.ts` | Derivation, override, prototype case, trimmed/blank `nameOf`, refusal-details schema |
| `packages/contracts/src/inputs.ts` | Shared trimmed `SectionTitleSchema` for section create/update writes |
| `packages/contracts/src/inputs.test.ts` | HTTP/MCP-facing section title normalisation and whitespace refusal |
| `packages/domain/src/section-service.ts` | Normalize direct add/update titles; `record` uses `nameOf`; non-empty refusal carries typed reason/count details |
| `packages/domain/src/activity-service.ts` | The `case 'section'` comment at `:194-196`, rewritten to its true reason. Behaviour unchanged |
| `packages/domain/src/errors.ts` | `DomainRuleError` gains optional `details` |
| `apps/prototype-host/api/errors.ts` | The 409 envelope forwards `details` when present, omits the key when not |
| `packages/domain/src/section-service.test.ts` | Two test-plan rows |
| `apps/prototype-host/api/errors.test.ts` | Two test-plan rows, beside `toErrorResult`'s existing coverage at `:29-32` |
| `apps/web/src/app/core/gateway/gateway-error.ts` | `GatewayError.details: unknown`, populated in `toGatewayError` |
| `apps/web/src/app/core/gateway/prototype-work-manager-gateway.spec.ts` | Real 409 adapter preserves details and preserves absence |
| `apps/web/src/app/features/projects/sections/registry.ts` | Correct the stale one-file-only registry comment |
| `apps/web/src/app/features/projects/sections/registry.spec.ts` | Registry/default drift guard |
| `apps/web/src/app/features/projects/sections/section-frame/project-section-frame.ts` | Resolved name, non-optimistic reset, `renamed` output |
| `apps/web/src/app/features/projects/sections/section-frame/project-section-frame.html` | Inspector name field; dead no-settings branch removed |
| `apps/web/src/app/features/projects/sections/section-frame/project-section-frame.scss` | Token-only `section-frame__name` styling |
| `apps/web/src/app/features/projects/sections/section-frame/project-section-frame.spec.ts` | Name/default/whitespace/emission/no-settings tests |
| `apps/web/src/app/features/projects/sections/rich-text/rich-text-section.ts` | Expose `nameOf` to the template |
| `apps/web/src/app/features/projects/sections/rich-text/rich-text-section.html` | Resolved name in the aria-label |
| `apps/web/src/app/features/projects/sections/rich-text/rich-text-section.spec.ts` | Pin titled and fallback aria-labels |
| `apps/web/src/app/features/projects/section-removal-dialog.ts` | UI-owned labels and duplicate-name disambiguation |
| `apps/web/src/app/features/projects/section-removal-dialog.html` | Named/count-aware prose and both owned-kind action labels |
| `apps/web/src/app/features/projects/section-removal-dialog.spec.ts` | **New file** and render harness; task/reflection labels, plurals, duplicate names, no ids |
| `apps/web/src/app/features/projects/project-page-store.ts` | Rename write; reshaped prompt; discriminator-only 409 routing; stale comments |
| `apps/web/src/app/features/projects/project-page-store.spec.ts` | Rename timing/failure and refusal discriminator routing |
| `apps/web/src/app/features/projects/project-page.ts` | Wire rename intent and removal prompt |
| `apps/web/src/app/features/projects/project-page.html` | Wire `(renamed)` and the reshaped dialog |
| `apps/web/src/app/features/projects/project-page.spec.ts` | Connected rename success/failure and updated removal flow |
| `docs/decisions/2026-09-a-section-has-a-name.md` | §78 decision entry |
| `docs/decisions/2026-09-sections-own-their-data.md` | Record the conditional §30 naming cost |
| `docs/mcp-setup.md` | Document naming through create/update section |
| `development.md` | In-progress then done phase state |
| `.prototype/notes.json` | Close the originating friction note from actual use |

Storybook needs no change: every story and every Design Lab panel passes a `title`
(`project-section-frame.stories.ts:31,43,48,52,59,63`; `live-panels.ts:63-69`), so
`stubSectionDefinition`'s `displayName: 'Section'` never reaches a header.

---

## Acceptance check

Against `pnpm prototype:reset` (`personal-workspace`) with the host restarted:

1. Edit layout → Settings on the Task List → **Name** → type `Backlog`, then leave the field
   (the binding is `(change)`, so it commits on blur or Enter, not per keystroke). The header
   reads `Backlog`, and `.prototype/data.json` has `"title": "Backlog"` on that section.
2. Clear the field and leave it. The header returns to `Task List`, and `title` is **absent**
   from the record — not the string `"Task List"`. Repeat with three spaces: same result,
    **and the field itself is left empty**, not showing the spaces (see B5 in Step 4).
3. Enable write failure injection, try to rename the same section, and leave the field. The header
   and input both retain the persisted name, and the section error is visible. Disable failure
   injection before continuing.
4. Quick add a Sub-Projects section, then confirm its header reads `Sub-Projects`, not
   `Sub Projects` (`personal-workspace` does not seed this type).
5. Quick add a second Task List, name it `Shipped`, drag a task into it.
6. Remove `Backlog` while it holds rows. The dialog reads `Remove “Backlog”?` /
   `It still holds 2 tasks. What should happen to them?`, its select offers `Shipped` by name,
   and **no section id appears anywhere in it**. Choose **Keep the section** so the same
   row-holding source remains available for the duplicate-name check.
7. Add **two** unnamed Task Lists and remove `Backlog` again. The select now has two targets whose
   resolved name is `Task List`, and distinguishes both by their absolute canvas positions.
8. Move the rows to `Shipped`, then confirm `.prototype/data.json`'s activity row carries
   `summary: "Removed the Backlog section"`. **Not the activity feed** — it composes its line
   from the entry's parts and never renders `summary` (`activity-feed.ts:26-29`), and section
   events target the *project*, so the feed reads `Section removed “Personal Workspace”`
   before and after this phase — `verbOf` (`activity-feed.ts:86-89`) splits on the dot and
   replaces underscores, so it is a space, not `Section_removed`.
9. Quick add a Progress section, remove it, and confirm it still goes without a dialog
   (`personal-workspace` does not seed this type either).
10. Over MCP: `update_section` with a padded `title`; the stored and rendered value is trimmed and
    the frame shows it after §62's event arrives. A whitespace-only title is rejected.
11. `pnpm test`, `pnpm lint`, `pnpm build`.

Items 6 and 7 are the acceptance checks that matter: together they are the friction note,
resolved. Item 4 is the regression the overrides table exists to prevent.

---

## Test plan — written first

House convention: `.test.ts` in `packages/*`, `.spec.ts` in `apps/web`.

| Test | Proves |
|---|---|
| `contracts/section.test.ts` — `displayNameOf` over all seven types, including `sub-projects` | The derivation *and* its one override |
| `contracts/section.test.ts` — `nameOf` prefers `title`, falls back on `undefined` | One expression, both branches |
| `contracts/section.test.ts` — `nameOf` trims a nonblank legacy override and falls back for blank/whitespace | Hand-edited old data cannot erase the visible name without a schema-version change |
| `contracts/inputs.test.ts` — section create/update titles trim; blank strings fail; update `null` still clears | Person, HTTP and MCP writes share one normalisation rule |
| `contracts/section.test.ts` — `displayNameOf('toString')` is `'ToString'` | The prototype-chain hole, closed for the same reason `section.ts:52` closes it |
| `web/project-section-frame.spec.ts` — against the **untitled** default fixture with the inspector open, committing whitespace leaves the **input** empty, not showing the whitespace | The binding does not write back on an unchanged expression. A titled fixture tests the case that was never broken — the same trap round 1 found in the dialog rows |
| `web/section-removal-dialog.spec.ts` — a reflections container renders `1 reflection` / `2 reflections` | The second `OwnedDataKind`. Pins the naive `${count} ${ownedKind}` (`1 reflections`), not a strip — see Step 5 |
| `web/registry.spec.ts` — every `displayName` equals `displayNameOf(type)` | Registry and contracts cannot drift; the next non-derivable type fails here, at the moment it is added |
| `web/project-section-frame.spec.ts` — an untitled `sub-projects` frame renders `Sub-Projects` | The regression the override exists to prevent |
| `domain/section-service.test.ts` — removal activity of an untitled section reads `the Task List section` | The hand-read log line in `data.json` (§14) names the section, not its type. `2026-08-activity-summary-ownership.md` is the argument that `summary` is *only* that — the feed composes its own |
| `domain/section-service.test.ts` — direct add/update callers trim titles and map blank create/update to absent/clear | The domain package preserves the invariant even when a caller did not traverse a runtime input schema |
| `domain/section-service.test.ts` — a refusal carries `liveRowCount` matching the live rows, with an archived row present | The count is live-only, and travels as data |
| `host/api/errors.test.ts` — `toErrorResult` on a `DomainRuleError` with typed details produces a 409 carrying `reason` and `liveRowCount` | The seam that lets the UI stop parsing sentences. `toErrorResult` is already tested directly at `errors.test.ts:29-32`, one line from this assertion |
| `host/api/errors.test.ts` — a `DomainRuleError` **without** details produces an envelope with no `details` key at all | Absent, not `undefined`. A `details: undefined` leaking into the JSON body is invisible otherwise |
| `web/prototype-work-manager-gateway.spec.ts` — a real 409 preserves untrusted `details`; absence remains absent | Host and store tests cannot pass while the actual adapter silently drops the discriminator |
| `web/project-section-frame.spec.ts` — typing a name emits `renamed`; blank and whitespace emit `null` | Chrome-only, and clearing means fall back |
| `web/project-section-frame.spec.ts` — `[data-section-no-settings]` is **absent** for a type with no inspector component | The dead branch is really dead — asserting the name field exists proves nothing |
| `web/project-page-store.spec.ts` — `renameSection` sends `{ title }`, patches only **after** the gateway resolves, and on failure leaves the section unchanged with a message in `sectionError` | Rename joins the other three section writes rather than forking a fourth idiom — see Step 4. **Not** an optimism test: the plan deliberately does not make one pass |
| `web/project-page.spec.ts` — the connected Settings field sends the section id/title, updates the header on success, and resets to the persisted value on failure | Template → frame → page → store wiring, including the DOM inconsistency a store-only test cannot see |
| `web/section-removal-dialog.spec.ts` — renders `1 task` for one and `2 tasks` for two | The `1 tasks` defect, pinned |
| `web/section-removal-dialog.spec.ts` — no rendered text contains any offered target's `id` | The id leak cannot come back. `/section-[0-9a-f]/` passes vacuously: real ids are `section-` plus 8 hex (`packages/domain/src/ids.ts:16`; `contracts`' ids are plain strings) but every web fixture uses `section-tasks`-style names (`project-page.spec.ts:239-241`), which that pattern never matches. Asserting against the fixture's own id is robust either way |
| `web/section-removal-dialog.spec.ts` — two **untitled** same-type targets render distinguishable options | The friction note's second half. Titled fixtures would test the case that was never broken |
| `web/section-removal-dialog.spec.ts` — an explicit title equal to another target's default is also disambiguated | The rule is duplicate resolved names, not merely two absent `title` fields |
| `web/project-page-store.spec.ts` — only `{ reason: 'section_not_empty', liveRowCount: positiveInt }` opens the dialog; absent, zero, fractional, wrong-typed and differently discriminated details surface the original error | No unrelated 409 can masquerade as a removal-policy question |
| `web/rich-text-section.spec.ts` — titled and untitled sections produce resolved Notes aria-labels | The fourth naming surface stays on the shared contract |

Mutation-check the registry guard, pluralisation, id-leak and refusal-discriminator rows.
For most, delete the line each covers and watch it fail; the registry guard passes trivially
against a wrong derivation if written over one type. **The id-leak row is the exception** —
nothing leaks an id today (`section-removal-dialog.html:18` renders `title ?? type`), so it is a
forward guard rather than a fix under test: its mutation is to render `target.id` deliberately
and watch it fail.

---

## Boundaries touched (§1, §8, §12, §70)

- **Contracts defined once.** `displayNameOf`, `nameOf`, `SectionTitleSchema` and
  `SectionRemovalRefusalDetailsSchema` live
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
- **Nothing about archived rows.** Sibling plan — see *Sequencing* for the one string the two
  phases pass between them.

---

## Sequencing against the sibling plan

`2026-09-archive-restore-implementation.md` makes **every** section archive on removal, not
just a cascaded container's rows. That changes the two action labels this step writes:

| Kind | This phase ships | The sibling phase changes it to |
|---|---|---|
| tasks, reassign | `Move the tasks and remove` | `Move the tasks out, then archive` |
| tasks, cascade | `Archive the tasks and remove` | `Archive the section and its tasks` |
| reflections, reassign | `Move the reflections and remove` | `Move the reflections out, then archive` |
| reflections, cascade | `Archive the reflections and remove` | `Archive the section and its reflections` |

**This phase must not ship the right-hand column.** It would be true of nothing until the
sibling lands — aspirational documentation, which AGENTS.md §2 rule 6 treats as a defect. The
sibling plan carries the same table and owns the second edit.

The shared handoff checklist is: `packages/contracts/src/section.ts`;
`packages/domain/src/section-service.ts` and `section-service.test.ts`;
`apps/web/src/app/features/projects/project-page-store.ts` and `.spec.ts`;
`project-page.ts`; `project-page.html`; `section-removal-dialog.html`; the new
`section-removal-dialog.spec.ts`; `docs/decisions/2026-09-sections-own-their-data.md`; and
`development.md`. **Land this one first** — it is the smaller change, and the sibling must rebase,
refresh its line citations, preserve the discriminated refusal, update both owned-kind label tests,
and use `nameOf` in its new region before TDD begins.

---

## Decisions settled for this phase

**1. `title` remains an optional override; defaults are derived at read time.** A stored default
stops tracking the registry, so renaming a display name would leave every existing section on the
old one. Keep the override optional and derive at read time. This is the decision entry's
interesting half.

**2. `list_sections` does not gain a denormalized resolved name in this phase.**
It would mean denormalising a `name` into the tool output or having agents derive it — and an
agent deriving it today would produce `Sub Projects`, which is wrong. Note it under *Revisit
when*.

**3. Duplicate names remain legal and choice surfaces disambiguate equal resolved names by absolute
canvas position.** Forcing a name at creation
would put a modal in front of Quick add, which §26's quick-add exists to avoid. Worth recording,
because it is the question the friction note actually asks.

**Open questions: none.** The decision entry records all three choices and puts question 2 under
*Revisit when* rather than leaving it implementation-blocking.

---

## Decision entry this phase must write

`docs/decisions/2026-09-a-section-has-a-name.md`, in §78 format. The question is *what is a
section called, and who decides*. Its interesting content is settled decision 1 (why the default is
derived at read time rather than stored), settled decision 3, and the §30 accounting: ownership cost
containers an unconditional entry in the contracts map, names cost one only for a type whose name
is not derivable — with `sub-projects` as the worked example that proves the escape hatch is
needed rather than hypothetical.

---

## Commit sequence

One per meaningful green point. The refusal producer/transport land before the web consumes them;
the dialog reshape and discriminator-only routing land together so no intermediate commit handles
an unrecognized 409 as a policy question.

```
contracts: section names and a discriminated non-empty refusal
domain: normalized names and a typed non-empty refusal
host+gateway: preserve structured rule details across the boundary
web: every naming surface and the frame use the shared name
web: the dialog handles only the refusal it can resolve
docs: what a section is called, and who decides
```

After the names phase passes tests, lint, build, browser acceptance and the MCP check, rebase and
re-review the archive plan before its first failing test. Its exact source-line citations are
against the pre-names tree until then.

---

## Revisions

**Round 6 — post-edit consistency audit.** Clarified that malformed refusal details remain on the
ordinary error path; they are not a new feature-specific failure mode. Rechecked the sibling
handoff, settled decisions, concrete file list, and executable acceptance steps after all round-5
changes. The final review also caught that `personal-workspace` does not seed Sub-Projects or
Progress, so acceptance now Quick adds both before testing them.

**Round 5 — full two-plan review, with every product choice resolved.** The review found four
behavioural holes in the names phase and three cross-plan integration failures. The plan now uses a
positive, discriminated `section_not_empty` payload and opens the dialog only when that payload
parses; unrelated archive-era 409s surface as errors. Required `rowCount` therefore remains honest
and the unsafe countless fallback is gone. Section write inputs and direct domain calls normalize
titles, while `nameOf` keeps legacy blank data visible without tightening the stored schema or
bumping `SCHEMA_VERSION`. The non-optimistic field resets to persisted state while pending, so a
failed rename cannot leave false DOM state. Acceptance now creates two genuinely unnamed targets
and exercises failure injection. Real gateway transport, connected page wiring, rich-text
accessibility, both owned kinds and explicit-title/default collisions gained tests. All open
questions are settled, paths and living-document timing are concrete, and the sibling handoff is an
explicit shared-file contract.

**Round 1**, against a cold-start reviewer briefed with the plan, the spec §N list and AGENTS.md §1.
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

**Round 3** — a second cold-start reviewer, same brief, told not to re-report round 1. Five
blocking findings and thirteen minor; every one checked against the code before acting.

1. **`renameSection` could not be optimistic the way the plan claimed.** `updateSection`
   (`project-page-store.ts:550-561`) awaits the gateway *then* patches — nothing paints early
   and there is nothing to revert. The §63 test in the test plan would have failed, and the
   minimum implementation to pass it would either have forked a bespoke path or silently made
   `setCollapsed`/`setColumnSpan`/`updateConfig` optimistic too. Step 4 now states that rename
   is deliberately not optimistic, and says why.
2. **The overrides lookup reintroduced a hole the same file warns about.**
   `SECTION_DISPLAY_NAMES[type] ?? …` returns `Object` for `'constructor'`, from a signature
   declaring `: string`, with the index signature hiding it from the compiler — twenty lines
   below `section.ts:52`'s comment explaining why `sectionKindOf` uses `Object.hasOwn`. `type`
   is open and agent-writable, so it is reachable. Fixed, with a test.
3. **Acceptance item 7 was not performable.** The activity feed composes from parts and never
   renders `summary` (`activity-feed.ts:26-29`), and section events target the project — so the
   feed reads the same thing before and after Step 2. The item now checks `data.json`, Step 2
   says plainly that it changes no pixel, and the test row's citation was inverted: the ADR it
   named is the argument that `summary` is *not* what the feed shows.
4. **Step 2 falsified a second domain comment and left it.** `activity-service.ts:192-196`
   returns `undefined` for a section because "the domain has no business guessing" its name —
   both halves untrue after Step 1. "This is the only domain use" was wrong as stated.
5. **The name field would not clear.** `[value]="section().title ?? ''"` does not write to the
   DOM when the expression is unchanged, so committing whitespace on an untitled section left
   three spaces in the field against a header reading `Task List` — acceptance item 2 exactly.
   `rename` now normalises and writes back.
6. Smaller corrections, mostly consequences of the plan having **no file-level change list**,
   which AGENTS.md §3 requires and round 1 half-caught: `project-section-frame.scss` needs a
   `__name` rule that does not exist; `section-removal-dialog.spec.ts` **does not exist** and
   four test rows depend on creating it and a harness; the envelope test belongs in
   `api/errors.test.ts` beside `toErrorResult`'s existing coverage, plus a case pinning that
   `details` is *absent* rather than `undefined`; `ownedKindOf` returns `| undefined`;
   `OwnedDataKind` is already plural so the UI singularises; the positional disambiguator had
   to choose between a `targets` index and `position + 1` and now says which; the id-leak regex
   passed vacuously against `section-tasks`-style fixtures; `renamed` now carries its id like
   its three neighbours; `title()` becomes `name()`; two more comments go stale
   (`section.ts:81`, `registry.ts:44-46`); §55 was cited but nothing implements it, replaced
   with §14; unregistered types render outside the frame and cannot be renamed; Steps 5 and 6
   must land in one commit; and the sibling-plan handoff is now a table saying which label each
   phase ships.

The reviewer also confirmed, against the code, that exactly one of the seven registered display
names is non-derivable and the spec really does spell it `Sub-Projects` (line 1109); that every
line citation in the plan still lands with no drift; that exactly four surfaces render a section
name and they are the four listed, after a sweep of `apps/web`, `apps/e2e`, `packages/*`,
Storybook and the Design Lab; that Storybook and the Design Lab are unaffected; that `title()`
exists, the inspector sits where the plan says and §32 gates it; that the no-settings branch
really is universal today; that `DomainRuleError`'s optional second argument is safe across all
29 call sites with no subclasses; that MCP genuinely does not need `details`; and that the
acceptance environment — `pnpm prototype:reset`, `personal-workspace`, `.prototype/data.json`,
a seeded `sub-projects` section — is all real.

**Round 4** — a third cold-start reviewer, briefed to look hardest at the round-3 material,
which had never been reviewed. Five blocking findings and ten minor. Every blocking one was a
consequence of editing prose in one place and not another — the round-3 pass fixed Step 4's
argument and left the artefacts that argument invalidated.

1. **The test plan still demanded the optimistic `renameSection` test** that Step 4 had just
   been rewritten to refuse. Under §3's TDD loop the minimum implementation to pass it is the
   bespoke path Step 4 forbids. The row now states what Step 4 actually claims.
2. **The `reflections` pluralisation test proved nothing.** Round 3 asserted an `s`-strip breaks
   on `reflections`; it does not — `'tasks'` and `'reflections'` both singularise correctly by
   dropping the final `s`, so the test passed against the implementation it was written to
   exclude, and Step 5's two-entry-lookup instruction rested on a false claim. The lookup keeps
   its place on the real ground: it stops compiling when `OwnedDataKind` gains a member.
3. **The Files changed table — round 3's own deliverable — omitted four files**, one of them a
   compile break: Step 3 calls `nameOf` from `rich-text-section.html`, but a template can only
   call its component's members and `RichTextSection` does not expose it. Also missing:
   `section-service.test.ts`, `api/errors.test.ts`, `project-page-store.spec.ts`. Listing five
   test files and omitting three is worse than omitting all of them.
4. **Four more stale comments in the removal path**, all in code Step 5 rewrites:
   `project-page-store.ts:26-34` and `:446-447`, `section-removal-dialog.html:1-3`, and
   `project-page.spec.ts:260`. The plan hunts this class of defect three times elsewhere and
   would have failed its own standard here.
5. **`project-page.spec.ts` is a three-line edit, not one.** The refusal fixture at `:245-249`
   builds a `GatewayError` carrying no `details`, so after Step 6 the parse fails and the dialog
   renders the countless question — any assertion expecting a count fails until the fixture
   supplies one. The merge-Steps-5-and-6 argument survives; the scope claim did not.
6. Smaller: the `!` in `displayNameOf` is a no-op (`noUncheckedIndexedAccess` is not set) and
   diverges from `section.ts:57-58`'s idiom; `verbOf` renders `Section removed`, not
   `Section_removed`; `position + 1` yields `4`, so the label is a cardinal rather than an
   untested ordinal; seven citation drifts in round-3 lines, including `ids.ts:16` being in
   `packages/domain` rather than `contracts`; `project-section-frame.spec.ts:186` flips rather
   than being deleted, and its test is renamed; both plans' overlap lists omitted
   `project-page.html`; the whitespace row needed its fixture preconditions; the id-leak row
   cannot be mutation-checked by deletion because nothing leaks an id today; and §26, §71 were
   argued from but not declared.

Two silences were closed rather than found wrong: that a person may type `Task List` literally
and store it (accepted, with the reason), and that `create_section` also takes a `title`.

The reviewer confirmed, against the code, that round 3's substantive fixes all hold: `Object.hasOwn`
closes a real and reachable hole and typechecks; the `rename(HTMLInputElement)` handler is
buildable against the real component API and genuinely fixes the whitespace case;
rename-is-not-optimistic is factually grounded and §63 says what the plan claims; acceptance item
7's two claims both hold; the `title()` → `name()` call-site list is exactly right and exactly
complete; `renamed`'s three neighbours do carry ids and `project-page.ts:179-189` already has the
matching handler shape; `position + 1` beats a `targets` index, and there is one `@for` serving
both layout modes rather than two; and no e2e spec touches any changed string.
