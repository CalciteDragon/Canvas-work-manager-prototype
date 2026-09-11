<!-- completed-record id="17" closed="2026-08-31" summary="Design Lab knobs, Storybook on the Vite framework, project create/edit/archive UI and the two e2e tests" -->
# Slice 17 — Design Lab, Storybook, and the end-to-end tests

> **Completed record — frozen at closeout.** Status **done**, closed **2026-08-31**.
> This file is history, not current truth: the outcome as it was recorded when the work
> closed, the slice definition from the build order, and the implementation plan as it was
> executed. Later work may have changed what it describes. The current state of every
> system it touched lives in [`docs/architecture/`](../../architecture/overview.md); the status
> board is [`progress.md`](../progress.md). The build order these records cite as
> `development.md` was split into `docs/roadmap/` on 2026-09-10.

## Outcome

**Dependency repair follow-up:** done — [plan and verification evidence](25-dependency-repair.md). Restored the locked install and fixed exposed runtime/test defects; full tests, lint, builds, automated browser journeys and both MCP transports pass.

**Status:** done — plan: [17-design-lab-storybook-and-e2e.md](17-design-lab-storybook-and-e2e.md).
The First Prototype Milestone is closed: [docs/guides/first-milestone-walkthrough.md](../../guides/first-milestone-walkthrough.md)
carries a numbered click-path for every §81 bullet across all eight groups, naming the seed
each one needs. Both e2e tests pass, twice in a row, from a clean checkout.

**The slice's own *Build* list was written in Phase 0 and four of its items had since been
delivered elsewhere** — the state inspector by Slice 12, all four named component tests, and
`docs/decisions/`'s first entry. The list below is corrected rather than quietly satisfied.
What it was missing is the opposite: three §81 bullets — create, edit and archive project —
had no UI at all, and the web e2e test could not have been written without the first of them.

**The token file is now structured around the knobs.** Each theme block holds only base
literals; every derived token is expressed once under bare `:root`, so a knob moves both
themes. The first structure would have made surface contrast and elevation **silent no-ops in
light**, where `:root[data-theme='light']` re-declared the same tokens as literals at higher
specificity. Appearance is unchanged at the defaults, and that was measured in a browser
rather than asserted: the three surfaces paint exactly `#1b1e24`/`#23272f`/`#101216` in dark
and `#ffffff`/`#ffffff`/`#eceef2` in light, `--space-4` is 16px, `--radius-md` is 8px, and
each shadow keeps its own per-theme alpha. Two limits are stated on the controls themselves
rather than left to be discovered — surface contrast reduces only, and the accent knob moves
`--color-accent` alone ([entry](../../decisions/2026-08-design-lab-tokens-are-session-knobs.md)).

**Storybook works on the preview Vite framework**, so decision 1's fallback was not taken.
The spike found two things planning could not: Compodoc is on by default and is a CLI this
repo does not install, and `@analogjs/vite-plugin-angular` looks for a tsconfig at exactly
`.storybook/tsconfig.json` — without it every component renders as *"Component 'TaskRow' is
not resolved"* ([entry](../../decisions/2026-08-storybook-runs-on-the-vite-framework.md)).
`TaskRow` ships **six** of §4's seven variants; *Agent Modified* has no data behind it and
inventing task-level attribution is a §58 question
([entry](../../decisions/2026-08-agent-modified-has-no-data-behind-it.md)).

**The defect that mattered most** was the same class as the four commits that closed Slice 16:
optimistic project writes had no in-flight guard, so `onLiveEvent` would route a `project.*`
frame into `refreshProject()` and overwrite an optimistic rename with the frame its own write
produced. `pendingSectionWrites` is now `pendingWrites`, incremented by both `writingSections`
and a new `writingProject`; three check sites unchanged. Mutation-checked.

**The e2e suite found one thing reasoning did not:** the host binds `127.0.0.1` only while
`ng serve` listens on `[::1]`, so a single tidy probe address times out one of them after
three minutes with no explanation. Each `webServer` entry now names the address its server
actually binds ([entry](../../decisions/2026-08-e2e-owns-its-servers-and-its-data.md)).

**The fresh-resolve install check found something that was not ours.** Deleting
`node_modules` *and* `pnpm-lock.yaml` and running plain `pnpm install` — the only check that
exercises resolution, and so the only one that proves the `minimumReleaseAgeExclude` entries
are complete — resolved every Storybook package cleanly and moved Angular 22.1.3 → 22.1.4,
which cost **+107 kB** in the framework chunk on its own. The committed lockfile stays on
22.1.3; the finding is in the budget entry.

**The bundle budget moved from 725 kB to 850 kB, deliberately and with the measurement.**
Lazy-loading the two `prototype/*` routes moved 1.4 kB, exactly as the plan predicted: `App`
mounts the development panel globally, so the panel and its controls stay eager whatever the
routes do. The catalogue did **not** add materially, which is what "the catalogue shows real
components" was supposed to buy ([entry](../../decisions/2026-08-initial-bundle-budget.md)).

Not delivered, deliberately: no component library extraction (the primitive panels are the
evidence for it, not the doing of it), no `@storybook/addon-vitest`, no third e2e test, no
project delete, no `/projects` index route, and no lazy-loading of the development panel —
that last one would reopen a Slice 12 decision about how §46's chord reaches every route.

## Slice definition

**Goal:** Close out the First Prototype Milestone with the tools that make design
iteration fast.

**Spec:** §4, §19, §20, §21, §22, §26, §62, §63, §65, §67, §68, §69, §78, §81

**Build**

- **Storybook** (Angular integration) with stories for the reusable components —
  at minimum the `TaskRow` and `ProjectSection` variant sets named in §4.
- **Design Lab** at `/prototype/design` (§67): buttons, inputs, task rows, cards,
  project cards, widgets, section frames, navigation, drawers, menus, and the
  empty/loading/error states, with live token controls (§22): radius, spacing
  density, surface contrast, accent, font scale, elevation, sidebar width.
- **Project create, edit and archive** — added to this list by Slice 17 because *Done
  when* required it. Three §81 bullets had no UI at all: nothing created a *top-level*
  project, the header rendered name/status/target date read-only with §26's More control
  disabled, and archive was reachable only from the domain. The web e2e test below could
  not have been written without the first of them.
- The two end-to-end tests, and only these (§69):
  1. **Web:** load seed → create project → create task → dashboard shows task.
  2. **MCP:** agent calls `create_task` → task appears in the web UI → activity feed
     attributes it to the agent.
- ~~`/prototype/state` — seed/state inspector (§68)~~ — **delivered by Slice 12.**
  Verified here, built there.
- ~~Component tests for `TaskRow` completion, section collapse, section configuration,
  and dashboard widget states~~ — **all four already existed** (`task-row.spec.ts`,
  `project-section-frame.spec.ts` ×2, `dashboard-page.spec.ts`). §69 was already
  satisfied; this slice added only the tests its own new code earned.
- ~~Seed `docs/decisions/` with the first entry — flow-vs-grid~~ — **done long ago.**
  Forty entries existed before this slice, including the flow-vs-grid one.

**Done when** every §81 checklist item is demonstrable and both e2e tests pass.

> **Stop here and use the prototype.** Slices 18+ should be selected by what actually
> caused friction, not built in order. That is the whole point of §77 and §82.

---

## Implementation plan — Slice 17 — Design Lab, Storybook, and the end-to-end tests

**Goal:** Close the First Prototype Milestone — every §81 item demonstrable by clicking,
with Storybook and a live-token Design Lab making the next design change cheap.

**Spec sections:** §4, §19, §20, §21, §22, §26, §62, §63, §65, §67, §68, §69, §78, §81

---

### What is already true

This slice's *Build* list was written in Phase 0 and four of its items have since been
delivered by other slices. Verified against the repository, not assumed:

| Slice 17 bullet | Reality |
|---|---|
| `/prototype/state` — seed/state inspector (§68) | **Built in Slice 12.** [`state-inspector-page.ts`](../../../apps/web/src/app/prototype/dev-panel/state-inspector-page.ts) renders §46's controls plus the per-project layout experiment. This slice verifies it; it builds nothing. |
| Component tests for TaskRow completion, section collapse, section configuration, dashboard widget states | **All four exist.** `task-row.spec.ts:37`, `project-section-frame.spec.ts:151`, `project-section-frame.spec.ts:181`, and `dashboard-page.spec.ts:142/158/164/171`. §69 is satisfied; this slice adds only the tests its own new code earns. |
| Seed `docs/decisions/` with the first entry — flow-vs-grid | **Done long ago.** 40 entries exist, including [`2026-08-flow-vs-grid-layout-experiment.md`](../../decisions/2026-08-flow-vs-grid-layout-experiment.md) in the §78 format. |
| Design Lab at `/prototype/design` | A placeholder component that says Slice 17 will replace it. Real work. |
| Storybook | Does not exist. Real work. |
| The two e2e tests | Do not exist. Real work. |

**The bullet the list does not contain, and this slice cannot avoid.** *Done when* is
"every §81 checklist item is demonstrable". An audit of §81 against the running application
found three items that are not:

- **create project** — the only caller of `projects.create` in the web app is
  [`sub-projects-store.ts:67`](../../../apps/web/src/app/features/projects/sections/sub-projects/sub-projects-store.ts),
  which hard-codes `parentProjectId`. There is no UI anywhere that creates a *top-level*
  project, and no `/projects` route to put one on.
- **edit project** — the header renders name, status and target date read-only and §26's
  "More" control is `disabled` with a comment saying the slice that builds it will enable
  it ([`project-page.html:70`](../../../apps/web/src/app/features/projects/project-page.html)).
  The only project fields any UI writes are `progressFormula`/`manualProgress` and
  `projectLayoutMode`.
- **archive project** — domain `ProjectService.archive` exists and `PATCH /api/projects/:id`
  already runs the archive path through `status: 'archived'` (with the active-children guard
  at `project-service.ts:134`), but no gateway method and no control reach it.

Everything else on §81 is demonstrable today. The two groups most likely to hide a gap were
checked bullet by bullet: **Dashboard**'s five (today, upcoming, projects, AI digest, fun
fact) are all real widgets in `features/dashboard/widgets/registry.ts:38-44`, which registers
seven, and **Prototype Tools**' four (seeds, fake date, fake latency, persona switcher) are
all in the development panel. Those two groups are owed a walkthrough entry, not code.

The web e2e test also *requires* project creation — "load seed → create project → create
task" cannot be written without it — so this is not scope creep discovered late; it is the
slice's own acceptance depending on it.

**`development.md` is edited in this same change** to say so (AGENTS.md §2 rules 1 and 6):
the four delivered bullets are marked as such, and project create/edit/archive is added to
the *Build* list where it belongs.

---

### Acceptance check

Executable in this order. Steps 1–3 are automated; 4–8 are the hands-on §77 pass.

1. **A fresh resolve, then the frozen one.** Delete `node_modules` *and* `pnpm-lock.yaml`
   and run plain `pnpm install`: this is the only check that exercises resolution, and so
   the only one that proves decision 1's `minimumReleaseAgeExclude` entries are complete
   (`--frozen-lockfile` installs from the lockfile and never consults `minimumReleaseAge`).
   Then restore the committed lockfile and confirm `pnpm install --frozen-lockfile` from a
   deleted `node_modules` succeeds, which proves the lockfile committed by this slice
   matches the manifests. Then `pnpm test`, `pnpm lint`, `pnpm build` green. `pnpm build`
   reports the initial bundle against its budget (decision 7 — a raised number is a decision
   entry, not a silent edit).
2. `pnpm e2e` green from a clean checkout with **no `pnpm dev` running**: Playwright starts
   its own web and host processes, the host against the repo-root `.prototype/e2e-data.json`,
   and both specs pass. Running it a second time immediately also passes — each spec seeds
   the host itself, so the run is idempotent and never depends on leftover state.
   `git status` is clean afterwards, which proves the e2e data file and Playwright's own
   `test-results/` and `playwright-report/` all landed where the `.gitignore` entries expect,
   and not inside `apps/prototype-host/`.
3. `pnpm storybook:build` produces a static Storybook without errors, and
   `pnpm --filter web storybook` serves it. Every story in the two §4 sets renders in both
   the dark and light toolbar themes.
4. **Create a project from nothing.** On the `empty` seed the sidebar reads "No projects
   yet" and offers **New project**. Creating *Prototype review* navigates to its page, the
   sidebar shows it, and `.prototype/data.json` holds one project with
   `status: "planning"`, `projectLayoutMode: "flow"` and no sections. With the host stopped,
   the same attempt shows an error **beside the form** while the existing project tree stays
   rendered.
5. **Edit and archive it.** The header's **More** menu renames it, sets a target date, then
   clears it back to "No target date", and sets a status; each write shows in the header
   without a reload and survives one. Opening **More** closes the Quick add menu and vice
   versa — the two never overlap. With the host stopped, a failed rename shows its error
   **in the header, with the header still rendered** — not the full-page "Project
   unavailable" state. **Archive** asks for confirmation; cancelling writes nothing and
   stays put. Confirming removes it from the sidebar and leaves the page on `/app`.
   `data.json` shows `status: "archived"` and a `project.archived` activity row. Archiving a
   parent that still has an active child is refused with the domain's own message shown in
   the UI.
6. **Design Lab.** At `/prototype/design`, each of §22's seven controls — radius, spacing
   density, surface contrast, accent, font scale, elevation, sidebar width — visibly changes
   the catalogue *and* the surrounding shell as it moves, **in both themes**: the check is
   run once in dark and once in light, because the two theme blocks define these tokens
   separately (decision 3). Surface contrast moves **downward only** from its default, which
   sits at the top of its range by construction — that is stated in the control's own label,
   so a reviewer is not left wondering why dragging up does nothing. Navigating to `/app` and
   to a project page keeps the changed values, and returning to `/prototype/design` shows the
   control rail still holding them. **Reset** returns every token to its stylesheet value —
   verified by switching theme after a reset and seeing the theme's own accent, not the other
   theme's. A full page reload also returns to defaults (session-only, like the theme). Every
   state panel — empty, loading, error — shows the real component's real state.
7. **Storybook.** `TaskRow` shows Normal, Overdue, Completed, High Priority, Selected and
   Compact — six, not §4's seven; see decision 8 for the missing *Agent Modified*.
   `ProjectSection` shows Full Width and Half Width **at visibly different widths**,
   Collapsed and Editing, plus the Empty and Loading states of a content component inside
   the frame. Controls change a story live; the completion `play` function passes in the UI
   runner.
8. **The §81 walkthrough** in [`docs/guides/first-milestone-walkthrough.md`](../../guides/first-milestone-walkthrough.md)
   is executed end to end, in a browser, in one sitting, on the seeds it names — including
   the MCP items through a real client. Its gate is concrete: the document contains **at
   least one numbered step per §81 bullet across all eight groups** — Workspace, Projects,
   Project Canvas, Sections, Tasks, Dashboard, MCP, Prototype Tools — each naming the seed it
   needs and the observable result, and a reader who has never seen the application completes
   every one without asking a question. Every item is ticked or the slice is not done.
   Friction goes to `.prototype/notes.json` (§79).

---

### Design decisions this plan makes

#### 1. Storybook runs on `@storybook/angular-vite`, not `@storybook/angular`

Storybook 10.5.10 ships two Angular frameworks. The stable one is webpack-based and lists
`@angular-devkit/build-angular` and `zone.js` as **non-optional** peers. This repository has
neither: `angular.json` uses `@angular/build:application`/`:dev-server`/`:unit-test`, and
the app is zoneless. Adopting it would install a second, contradictory build system in order
to render components the first one already builds.

`@storybook/angular-vite` peers on `@angular/build >=21 <23` (we are on 22.1.6) and makes
`zone.js` and `@angular/cli` optional. Angular 22 support landed in Storybook **10.5.0** and
TypeScript 6 in **10.5.1**, with the peer-range fix in **10.5.3** — so the dependency is
pinned `>=10.5.3`. Those three version numbers come from upstream release notes and are
**confirmed at install**, not taken on trust; if they are wrong, the fallback below applies.

**The dependency cost is nine packages, not two, and that is stated up front** because it is
what decision 1 is trading against. pnpm's isolated `node_modules` does not hoist, so every
non-optional peer must be a *direct* devDependency of `apps/web`, even though the lockfile
already contains it transitively via `@angular/build`: `storybook`,
`@storybook/angular-vite`, `@storybook/addon-themes`, `vite`,
`@analogjs/vite-plugin-angular`, `@angular/animations`, `@angular-devkit/core`,
`@angular-devkit/architect`, plus `sass` (Vite needs it resolvable from the project for
`preview.ts`'s stylesheet import). `@types/node` is added too, but as decision 2's
requirement rather than a Storybook peer — `tsconfig.storybook.json` is its only consumer.

Each is added to `pnpm-workspace.yaml`'s `minimumReleaseAgeExclude`, the way
`@angular/build@22.1.6` already is: pnpm 11 defaults `minimumReleaseAge` to 1440 minutes, and
Storybook's weekly patch cadence means a fresh resolve otherwise silently picks an older
version or fails outright against Storybook's exact-version internal peer pins. **The
existing entries are exact versions while decision 1 pins a range**, so the exclude list has
to be regenerated whenever that range resolves forward. That is a real maintenance cost and
the decision entry says so.

It is labelled **preview**. That is an accepted risk and the reason for the fallback, not a
reason to take the webpack path — Storybook's own guidance is to use webpack only for
Angular ≤ 20 or unmigratable webpack config, and neither applies here.

**Fallback, decided in advance:** if angular-vite cannot render a story that the application
renders, the slice does **not** install the webpack toolchain. It records the failure in
`docs/decisions/`, ships the Design Lab (which covers the same components inside a real
Angular application), and defers Storybook to its own slice. Storybook is a development
convenience; a second build system in a prototype is a permanent tax.

**Story format is unaffected either way** — CSF, `applicationConfig`, `moduleMetadata` and
`play` are identical across the two frameworks, so stories written now survive a framework
change.

**`@storybook/addon-vitest` is out of scope.** It requires Vitest browser mode and
`@vitest/browser-playwright`, which pins vitest to an exact version and would drag the whole
workspace off `vitest@4.0.8`; Angular's `unit-test` builder has its own config story, and
merging the two invites the duplicate-`@angular/core/testing` bundle failure. `play`
functions run in the Storybook UI without it. Headless story tests are a later slice's
question, if anyone misses them.

#### 2. Stories live beside their components, and something type-checks them

`*.stories.ts` files sit next to the component (§65: feature code owns its own components).

They would not reach the application bundle in any case — `@angular/build:application`
bundles from `main.ts`'s import graph, and nothing imports a story. What
`tsconfig.app.json` needs the `src/**/*.stories.ts` exclude for is the *type-check*:
`pnpm lint` runs `tsc --noEmit -p tsconfig.app.json` with `"types": []`, and stories would be
checked there against a config that cannot resolve `@storybook/angular`. `tsconfig.spec.json`
needs no change — it includes only `*.spec.ts` and `*.d.ts`, so stories were never in it.

Excluded from the app config, a story is then type-checked by nothing — so a third
`tsc --noEmit` is added over a new `tsconfig.storybook.json`, covering `.storybook/**` and
`src/**/*.stories.ts` with `"types": ["node"]` (`.storybook/main.ts` uses `node:path` and
`import.meta.url`; this is why `@types/node` is added at all). Note `tsconfig.base.json` sets
`noUnusedLocals`/`noUnusedParameters`: `play` functions must destructure only the context
members they use, or the new pass fails.

A story that no longer compiles against its component is broken either way; this is what
makes it fail in CI instead of six weeks later in a browser. The same argument applies to
`apps/e2e`, which gets its own `lint` script for the same reason (decision 6).

#### 3. The Design Lab writes *knobs*; the token file is restructured around them

§22 wants radius, spacing density, surface contrast, accent, font scale, elevation and
sidebar width changeable live "without rewriting component CSS". Three of those seven —
radius, spacing, font scale — are not single tokens but *scales*; one — surface contrast — is
a relationship between colours; and one — elevation — is a multi-length shorthand that no
multiplier can scale from outside.

So `_tokens.scss` (the one file permitted literals, §21) is restructured. Each theme block
keeps only its **base literals**, and the derived expressions live once under bare `:root`:

```scss
:root {
  --knob-radius-scale: 1;
  --knob-space-scale: 1;
  --knob-font-scale: 1;
  --knob-elevation: 1;
  --knob-surface-contrast: 100%;

  /* Base literals. The light block overrides these, and the derivations below follow. */
  --color-background: #14161a;
  --surface-base: #1b1e24;
  --surface-raised-base: #23272f;
  --surface-sunken-base: #101216;
  --shadow-color-sm: rgb(0 0 0 / 40%);
  --shadow-color-md: rgb(0 0 0 / 45%);

  --space-4: calc(1rem * var(--knob-space-scale));
  --radius-md: calc(0.5rem * var(--knob-radius-scale));
  --font-size-md: calc(0.9375rem * var(--knob-font-scale));
  --shadow-sm: 0 calc(1px * var(--knob-elevation)) calc(2px * var(--knob-elevation)) var(--shadow-color-sm);

  --color-surface: color-mix(in oklab, var(--surface-base) var(--knob-surface-contrast), var(--color-background));
  --color-surface-raised: color-mix(in oklab, var(--surface-raised-base) var(--knob-surface-contrast), var(--color-background));
  --color-surface-sunken: color-mix(in oklab, var(--surface-sunken-base) var(--knob-surface-contrast), var(--color-background));
}
```

**Three properties this structure has to have, each of which a review round caught missing.**

- **Both themes, once.** The first draft put the derivations under bare `:root` while
  `:root[data-theme='light']` (`_tokens.scss:66`) re-declares `--color-surface`,
  `--color-accent` and both shadows as literals at higher specificity — so surface contrast
  and elevation would have been silent no-ops in light. Reducing the theme blocks to base
  literals fixes it once instead of duplicating expressions.
- **Whole families, not one member each.** All six `--space-*`, three `--radius-*`, four
  `--font-size-*`, both `--shadow-*` — **and all three `--color-surface*`**. The surface
  family is the sharpest case: in light theme `--color-surface` and `--color-surface-raised`
  are both `#ffffff` today, so converting only the first would make raised cards stop lifting
  off the page as the knob moved. A knob that moves one member of a family looks broken.
- **Appearance is unchanged at the defaults.** `color-mix(in oklab, X 100%, Y)` is `X`
  round-tripped through oklab, which is exact at 8-bit output, and every `calc()` multiplies
  by 1. The restructure is a refactor; the application must look identical before and after,
  and that is checked by eye in both themes before any control is wired.

**Two honest limits, stated rather than papered over.**

- **Surface contrast is one-directional.** `color-mix()` clamps its percentage to `[0%, 100%]`
  and the default sits at `100%`, so the knob can only reduce contrast from today's value.
  Moving the default down into the middle of a range would mean shipping a different-looking
  application, which the refactor rule above forbids. The control is labelled with its
  direction and the decision entry records the trade.
- **The rest of the accent family stays per-theme literal, and does not track the knob.**
  `--color-accent-contrast` is `#0b1220` in dark and `#ffffff` in light — near-black on a
  light blue, white on a mid blue. **No single `color-mix` against the accent produces
  both**, so an earlier draft's promise to derive it was not implementable without changing
  one theme's appearance. `--color-accent-surface` (`#202f48` dark, `#eff4ff` light) has the
  same problem for the same reason: the two are mixed at visibly different strengths, so one
  shared percentage cannot reproduce them.

  Both therefore remain literals in each theme block, and the consequence is stated plainly
  rather than discovered in the browser: **the accent knob moves `--color-accent` alone.**
  Accent-tinted surfaces and accent-on-text pairings keep their current colours, so dragging
  the accent far enough *can* produce poor contrast on accent-filled controls and a tint that
  no longer matches its accent. This is the one place the plan knowingly breaks its own
  "whole families" rule, because the alternative is changing how the application looks today.
  It is acceptable in a design lab whose entire purpose is showing what a token choice does,
  and it is exactly the kind of finding §78 exists to capture — the decision entry records it
  as the first candidate for a follow-up slice.

**The percent sign is part of the value.** `--knob-surface-contrast` must be written as
`"100%"`, not `100`. A bare number makes the whole `color-mix()` invalid at computed-value
time and every surface in the application goes transparent at once — so
`design-lab-tokens.ts` carries a `unit` per control, the store concatenates it on write and
parses it on read, and the store spec asserts the written **values**, not merely the property
names.

**The lab holds no design literals.** `design-lab-tokens.ts` needs a starting position for
the accent and sidebar-width controls, and hard-coding `#6ea8fe` would be a design value
outside the one file §21 permits — invisible to `check-design-tokens.mjs`, which only
inspects `styles`/`template` initialisers in `.ts` — *and* wrong in light theme. Instead the
control reads its current value from `getComputedStyle(documentElement)`, and **Reset removes
the inline property** rather than writing a default back, letting the stylesheet win. That is
theme-correct for free: reset in dark, switch to light, and the light accent appears. The
numeric knobs' defaults (`1`, `100%`) are structural constants of the knob layer itself, not
design values, and stay in the table.

Three details that read-back carries, since an implementer would otherwise meet them one at a
time in the browser: an unregistered custom property returns its **declared text**, so
`--color-accent` comes back `#6ea8fe` (feeds `<input type="color">`) and
`--layout-sidebar-width` comes back `15rem`, **not** pixels (split against the table's `unit`
for the slider); the value **must be `.trim()`ed**, because a preserved leading space silently
resets a colour input to black; and under jsdom no stylesheet is loaded, so the read returns
`''` and each control falls back to rendering as untouched. The rail re-reads these two values
after a reset and on a theme change, so it never displays the other theme's accent.

**`DesignLabStore` is `providedIn: 'root'`, and does not hydrate.** A page-provided store
would be destroyed on navigation, so the control rail would come back showing defaults while
the shell still rendered the old knobs — the contradiction acceptance step 6 exists to catch.
As a root singleton it is the only writer and is never destroyed, so it always holds its own
values and a hydration path would have no caller. §20 objects to one global store that owns
the application's data; this owns seven numbers, is development-only, and follows
`DevPanelStore` (`dev-panel-store.ts:29`), which is already a root-provided prototype store in
the same folder. Every `features/` store stays page-provided.

**Session-only, and deliberately global.** Values persist across navigation and are lost on
reload, matching
[`theme-selection-is-session-only`](../../decisions/2026-08-theme-selection-is-session-only.md):
§61 defines no route that stores them, and inventing persistence for a knob you are turning in
order to *look at something* is backwards. Global rather than route-scoped because seeing the
accent change on the dashboard is the entire experiment.

`ThemeService` is not touched. It owns `data-theme`; the lab owns inline custom properties;
they compose without either knowing about the other, and a theme switch mid-experiment keeps
the knobs.

**One deviation from §22's wording, stated plainly:** §22 frames the Design Lab as a third
*theme* alongside Dark and Light. It is built as a route with live knobs instead, because §67
defines it as a route and because a knob that only applied inside its own theme could not
answer "what does this accent look like on the dashboard".

#### 4. The catalogue shows real components, and says so where it cannot

§67 lists buttons, inputs, task rows, cards, project cards, widgets, section frames,
navigation, drawers, menus, and the empty/loading/error states. **Most of those do not exist
as components** — they are token-styled markup inside features, and the repository has exactly
one shared component (`PlaceholderPage`). Extracting a component library is a plausible
project and is not this slice; doing it here would rewrite most of the application under the
banner of a development page.

The catalogue therefore has two kinds of panel, visibly labelled:

- **Live component panels** — `TaskRow`, `ProjectSectionFrame`, `DashboardWidgetFrame`, the
  sidebar (§67's *navigation*), the task drawer (§67's *drawers*), and the activity feed: the
  real components, driven by fixtures, with their real empty, loading and error states.
- **Primitive panels** — buttons, inputs, cards, **project cards**, menus: representative
  markup carrying the same token-based classes the features use, each marked *not yet a shared
  component*. Project cards get their own panel rather than folding into "cards", because §67
  names them separately and the markup genuinely differs — the shapes to copy are the
  `active-projects` widget rows and the sub-projects section rows.

That distinction is the useful output. A primitive panel everybody keeps re-styling is
evidence for extracting it, and §78 is where that evidence goes.

**The lab injects no gateway, and the section panel is what makes that true.** The four other
live components are already fully presentational — `ActivityFeed`, `TaskDetailDrawer`,
`DashboardWidgetFrame` and `Sidebar` all take inputs and inject nothing. `ProjectSectionFrame`
is the exception: it renders `definition.component` dynamically, and a *real* registry
definition's content component injects a store that injects the gateway. So the panel renders
the frame with the **same stub content definition the story set uses**, not a registry entry.
Fixtures are plain contract objects from a single `design-lab-fixtures.ts`, and the page's
boundary test provides **no `WORK_MANAGER_GATEWAY` at all** — if anything in the tree reaches
for it, DI throws and the test fails, which is a stronger claim than a gateway that rejects.

**`ProjectSectionFrame` needs its canvas wrapper to mean anything.** The frame writes only
`[attr.data-column-span]`; the actual width comes from `.section-canvas--flow
.section-canvas__item--span-N` in `project-page.scss:177-208`, applied by `ProjectPage` to a
wrapper element, in *that* component's emulated-encapsulation stylesheet. A bare frame shows
no width difference at all. So both the Design Lab panel and the Storybook story set render
the frame inside a small shared wrapper that reproduces the canvas classes and carries those
styles. Without it, "Full Width" and "Half Width" are pixel-identical and the variant set is a
lie.

**Per-component style budget.** `angular.json` sets `anyComponentStyle` to a 5 kB warning and
an **8 kB error**. One stylesheet for a control rail plus every catalogue group would exceed
it and fail the build outright — which is the reason the panels are separate components with
their own small stylesheets, not merely a tidiness preference.

#### 5. Project create / edit / archive: the smallest surface that satisfies §81

- **Create** lives in the sidebar, beside the "Projects" group header: a **New project**
  button opening a one-field inline form (name). Everything else takes a contract default —
  §26 and §33 give a project ten optional fields, and a creation dialog asking for all of them
  is the kind of form this prototype exists to avoid.
  **The markup needs care:** the group header *is* a `<button>` (`sidebar.html:11-20`), so the
  new control cannot nest inside it — the toggle and the New project button go into a flex
  wrapper as siblings, and the button sits **outside** the `@if (projectsExpanded())` region so
  it is reachable with the group collapsed.
  `Sidebar` stays **presentational**: it emits `createRequested(name)` and `AppShell` asks
  `ShellStore`, which owns the gateway and already holds `identity.workspace.id`. A component
  reaching for a gateway here would be the first crack in §19's chain.
- **The create failure gets its own signal.** `sidebar.html` renders its existing error as
  `@if (error()) { … } @else if (empty) { … } @else { <ul class="projects"> }` — the notice
  *replaces* the tree. Routing a failed creation onto it would wipe every project from
  navigation because one write failed. So `ShellStore` exposes a separate `createError`,
  rendered beside the form as `data-create-error`, and the tree stays put. **A null identity
  goes there too**: `identityState` stays `null` when `/api/me` rejects, and "create a project
  in *which* workspace" has no answer then; that is a message beside the form, not a crash.
- **Edit** and **archive** live behind §26's **More** control on the project header, which the
  spec already names and which Slice 8 left disabled for exactly this reason. The menu holds
  Rename, Status, Target date (settable *and* clearable — the header has a "No target date"
  branch that nothing currently exercises), and Archive. **More and Quick add are mutually
  exclusive**: both render popovers into the same `project-header__actions` row, so opening
  either closes the other, and both close on Escape.
  **The Status control offers four values, not five.** `ProjectStatusSchema` is
  `['planning','active','on_hold','completed','archived']`, and `ProjectService.update` runs
  the full archive path — `assertNoActiveChildren`, a `project.archived` activity row — on any
  transition into `archived` (`project-service.ts:136`). A Status menu built naively from the
  enum would therefore archive the project with no confirmation and leave the user on a page
  that had just vanished from the sidebar. Status offers the four non-archived values; Archive
  is the only route to the fifth, and it confirms.
- **The project-write error needs a third signal, for the same reason the sidebar did.**
  `errorState` renders *instead of the whole page* (`project-page.html:3-7`) — a failed rename
  must never land there. `sectionErrorState` is cleared by every successful quiet re-read
  (`project-page-store.ts:199-200`), so a message parked there can vanish milliseconds later.
  So `ProjectPageStore` gains `writeError`, rendered in the header, and the test asserts the
  **header is still rendered** beside it.
- **Optimistic project writes must defer the live re-read, exactly as section writes do.**
  This is the defect the second review round found, and it is the same class as the four
  commits that closed Slice 16. `onLiveEvent` routes any `project.*` event naming this project
  into `refreshProject()` (`project-page-store.ts:111-142`), which replaces `projectState`
  wholesale from `gateway.projects.get` (`:193-197`).

  **The deferral machinery already exists and already covers this read.** `pendingSectionWrites`
  gates `refreshProject()` at three sites — the pre-dispatch check in `onLiveEvent` (`:137`),
  the early return at the top of `refreshProject()` (`:174-177`), and the `do…while`
  continuation (`:206-210`) — and `writingSections` (`:482-491`) increments it and drains the
  queued refresh in its `finally`. What is missing is only that **project writes never
  increment it**, so an optimistic rename is overwritten by the frame its own write produces,
  or by any agent write landing in the same window.

  The counter is therefore renamed `pendingWrites` and incremented by a new `writingProject`
  alongside `writingSections`, rather than adding a second counter that every one of those
  three sites would have to consult separately. One counter, one drain, three unchanged check
  sites. On success the write re-asserts the server's returned record instead of trusting the
  optimistic paint — guarded by the store's existing staleness idiom
  (`generation === loadGeneration && projectState()?.id === projectId`), so a write that lands
  after the route moved on writes nothing.
- **No new gateway method, no new host route.** `PATCH /api/projects/:id` with
  `status: 'archived'` already runs the domain's archive path, including
  `assertNoActiveChildren` and the `project.archived` activity row. Adding
  `ProjectGateway.archive` would be a second way to say the same thing, and matches
  [`gateway-surface-grows-with-implementations`](../../decisions/2026-08-gateway-surface-grows-with-implementations.md).
  **`work-manager-gateway.ts`'s own comment is amended in this change** — it currently promises
  that "`create`/`update`/`archive` arrive with the UI that writes", and after this slice that
  is no longer what happens.
- **Archive confirms**, because it is the one destructive control on the page and it removes
  the project from the surface you are standing on. Cancelling writes nothing and navigates
  nowhere — that path gets its own test. On success the sidebar drops the project through
  `SIDEBAR_STATUSES`, which already excludes archived. Refusal (active children) surfaces the
  domain's message verbatim — the §53 lesson that a named reason beats "forbidden".
- **Stores decide; pages navigate.** `ProjectPageStore.archive` returns an outcome and
  `ProjectPage` routes to `/app`; `ShellStore.createProject` returns the new id and `AppShell`
  routes to it. Only `DevPanelStore` injects `Router` today, and this slice does not spread
  that.

Rename, status and target date are optimistic per §63; archive waits, because it navigates.

#### 6. End-to-end: Playwright, its own config, its own data file

**Playwright over Cypress**, on one deciding property: `webServer` takes an *array*, and this
prototype is two processes. Cypress has no equivalent, so it would mean hand-rolling
orchestration. Playwright also publishes no install scripts, so pnpm 11's `allowBuilds` gate is
untouched, and browsers arrive through an explicit `pnpm exec playwright install chromium`.

**Not `ng e2e`, and not `playwright-ng-schematics`.** Angular ships no e2e implementation and
endorses no tool; the schematic's builder starts exactly one dev server, which cannot express
this repo's shape. A plain `playwright.config.ts` invoked by `pnpm e2e` is less machinery and
more honest.

**The suite lives in `apps/e2e` as its own workspace package**, and its script is `e2e`,
**not** `test` — `pnpm test` runs `pnpm -r --if-present test` and must stay fast, offline, and
green without browsers installed. It *does* get a `lint": "tsc --noEmit"`, so `pnpm lint`
type-checks the specs; decision 2's argument applies here identically. A root `pnpm e2e` runs
it.

Four mechanical details that a first draft got wrong and that the config must get right:

- **`cwd`.** `webServer.cwd` defaults to the config file's directory, so `pnpm dev:host` would
  resolve against `apps/e2e/package.json` and die with `ERR_PNPM_NO_SCRIPT`. Both entries name
  the package directly — `pnpm --filter @cwm/prototype-host start` and `pnpm --filter web
  start` — and `start` rather than `dev`, because the host's `dev` is `tsx watch` and a file
  watcher inside an e2e run is a source of spurious restarts.
- **`CWM_DATA_FILE` must be absolute.** The host does `resolve(override)` against *its own* cwd
  (`persistence/store.ts:28`), which is `apps/prototype-host`. A relative
  `.prototype/e2e-data.json` would silently create a second data directory inside the host
  package — the exact trap that file's comment warns about — and the root `.gitignore` entry,
  being slash-anchored, would not even hide it. The config computes an absolute repo-root path
  with `fileURLToPath(new URL('../../.prototype/e2e-data.json', import.meta.url))`.
- **`reuseExistingServer: false` on both entries**, which throws on a port already in use
  rather than hanging. A developer with `pnpm dev` up gets a loud conflict and a message telling
  them to stop it — the right failure. Silently reusing a dev server would mean an e2e run that
  destroys the workspace you were just using.
- **`url` uses `127.0.0.1`, not `localhost`**, because the host binds `127.0.0.1` only and the
  readiness probe should not depend on Node's `::1` fallback. This does not touch
  `PROTOTYPE_API_BASE_URL`, which is a browser fetch and stays as it is — e2e moves the data
  file, not the port, so §10's single-address rule is untouched.

**No *workspace* package imports; npm dependencies are declared normally.** The first draft had
`apps/e2e` depend on `@cwm/prototype-data` for `tokenFor`. That package is source-only
(`exports` points at `src/index.ts`), every current consumer runs it under `tsx` or Vitest, and
Playwright does not transpile dependencies reached through `node_modules`.
`prototype-user-a-readwrite` is a spec-verbatim string that `agent-tokens.ts` says is meant to
be pasted; the spec inlines it with a comment pointing at that file.
`@modelcontextprotocol/client` is a different matter — it is a published npm package, it is
currently a devDependency of the host only, and pnpm will not surface it in `apps/e2e`, so it
**is** declared there.

Each spec calls `POST /prototype/seed` and `POST /prototype/clock` against the host before
navigating, so it depends on no leftover state and the clock-driven dashboard is deterministic.
That machinery is Slice 12's and needs nothing new.

**Web spec** (§69): seed `empty`, clock pinned to **mid-day UTC** → create a project from the
sidebar → open it → click **Edit layout** (Quick Add renders only under
`@if (store.editMode())`) → add a Task List section → create a task → set its due date in the
drawer to the **hard-coded `YYYY-MM-DD` matching the pinned clock** → `/app` shows it under
Today. The date is hard-coded rather than derived from `new Date()`: the drawer writes
`${date}T23:59:59.999Z` and `DashboardService` compares UTC days, so on a machine west of UTC a
locally-derived date lands the task in Overdue instead. Mid-day UTC keeps the two unambiguous.

**MCP spec** (§69): seed `agent-heavy`, **`project-work-manager`** open — it is the only project
in that seed carrying a `recent-activity` section, so it is named rather than assumed → a real
`@modelcontextprotocol/client` over Streamable HTTP calls `create_task` with
`{ projectId, title }` and `Authorization: Bearer prototype-user-a-readwrite` → the task appears
in the open page **without a reload** (Slice 16's stream) → Recent Activity attributes it to
*Claude*. The spec **waits for the `/prototype/events` stream to be open** before firing the
tool call; `page.goto` resolving does not mean the SSE handshake completed, and without that
wait the test is flaky rather than wrong. §69 calls this one of the most important tests in the
prototype, so it uses a real client over the real transport, not a `fetch` shaped like one.

#### 7. Bundle budget

Slice 12 pushed the initial bundle to 797 kB against a 725 kB warning, and its note says quietly
raising the number each slice is how the number stops meaning anything.

**Lazy-loading `/prototype/design` and `/prototype/state` will not fix that, and the plan does
not pretend otherwise.** `App` mounts `<app-dev-panel />` globally (`app.ts:19`) so the chord
reaches every route, and `DevPanel` imports the same `DevPanelControls` that
`StateInspectorPage` does — so the panel, its controls, its store and the layout control stay
eager whatever the routes do. Lazy-loading `/prototype/state` moves only its page and store. The
Design Lab's own page, panels and fixtures do move out, but its live-component panels reuse
components already eager through the feature routes. The realistic outcome is that the initial
bundle lands near today's number rather than meaningfully below it.

It is still worth doing — it keeps the *new* catalogue out of the initial graph, which is the
part this slice controls — and the eager-by-design comment in `app.routes.ts` is updated to say
why these two routes are the exception. **The budget is then set deliberately, in
`docs/decisions/`, with the measured number and the reason** — a planned deliverable of this
slice, not a contingency. Lazy-loading the dev panel itself is the next lever and is explicitly
*not* pulled here: it changes how §46's chord reaches every route, which is a Slice 12 decision
this slice has no business reopening.

#### 8. §4's *Agent Modified* TaskRow variant is not built, and that is recorded

§4 names seven TaskRow variants. Six exist as real states. **Agent Modified has no data behind
it**: `TaskRow`'s inputs are `task`, `selected`, `compact`, `pending`, `now`; and
`packages/contracts/src/task.ts` carries no actor attribution — who changed a task lives on
`ActivityFeedEntry`, not on `Task`.

Adding an `agentModified` input would mean inventing attribution on the task record, which is a
product question, not a story. Slice 16's own §79 note already asked it — *"whether [agent
actions] need attribution at the point of change … Worth a Slice 22 experiment"* — and §58's
confirmation experiments are where it belongs.

So the story set ships six variants and a **decision entry records the deviation** with that
reasoning, rather than the plan quietly counting to six against a spec that says seven.

---

### File-level change list

#### A — §81 gap closure

| File | Responsibility |
|---|---|
| `apps/web/src/app/core/shell/sidebar/sidebar.html` · `sidebar.ts` | **New project** control in a flex wrapper beside (not inside) the group toggle and outside the expanded region; inline name form; `data-create-error` notice **beside the form** so a failed write never replaces the tree. Emits `createRequested`; injects nothing. |
| `apps/web/src/app/core/shell/app-shell.html` · `app-shell.ts` | Wires the sidebar's output to `ShellStore.createProject` and navigates to the returned id. |
| `apps/web/src/app/core/shell/shell-store.ts` | `createProject(name)`: `projects.create` with `identity.workspace.id`, re-read, return the new id. Failure — including an unresolved identity — sets a **separate** `createError` signal. |
| `apps/web/src/app/features/projects/project-page.html` · `project-page.ts` | Enables §26's **More** menu: Rename, Status, Target date (set and clear), Archive + confirmation. Mutually exclusive with Quick add. Renders `writeError` in the header. Owns the post-archive navigation. |
| `apps/web/src/app/features/projects/project-page-store.ts` | `rename`, `setStatus`, `setTargetDate` (optimistic, §63) and `archive` (awaited, returns an outcome; no `Router`). All through `projects.update`, all inside a new `writingProject` deferral mirroring `writingSections`, plus a `writeError` signal distinct from `errorState` and `sectionErrorState`. |
| `apps/web/src/app/core/gateway/work-manager-gateway.ts` | Amend `ProjectGateway`'s comment: `archive` is deliberately not added; `update` carries it. |
| `apps/web/src/app/features/projects/project-page.scss` · `sidebar.scss` | Menu and form styling, tokens only. |

#### B — Design Lab

| File | Responsibility |
|---|---|
| `apps/web/src/styles/_tokens.scss` | Decision 3's restructure: theme blocks reduced to base literals; **all six `--space-*`, three `--radius-*`, four `--font-size-*`, both `--shadow-*` and all three `--color-surface*`** expressed through knobs, once. Appearance identical at the defaults. |
| `apps/web/src/app/prototype/design-lab/design-lab-tokens.ts` | The seven controls as data: id, label, CSS property, range, **unit**, and whether the default is a structural constant (`1`, `100%`) or read live from the stylesheet (accent, sidebar width). No design literals. |
| `apps/web/src/app/prototype/design-lab/design-lab-store.ts` | `providedIn: 'root'`. Writes value+unit to `documentElement.style`; `reset()` **removes** each property in `DESIGN_LAB_TOKENS` so the stylesheet wins. Injects no gateway. |
| `apps/web/src/app/prototype/design-lab/design-lab-page.ts` · `.html` · `.scss` | Replaces the placeholder: control rail + catalogue. Styles stay small — 8 kB per component stylesheet is a hard build error. |
| `apps/web/src/app/prototype/design-lab/design-lab-fixtures.ts` | Plain contract objects for every panel, and the stub section-content definition shared with the story set. No gateway, no host. |
| `apps/web/src/app/prototype/design-lab/section-canvas-frame.ts` | The shared wrapper reproducing `.section-canvas--flow/--grid` + `--span-N`, so a section frame has a width outside `ProjectPage`. Used by the panel **and** the story set. |
| `apps/web/src/app/prototype/design-lab/panels/*.ts` | One small component per catalogue group — live-component panels and primitive panels (buttons, inputs, cards, **project cards**, menus), each labelled with which kind it is. |
| `apps/web/src/app/prototype/design-lab/design-lab-store.spec.ts` · `design-lab-page.spec.ts` | The two new specs of the test plan. Every other spec it names already exists. |
| `apps/web/src/app/app.routes.ts` | `prototype/design` and `prototype/state` become lazy; the eager-by-design comment gains its stated exception and its honest limit. |

#### C — Storybook

| File | Responsibility |
|---|---|
| `apps/web/.storybook/main.ts` | `framework: '@storybook/angular-vite'`, `stories: ['../src/**/*.stories.ts']`, `addons: ['@storybook/addon-themes']`. |
| `apps/web/.storybook/preview.ts` | Imports `../src/styles.scss`; `withThemeByDataAttribute({ attributeName: 'data-theme', defaultTheme: 'dark', themes: { dark: 'dark', light: 'light' } })`. `parentSelector` defaults to `html`, which is what `_tokens.scss`'s `:root` needs; passed explicitly so the dependency is visible. |
| `apps/web/tsconfig.storybook.json` | Type-checks `.storybook/**` and `src/**/*.stories.ts`, `"types": ["node"]`. |
| `apps/web/tsconfig.app.json` | Excludes `src/**/*.stories.ts` from the type-check (see decision 2). `tsconfig.spec.json` is untouched. |
| `apps/web/package.json` | Decision 1's devDependencies; `storybook`, `storybook:build` scripts; third `tsc --noEmit` in `lint`. |
| `pnpm-workspace.yaml` | `minimumReleaseAgeExclude` entries for the Storybook packages landed on. |
| `apps/web/src/app/features/tasks/task-row.stories.ts` | Normal, Overdue, Completed, High Priority, Selected, Compact + one `play` for completion. Six, per decision 8. |
| `apps/web/src/app/features/projects/sections/section-frame/project-section-frame.stories.ts` | Full Width (12) and Half Width (6) **inside `section-canvas-frame`**, Collapsed, Editing (`editMode`), plus Empty and Loading through the stub content definition. |
| `package.json` (root) | `storybook`, `storybook:build` pass-throughs. |

#### D — End-to-end

| File | Responsibility |
|---|---|
| `apps/e2e/package.json` | `@cwm/e2e`; `e2e` and `lint` scripts; `@playwright/test`, `@modelcontextprotocol/client`, and — because pnpm does not hoist and the `lint` script is `tsc --noEmit` over code using `import.meta.url` and `process.env` — `typescript` and `@types/node`, exactly as every other package in the workspace declares them. No workspace-package dependencies. |
| `apps/e2e/tsconfig.json` | So `pnpm lint` type-checks the specs. |
| `apps/e2e/playwright.config.ts` | Two `webServer` entries with `pnpm --filter … start`, absolute `CWM_DATA_FILE`, `reuseExistingServer: false`, `127.0.0.1` readiness URLs, chromium only, `baseURL: http://localhost:4200`. |
| `apps/e2e/seed.ts` | `seed(name)` / `setClock(iso)` helpers over `/prototype/*`, against **`http://127.0.0.1:4310`** — these run in the Node test process, where `localhost` can resolve to `::1` and fail, and copying the browser's `PROTOTYPE_API_BASE_URL` string would reintroduce the trap the `webServer` probes avoid. |
| `apps/e2e/web.spec.ts` | §69's web test, with the pinned mid-day-UTC clock and hard-coded due date. |
| `apps/e2e/mcp.spec.ts` | §69's MCP test against `project-work-manager`, waiting for the event stream before the tool call. |
| `package.json` (root) | `e2e` script. |
| `.gitignore` | `.prototype/e2e-data.json`, `apps/e2e/test-results/`, `apps/e2e/playwright-report/`. |

#### E — Living documentation

| File | Responsibility |
|---|---|
| `development.md` | Slice 17 status; *Build* list corrected per *What is already true*; project create/edit/archive added. |
| `README.md` | `pnpm storybook` and `pnpm e2e`, including "stop `pnpm dev` first" and the browser install step. |
| `docs/guides/first-milestone-walkthrough.md` | **New.** The §81 click-path — at least one numbered step per bullet across all eight groups, with the seed each needs. This is what "demonstrable" means. |
| `docs/decisions/2026-08-storybook-runs-on-the-vite-framework.md` | Decision 1. |
| `docs/decisions/2026-08-design-lab-tokens-are-session-knobs.md` | Decisions 3 and 4, including the one-directional contrast knob, the un-derivable accent contrast, and the §22 theme-vs-route deviation. |
| `docs/decisions/2026-08-agent-modified-has-no-data-behind-it.md` | Decision 8. |
| `docs/decisions/2026-08-project-create-edit-archive-surface.md` | Decision 5. |
| `docs/decisions/2026-08-e2e-owns-its-servers-and-its-data.md` | Decision 6. |
| `docs/decisions/2026-08-initial-bundle-budget.md` | Decision 7, with the measured number. |
| `AGENTS.md` | One line: Storybook and Playwright exist, and where they live. |

---

### Test plan

Written first, each named with what it proves — and each placed at the layer where its defect
would actually live. Existing suites stay green throughout.

**`shell-store.spec.ts`**
- `creates a top-level project in the persona's own workspace` — asserts `workspaceId` comes
  from identity and `parentProjectId` is absent. Proves the sidebar cannot accidentally create
  a child.
- `reports a failed creation on its own signal, leaving the tree loaded` — asserts `projects()`
  is unchanged and `error()` is still `null`.
- `refuses to create when identity never resolved` — the null-workspace path.

**`sidebar.spec.ts`**
- `emits a create request and injects no gateway` — the boundary test. Fails if anyone later
  injects `WORK_MANAGER_GATEWAY` into a presentational component.
- `refuses a blank name without emitting`.
- `renders the project tree and the create error at the same time` — the regression: fails
  against a version that routes the create failure onto the existing notice.
- `offers New project with the group collapsed`.

**`app-shell.spec.ts`**
- `navigates to the project the store created` — nothing else proves the create path ends where
  the user expects.

**`project-page-store.spec.ts`**
- `renames optimistically and reverts on failure` (§63).
- `holds off the live re-read while a project write is in flight` — the `writingProject` guard.
  Driven by dispatching a `project.updated` event mid-write and asserting the optimistic name
  survives. This is the test that would have caught the second review round's defect.
- `re-asserts the server's record when the write resolves`.
- `returns success without navigating` — the store must not know about routing.
- `surfaces the domain's refusal when a project still has active children` — asserts the message
  text, not a generic string.
- `clears a target date` — the `null` write behind the header's "No target date" branch.
- `ignores a write that resolved after the route moved on`.

**`project-page.spec.ts`**
- `keeps the header rendered while showing a failed rename` — the template-layer companion: the
  store test above cannot see that `writeError` was accidentally routed to `errorState`, which
  would blank the page.
- `opens the More menu only when it has actions, closes it on Escape, and closes Quick add when
  it opens`.
- `asks for confirmation before archiving`, and `writes nothing when the confirmation is
  cancelled`.
- `leaves the project page only after the archive resolves`.

**`design-lab-store.spec.ts`**
- `writes only the knob properties it owns, with their units` — enumerates properties **and
  values**, so a control that writes a bare `100` for a percentage fails here rather than
  turning every surface transparent in a browser.
- `reset removes every property in the token table` — asserts removal, so the stylesheet wins
  and the theme's own value returns.
- `leaves data-theme alone` — the `ThemeService` boundary.

**`design-lab-page.spec.ts`**
- `renders every catalogue panel with no gateway provided` — the boundary test: if anything in
  the tree injects `WORK_MANAGER_GATEWAY`, DI throws and this fails.
- `labels each primitive panel as not yet a shared component`.

  **What these specs deliberately do not claim.** jsdom 28 resolves neither `color-mix()` nor
  `var()` references, so no unit test here can prove the knob layer produces a different
  rendered colour — a spec reading `getComputedStyle` would pass while `--color-surface` was
  invalid and every surface was transparent in a real browser. What jsdom *does* do is store
  and return custom properties set on an element's own inline style, which is exactly what
  these assertions need. The knob layer's end-to-end proof is **acceptance step 6, in a
  browser, in both themes**; the specs assert only that the right property was set, with the
  right unit, and removed on reset.

**Stories (run in the Storybook UI, `play` where noted)**
- `TaskRow` — six variants; a `play` clicks the checkbox and asserts the completion output
  fired. Proves the story wiring, not `TaskRow` itself, whose spec already covers it.
- `ProjectSectionFrame` — six variants; Full Width and Half Width render inside
  `section-canvas-frame` and must differ visibly.

**End-to-end (`apps/e2e`)**
- `web.spec.ts` — §69's web path, ending on Today showing the created task.
- `mcp.spec.ts` — §69's MCP path, asserting the row appears **without a reload** and that Recent
  Activity names the connection.

**Verification discipline.** Every failure-path test above is checked by mutation before it is
trusted: delete the line it claims to cover and watch it fail. `.prototype/notes.json` note
`2026-08-26-003` records why — two rounds of review missed a vacuous test that this caught in a
minute.

---

### Boundaries touched

| Boundary (§1, §8, §12, §19, §70) | How this slice stays on the right side |
|---|---|
| Components depend on gateway *interfaces* | The Design Lab injects **no gateway at all** — fixtures are plain contract objects and the section panel uses a stub content definition, which the page spec proves by providing no gateway token. The sidebar stays presentational and emits an output; `ShellStore` owns the write. Stories supply dependencies with `applicationConfig`, i.e. through the same tokens. |
| Domain services know nothing of HTTP/MCP/JSON | Untouched. This slice adds no domain code — archive already exists and is reached through `PATCH`. |
| Contracts defined once | Fixtures and stories import types from `@cwm/contracts`. No story-local `interface Task`, and `apps/e2e` inlines one documented fixture string rather than importing a source-only workspace package. |
| No literal colours/spacing/radii outside `_tokens.scss` | The knob layer is *in* `_tokens.scss`, which `check-design-tokens.mjs` skips wholesale for stylesheets. Elsewhere in `src` it scans `.ts` and `.html`, and `collectFiles` skips only `*.spec.ts`, so the new panels **and the stories** are checked. The one file it could not check — `design-lab-tokens.ts`, whose literals would be in a plain object, not a `styles`/`template` initialiser — is designed to hold none: colour and length defaults are read from the stylesheet at runtime. |
| No scattered `if (prototypeMode)` | The Design Lab is a route, not a flag. |
| One gateway address (§10) | `PROTOTYPE_API_BASE_URL` is not touched; e2e moves the data file, not the port. |
| §19 `Page → Store → Gateway` | Stores return outcomes; pages navigate. No new `Router` injection in a store. |
| §20 — no global mega-store | `DesignLabStore` is a root singleton holding seven numbers, following `DevPanelStore`, which is already root-provided in the same folder. Every `features/` store stays page-provided. |
| §63 — optimistic UI | New project writes paint first and revert on failure, and defer the §62 re-read while in flight, symmetric with the existing section writes. |

---

### Explicit non-goals

From the slice's own *Do not* list and this plan's deliberate deferrals:

- **No component library extraction.** Buttons, inputs, cards and project cards stay markup;
  decision 4 says why, and the Design Lab is where the evidence for changing that accumulates.
- **No task-level agent attribution** (decision 8) — that is §58 / Slice 22.
- **No `@storybook/addon-vitest`**, no headless story tests, no visual regression.
- **No third e2e test.** §69 says keep only a few and names exactly two.
- **No project delete**, no move-to-project (Slice 20), no icon picker, no description editor.
  §81 asks for edit and archive.
- **No `/projects` index route.** §68's map does not have one, and the sidebar is the index.
- **No persisted Design Lab values**, no exported theme file, no token round-trip to the host.
- **No lazy-loading of the development panel**, which would reopen a Slice 12 decision about how
  §46's chord reaches every route.
- **No new feature flags**, and no wiring of the four inert ones.
- **No dashboard widget configuration** (Slice 23), and no calendar or work-summary widgets.

---

### Open questions

1. **Does angular-vite actually render these components?** The framework is preview, and
   decision 1's three version claims are confirmed at install rather than trusted. Resolved by
   spiking `TaskRow` as the very first story, before any other Storybook work — including the
   fresh-resolve install of acceptance step 1, to prove the peer set and the
   `minimumReleaseAgeExclude` entries. If it fails, decision 1's fallback applies and the rest
   of the slice is unaffected.
2. **Is a one-directional surface-contrast knob useful enough to keep?** Decision 3 accepts it
   rather than change the application's appearance. If it reads as broken in the browser, the
   alternatives are a differently-shaped control or dropping surface contrast from §22's list —
   both decision-entry material, judged at acceptance step 6.
3. **Does §26's More menu want Status as a menu item or as a header control?** The header already
   renders Status as a fact. The plan assumes a menu item; acceptance step 5 is where that gets
   judged, and a §78 entry records the answer either way.
4. **How far over budget does the initial bundle land?** Decision 7 expects "still over", and the
   number goes into a decision entry with the reason. The open part is only whether it *grew* —
   if the catalogue adds materially despite the lazy routes, the panels are too heavy and want
   trimming before the number is renegotiated.

---

### Revisions

Four review rounds: spec/boundary conformance, mechanical feasibility, a pass over the revised
plan, and a confirming pass that returned no change of direction. The first three each found
substantive defects. This is the fourth version.

**Round 1 — the Design Lab, Storybook and e2e mechanics.** The knob layer was broken in the
light theme, where `:root[data-theme='light']` re-declares the same tokens as literals at higher
specificity; it had no mechanism for elevation at all, since a box-shadow shorthand cannot be
multiplied from outside; and it converted one token per scale rather than all of them.
`DesignLabStore` was page-provided, which contradicted its own acceptance step — destroyed on
navigation, it would have shown defaults while the shell still rendered the old knobs. Full
Width and Half Width would have rendered identically, because section width comes from
`ProjectPage`'s wrapper classes in its own encapsulated stylesheet, not from the frame. A failed
project creation would have emptied the sidebar, because its error notice replaces the tree —
and the proposed test asserted on the store, so it would have passed while the bug shipped. Four
e2e mechanics were wrong: `webServer.cwd`, a relative `CWM_DATA_FILE`, a source-only workspace
import Playwright cannot transpile, and an unnamed project plus a race against the SSE
handshake. The Storybook dependency cost was understated at two packages when pnpm's isolated
`node_modules` makes it nine, and pnpm 11's default `minimumReleaseAge` would have blocked a
clean install. The bundle reasoning was wrong, because `DevPanel` is mounted globally by the
root component and no route boundary moves it. And §4's seventh TaskRow variant had been
silently dropped.

**Round 2 — what round 1's fixes missed or introduced.** The promise to derive
`--color-accent-contrast` with `color-mix` was **not implementable**: it is near-black in dark
and pure white in light, and no single mix produces both — it stays a per-theme literal, with
the consequence stated. The surface knob converted `--color-surface` but not
`--color-surface-raised`/`-sunken`, which in light theme are all white today, so the elevation
relationship would have inverted as the knob moved — the plan's own "whole families" rule,
violated two paragraphs after stating it. `color-mix()` clamps to `[0%, 100%]` and the default
sat at the endpoint, so the contrast knob is one-directional; that is now labelled rather than
implied. Root-provisioning **and** hydration were redundant alternatives — the singleton is
never destroyed, so hydration had no caller; it is dropped, and `DevPanelStore` is cited as the
precedent that ends the §20 argument. The lab's own token table would have held `#6ea8fe` — a
design literal outside `_tokens.scss`, invisible to the checker, and wrong in light theme;
defaults are now read from the stylesheet and reset *removes* properties rather than writing
values back. Acceptance step 1's `--frozen-lockfile` check proved nothing about
`minimumReleaseAgeExclude`, since a frozen install skips resolution entirely; a fresh resolve
was added. `apps/e2e` was to import `@modelcontextprotocol/client` while declaring only
`@playwright/test`. Playwright's `test-results/` and `playwright-report/` were missing from
`.gitignore`, so step 2's "git status is clean" would have failed on the first run. And step 8
said seven §81 groups when there are eight.

Two test-honesty defects came out of the same round. `moves a rendered token when a knob moves`
was billed as the only end-to-end proof of the knob layer, but jsdom implements neither
`color-mix()` nor cascaded custom properties — it would have passed while every surface was
transparent in a browser; the specs now assert only what jsdom can see and the plan says
plainly that step 6 is the real proof. And `renames optimistically and reverts` asserted on the
store while the defect it names lives in the template, so a `project-page.spec.ts` companion was
added.

**The defect round 2 found that matters most** is that optimistic project writes had no
in-flight guard. `onLiveEvent` routes any `project.*` event naming the open project into
`refreshProject()`, which replaces `projectState` wholesale — so an optimistic rename would be
overwritten by the very frame its own write produces. The store already carries this guard for
sections (`writingSections`, whose comment describes exactly this hazard) and deliberately does
not extend it to the project record. Decision 5 now specifies a symmetric `writingProject`, and
the test that would have caught it. It is the same defect class as the four commits that closed
Slice 16.

**Round 3 — confirming.** No change of direction, five paragraphs of missing specificity. The
base-literal set omitted `--shadow-color-md`, whose light value has a different alpha, so an
implementer reusing the `sm` colour would have quietly changed the light theme's md shadow —
against decision 3's own "appearance unchanged" rule, which no acceptance step checks.
`--color-accent-surface` was unhandled and is as underivable as `--color-accent-contrast`, so
the accent family's limit is now stated in full rather than half. Decision 5 **described the
existing guard wrongly** — `pendingSectionWrites` does gate `refreshProject()`, at three sites;
what it lacks is only an increment from project writes, so the fix is one renamed counter
rather than a second one every site would have to consult. The Status menu, built naively from
the enum, would have archived a project with no confirmation, because `update` runs the archive
path on any transition into `archived`. And `apps/e2e` needed `typescript` and `@types/node` to
run its own `lint`, while `seed.ts` needed pinning to `127.0.0.1` — the trap decision 6 had
already fixed one layer up, waiting to be reintroduced by copying the browser's base URL.

Smaller corrections across the rounds: the decisions count was 43 and is 40; §81's Dashboard
group has five bullets and Prototype Tools four, not six and five; the two new Design Lab specs
were named in the test plan but missing from the file list; the jsdom claim was overstated
(it resolves neither `color-mix()` nor `var()`, but does return inline custom properties,
which is what the retained assertions rest on); the `getComputedStyle` read-back needed its
trim, its `rem`-not-px return and its empty-under-jsdom case written down; §19 and §62 were
missing from the spec list by the same standard that added §63 and §20; "a task without a
due date appears in no widget" was overstated, since `today.inProgress` has no due-date
requirement; one open question was already answerable from the lint script and was deleted; the
prose claiming stories were excluded from "both tsconfigs" was wrong, as `tsconfig.spec.json`
never included them; `@types/node` was filed under Storybook peers when it belongs to decision
2; the `app.ts` line reference was off by four; the create path had no answer for an unresolved
identity; the New project button could not be nested inside the group toggle, which is itself a
`<button>`; More and Quick add would have opened overlapping popovers from the same row; the
project-write error had no signal that was not either the full-page error or one cleared by the
next quiet re-read; §63 and §20 were missing from the spec list; and the Design Lab's "injects
no gateway" claim contradicted its own test until the section panel was given the same stub
content definition the stories use.
