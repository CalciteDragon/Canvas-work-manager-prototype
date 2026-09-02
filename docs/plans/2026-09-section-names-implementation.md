# Implementation plan — a section has a name

Follow-up to `docs/plans/2026-09-section-ownership-implementation.md`, from the friction that
phase's browser pass recorded (`.prototype/notes.json`, `note-2026-09-01-001`). That phase made
two Task Lists on one canvas a normal thing to have; this one makes them tellable apart.

**Goal.** Every section has one name — set by a person or an agent, defaulted the same way
everywhere — and every surface that refers to a section uses it.

**Not in scope.** Renaming section *types*, milestones, and anything about archived rows, which
is the sibling plan `2026-09-archive-restore-implementation.md`.

---

## Step 0 — Three facts that change the obvious approach

**The write path already ships end to end; only the control is missing.**
`UpdateSectionInputSchema.title` exists and is nullable-optional so clearing falls back
(`packages/contracts/src/inputs.ts:97`); `SectionService.update`, `PATCH /api/sections/:id`,
`SectionGateway.update` (`apps/web/src/app/core/gateway/work-manager-gateway.ts:101`) and the
`update_section` MCP tool all carry it. Storybook exercises titled frames
(`project-section-frame.stories.ts`). So today **an agent can name a section and a person
cannot** — which is the wrong way round for a control that lives on the frame.

> This phase is mostly *reaching* an existing capability, not building one. Resist widening it.

**There are three different answers to "what is this section called", and they disagree.**

| Surface | Expression | Says, for an untitled Task List |
|---|---|---|
| Frame header (`project-section-frame.ts:56`) | `title ?? definition.displayName` | Task List |
| Removal dialog (`section-removal-dialog.html:18`) | `title ?? type` | task-list |
| Activity summary (`section-service.ts:388`) | `title ?? type` | Removed the task-list section |

The frame is right and the other two are wrong, but they are not wrong by carelessness:
`displayName` lives in `SECTION_REGISTRY` in the web app, and neither the domain nor a
non-web caller can reach it. The default name has to move below both, exactly as `kind` did
last phase.

**The default name does not need a map.** Every one of the seven registered display names is
the title-cased kebab type — `task-list` → `Task List`, `recent-activity` → `Recent Activity`,
`sub-projects` → `Sub-Projects`. Verified against `registry.ts:53-72`, all seven. So the
default is a *derivation*, not a second per-type table:

> `displayNameOf(type)` in contracts, derived from the type string, with a registry test
> asserting it equals every registered `displayName`.

This matters for §30. `SECTION_OWNERSHIP` already cost containers their one-file promise; a
second per-type map would cost views theirs too. A derivation costs nothing — adding a type
still touches its folder and its registry line — and the test is the escape hatch: the first
type whose name is not derivable (`ai-summary` → "Ai Summary", Slice 24) fails that test
loudly, and *that* is when an override map earns its place. Do not add one pre-emptively.

---

## Step 1 — Contracts: one default name, derived

`packages/contracts/src/section.ts`, beside `SECTION_OWNERSHIP`:

```ts
/**
 * The name a section carries when it has no `title` override. Derived rather than mapped, so
 * §30's promise survives: adding a section type still touches its own folder and one registry
 * line. `registry.spec.ts` pins this against every registered `displayName`; the first type
 * that does not derive cleanly is the one that earns an override map.
 */
export const displayNameOf = (type: string): string =>
  type
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

/** A section's name for prose: its override, else the derived default. */
export const nameOf = (section: Pick<ProjectSection, 'type' | 'title'>): string =>
  section.title ?? displayNameOf(section.type);
```

`nameOf` is the single expression every surface uses. Three call sites currently disagree; after
this there is one thing to be wrong.

**Verify:** `pnpm --filter @cwm/contracts test`.

---

## Step 2 — Domain: activity says the name

`packages/domain/src/section-service.ts:388` — `record` composes
`` `${verb} the ${section.title ?? section.type} section` ``. Replace with `nameOf(section)`.

This is the only domain use. `requireContainer` and `settleRows` raise with ids on purpose:
those messages answer an **agent**, which holds ids and not names, and `EntityNotFoundError`'s
existing rule is that a message to a caller names what the caller gave it. Leave them — Step 4
is how the *person* stops seeing them.

**Verify:** `pnpm --filter @cwm/domain test`. A test asserting the summary of removing an
untitled `task-list` reads `Removed the Task List section`, and a titled one reads its title.

---

## Step 3 — Web: the registry reads the default back

`apps/web/src/app/features/projects/sections/registry.ts` keeps `displayName` as an explicit
field — it is what a designer edits, and the Quick add menu reads it — but `registry.spec.ts`
gains the guard:

```ts
it('derives every display name from its type', () => {
  for (const definition of SECTION_REGISTRY)
    expect(definition.displayName).toBe(displayNameOf(definition.type));
});
```

`project-section-frame.ts:56` becomes `nameOf(this.section())` — same result, one expression.

**Verify:** `pnpm --filter web test`.

---

## Step 4 — Web: the frame can rename

`project-section-frame.html` — a name field at the **top of the inspector region**, above
`definition().inspectorComponent`, present for every type:

```html
@if (editMode() && configOpen()) {
  <div data-section-inspector class="section-frame__inspector">
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
    @if (definition().inspectorComponent; as inspector) { … } @else { … }
  </div>
}
```

Three things this settles deliberately:

- **The placeholder is the default, and an empty field clears the override.** `title` is
  nullable-optional precisely so clearing falls back rather than storing the default as a
  literal — a stored `"Task List"` would silently stop tracking the registry.
- **It lives in the inspector, not the header.** §32 gates the inspector behind Edit Layout
  Mode along with every other layout affordance, and an always-editable header title would put
  a text input where View Mode wants clean chrome (`2026-08-view-mode-section-chrome.md`).
- **`This section has no settings.` stops being reachable.** Every section now has at least a
  name, so that branch is dead — delete it and its `data-section-no-settings` test rather than
  leaving prose that is no longer true.

`project-section-frame.ts` — a `renamed` output, emitted with `null` for a blank field. The
frame stays **chrome only**: it emits intent, it does not touch a gateway.

`project-page.html` / `project-page.ts` — wire `(renamed)` to the store.
`project-page-store.ts` — `renameSection(id, title: string | null)` delegating to the existing
private `updateSection(id, { title })`, which already patches the array in place. Optimistic
per §63, like `collapse` and `resize` beside it.

**Verify:** `pnpm --filter web test`.

---

## Step 5 — Web: the removal dialog asks a human question

`section-removal-dialog.html` today renders the domain's sentence as its body
(`{{ prompt().message }}`) and its target options as `title ?? type`. Both become `nameOf`-based
prose composed in the UI:

```
Remove “Backlog”?
It still holds 3 tasks. What should happen to them?
[ Move them to ▾ Shipped ]
[ Keep the section ]  [ Move the rows and remove ]  [ Archive the rows and remove ]
```

`SectionRemovalPrompt` (`project-page-store.ts:30`) stops carrying `message: string` and starts
carrying what the UI needs to write its own: `sectionName: string`, `rowCount: number`,
`ownedKind: OwnedDataKind`, `targets: ProjectSection[]`.

**Where `rowCount` comes from is this plan's one real open question — see Open questions.**
The plan assumes the recommended answer (a structured refusal) and Step 6 implements it. If the
answer changes, only Step 6 and this interface change; Steps 1–4 are unaffected.

Pluralisation is the UI's: `1 task` / `3 tasks`, not the domain's `1 tasks`.

**Verify:** `pnpm --filter web test` — including a case asserting the dialog never renders a
raw section id.

---

## Step 6 — A refusal that carries its facts

The store's existing comment states the property to keep: *"The count comes from the domain
rather than from a client-side row count, so the dialog and the rule cannot disagree."* That is
worth keeping and is the reason the UI cannot simply count rows it already has — its list is
filtered to `includeArchived: false`, and `settleRows` counts live rows through the repository.

So the count travels, structurally rather than as prose:

- `packages/domain/src/errors.ts` — `DomainRuleError` gains
  `readonly details?: Readonly<Record<string, unknown>>` as a second constructor argument.
  Every existing call site is unchanged.
- `section-service.ts:301` — the refusal passes `{ liveRowCount: live.length, ownedKind: owned }`
  alongside its existing sentence. The sentence stays for MCP and `curl` callers, who have no UI
  to compose one.
- `apps/prototype-host/api/errors.ts:46` — the 409 envelope forwards `details` when present.
- `apps/web/src/app/core/gateway/gateway-error.ts` — `GatewayError` gains `details`, populated in
  `toGatewayError` from the same envelope.
- `project-page-store.ts:445` — reads `liveRowCount` from `details`, and falls back to the
  section's own local live-row count if it is absent, so a host that predates this still opens a
  usable dialog.

This is one optional field on an envelope that already exists (`{ error, message }`), not a new
error taxonomy. §71 says the host's HTTP implementation is disposable — this stays disposable.

**Verify:** `pnpm --filter @cwm/domain test`, `pnpm --filter @cwm/prototype-host test`,
`pnpm --filter web test`.

---

## Step 7 — Docs

- `docs/decisions/2026-09-a-section-has-a-name.md` — the §78 entry (see Open questions for the
  two it must answer).
- `docs/decisions/2026-09-sections-own-their-data.md` — one line under *What we learned*: the
  two-file cost recorded there applies to ownership, and the default **name** deliberately did
  not repeat it.
- `docs/mcp-setup.md` — `update_section` takes `title`; worth one line, since an agent naming
  the sections it creates is the difference between a legible canvas and seven identical frames.
- `development.md` — a second unnumbered-phase entry.

---

## Acceptance check

Run against `pnpm prototype:reset` (`personal-workspace`) with the host restarted:

1. Edit layout → Settings on the Task List → **Name** → type `Backlog`. The header reads
   `Backlog` immediately, and `.prototype/data.json` has `"title": "Backlog"` on that section.
2. Clear the field. The header returns to `Task List`, and `title` is **absent** from the
   record — not the string `"Task List"`.
3. Quick add a second Task List, name it `Shipped`, drag a task into it.
4. Remove `Backlog` while it holds rows. The dialog reads `Remove “Backlog”?` /
   `It still holds 2 tasks. What should happen to them?`, its select offers `Shipped` by name,
   and **no section id appears anywhere in it**.
5. Move the rows to `Shipped` and confirm the activity feed reads
   `Removed the Backlog section` — not `the task-list section`.
6. Remove a Progress section and confirm it still goes without a dialog.
7. Over MCP: `update_section` with a `title`, and the frame shows it within a second (§62).
8. `pnpm test`, `pnpm lint`, `pnpm build`.

Item 4 is the acceptance check that matters: it is the friction note, resolved.

---

## Test plan — written first

| Test | Proves |
|---|---|
| `contracts/section.spec.ts` — `displayNameOf` over each of the seven types | The derivation, before anything depends on it |
| `contracts/section.spec.ts` — `nameOf` prefers `title`, falls back on `undefined` | One expression, both branches |
| `web/registry.spec.ts` — every `displayName` equals `displayNameOf(type)` | The derivation and the registry cannot drift; fails loudly on the first non-derivable type |
| `domain/section-service.spec.ts` — removal activity of an untitled section reads `the Task List section` | §78's living prose is not a raw type |
| `domain/section-service.spec.ts` — a refusal carries `liveRowCount` matching the live rows, with an archived row present | The count is live-only, and it survives as data rather than prose |
| `host/routes.spec.ts` — the 409 envelope carries `details.liveRowCount` | The seam that lets the UI stop parsing sentences |
| `web/project-section-frame.spec.ts` — typing a name emits `renamed`; clearing emits `null` | The frame stays chrome, and clearing means fall back |
| `web/project-section-frame.spec.ts` — the inspector renders the name field for a type with no inspector component | The dead `no settings` branch is really dead |
| `web/project-page-store.spec.ts` — `renameSection` paints before the gateway resolves and reverts on failure | §63, matching `collapse`/`resize` |
| `web/section-removal-dialog.spec.ts` — renders `1 task` for one and `2 tasks` for two | The `1 tasks` defect, pinned |
| `web/section-removal-dialog.spec.ts` — no rendered text matches `/^section-/` | The id leak cannot come back |
| `web/section-removal-dialog.spec.ts` — two same-type targets render distinct names | The select is usable, which is the second half of the note |
| `mcp-tools/contract.test.ts` — `update_section` accepts `title` and clears on `null` | The agent path stays whole |

Mutation-check the last dialog test and the registry guard: delete the line each covers and
watch it fail. The registry guard in particular passes trivially against a wrong derivation if
it is written against one type.

---

## Boundaries touched (§1, §8, §12, §70)

- **Contracts defined once.** `displayNameOf`/`nameOf` live only in `packages/contracts`. The
  registry keeps `displayName` as data and is *tested* against the derivation rather than
  importing it as its value — the test is the single source, not a second definition.
- **Domain knows nothing about the web.** Step 2 works because the default name is derived from
  the `type` string the domain already holds. `SECTION_REGISTRY` is not imported, and must not be.
- **The frame emits intent.** `renamed` is an output; the store calls the gateway. No component
  gains a gateway import.
- **One flag service, no `new Date()`.** Neither is near this phase.

The one boundary this phase leans on is Step 6's `details`, which crosses domain → host → gateway.
It stays a boundary rather than a leak because `GatewayError.details` is `unknown`-shaped and
read defensively at exactly one call site; the UI branches on `code`, as
`2026-08-gateway-surface-grows-with-implementations.md` requires.

---

## Explicit non-goals

- **No rename from the section header.** §32 keeps layout affordances inside Edit Layout Mode.
- **No name on milestones, projects or tasks.** They have names already.
- **No override map for display names.** The derivation plus its test is the whole mechanism
  until a type fails it.
- **No new MCP tool.** `update_section` already does this; adding `rename_section` would be a
  §56 tool-shape experiment, which is Slice 24.
- **No uniqueness rule.** Two sections may share a name. Enforcing otherwise is a product
  question nobody has asked, and the reassign select shows position order anyway.
- **Nothing about archived rows.** Sibling plan.

---

## Open questions

**1. Does the refusal carry a structured count, or does the dialog stop counting?** *(Blocks
Steps 5–6 only.)*

- *Recommended — structured `details`.* Keeps the store's stated property that the dialog and
  the rule cannot disagree, and keeps a number the user plainly wants before archiving.
  Costs one optional envelope field across three files.
- *Rejected — drop the count:* `It still holds tasks. What should happen to them?` needs no
  wire change at all, and is honest. Rejected because it silently abandons a design property
  the code documents, and because "how many am I about to archive?" is the question the dialog
  exists to answer.
- *Rejected — count client-side:* the UI's list is `includeArchived: false` and section-scoped;
  it would disagree with `settleRows` the moment an archived row exists, which is the exact
  drift the comment warns about.

**2. Should `title` become required, defaulted at creation?** Recommended **no**. A stored
default stops tracking the registry, so renaming "Task List" to "Tasks" in the registry would
leave every existing section on the old name. Keep the override optional and derive the default
at read time. Record this in the decision entry — it is the interesting half of it.

**3. Does `list_sections` return the resolved name to agents?** Recommended **not in this
phase**: it would mean either denormalising `name` into the tool's output shape or having agents
derive it, and no agent has asked. Note it in the decision entry's *Revisit when*.

Both 1 and 2 need answering before Step 5 begins; 3 can be answered in the write-up.

---

## Decision entry this phase must write

`docs/decisions/2026-09-a-section-has-a-name.md`, in §78 format. The question is *what is a
section called, and who decides* — its interesting content is Open question 2 (why the default
is derived at read time rather than stored) and the §30 accounting: ownership cost containers
their one-file promise, names deliberately cost nothing.

---

## Commit sequence

One per step; Steps 1–3 land together to keep the tree green.

```
contracts: a section's name, derived rather than mapped
domain: activity says the section's name, not its type
web: the registry is tested against the derived name
web: the frame can rename a section
web: the removal dialog asks about a named section
domain+host+web: a refusal carries its row count as data
docs: what a section is called, and who decides
```
