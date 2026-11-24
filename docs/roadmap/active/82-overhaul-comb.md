<!-- plan id="82" status="active" summary="Mid-overhaul protocol §8 pass after the patterns and navigation layers: full re-capture and core-task run, a fresh cold comb (task walks incl. 375 touch, seven lenses), verified findings, theme re-prioritisation and Gate 3 if the direction needs amending" -->
# Slice 82 — Protocol §8 comb

**State (2026-11-24):** plan written (first draft), not yet reviewed. No implementation. `CURRENT_SLICE = 82`.
Next: plan review rounds (AGENTS.md step 2), then the user's acceptance and answers to the Open questions; then
step 0.

## Goal

Run the [overhaul protocol's](../../guides/ui-ux-overhaul-protocol.md) §8 pass once, mid-overhaul, after the
tokens, primitives, patterns and shell layers (redesign slices 1–7, roadmap slices 71–81): re-capture the full
matrix and the core tasks at one commit, run a fresh comb with cold auditors, admit only reproduced findings,
reconcile the Gate 1 ledger and the §8 comb list against the current build, and re-prioritise the themes for the
user at Gate 3 — recording, not fixing.

## Spec sections

- **§77** design-first use: the comb is the prototype judging itself; findings are evidence, not tasks.
- **§78** decision log: Gate 3 answers become decision entries or dated amendments, never rewrites.
- **§79** friction notes: what the orchestrator meets while reproducing goes to `.prototype/notes.json`.
- **§21, §22, §26, §67–§69** (the umbrella's sections): tokens, both themes, the project canvas, the Design Lab,
  route coverage and verification are what the capture matrix and lenses examine. This slice changes none of them.
- **Protocol** §4 (task walkthroughs, the seven lenses, the finding format, no fixes in findings, cite a reopened
  decision), §6 extras where they fit (capture scope; no "findings closed", since this slice closes none), §8 (re-run
  the full matrix and the core-task scripts; fresh comb with new auditors; update and re-prioritise the themes;
  Gate 3 if the direction needs amending; the stop rule), and the Appendix (crops at full resolution, text tools for
  facts, brief auditors cold, never trust a finding unverified).

## Build

One protocol pass in eight steps (0–7), each sized for one fresh session. Steps 1–3 are cold auditors; steps 0 and
4–7 are the orchestrator's (the protocol §2: synthesis is never delegated). Gate 3 sits between steps 5 and 6.

- **Recapture at one commit.** A slice-owned rig config (`slice82.config.ts`, ports 4258/4358) captures all 194
  matrix cells at the commit of the accepted plan's step 0 (`C82`), plus the core tasks T01–T12, and a short list of
  post-Gate 1 runtime surfaces the matrix does not reach (§ Capture scope). `report.ts` builds the contact sheet,
  axe summary and coverage. The build served is `apps/web/dist/web/browser` built at `C82`; its initial bundle is
  recorded (no web code changes in this slice, so the ceiling is not in play).
- **The walk rig works on Linux and in the foreground.** `walk/env.sh` was written for Git Bash on Windows
  (`pwd -W` with no fallback on the data path, line 15) and assumes a background daemon. Step 0 proves it here and
  adds a foreground session driver if the daemon cannot outlive one foreground command (Open question 6).
- **A fresh comb.** Four task walkthroughs (W1 mouse 1440, W2 touch 375, W3 keyboard, W4 personas Alex and Sam)
  and seven lens audits (L1–L7), each a new cold subagent that has not seen the Gate 1 findings, the themes, the
  comb list or the slice records (§ Auditor isolation). At most two browser jobs at once.
- **Admission.** The orchestrator reproduces every filed finding on a fresh seed or from the captures and records a
  verdict; only reproduced findings are admitted. Each admitted finding is classified *new*, *still open* (it is a
  Gate 1 finding the record never closed), *regression* (a Gate 1 finding a slice record says it closed) or
  *introduced* (a surface or behaviour that did not exist at Gate 1).
- **Ledger reconciliation.** The Gate 1 ledger has no per-finding status (`findings/*.json`, `themes.json`): closures
  live only in the slice records' "Findings closed" tables (slices 71–81). Step 4 builds
  `comb-82/ledger.json`: every one of the 296 admitted Gate 1 findings with its status (*closed by Slice N*,
  *partly closed*, *open — routed to* redesign slice 8, 9, 81.1, or *open by decision* (TH12)) and its source line.
- **The §8 comb list.** Items 1–22 in the umbrella are re-verified at `C82` by the orchestrator (not by auditors) and
  filed in the finding format (`C82-CL-01` …); item 1 is checked and recorded closed (Slice 81's Outcome, the tree
  draws no empty sentence under a root).
- **Synthesis.** Admitted findings join existing themes or new ones (TH16 …). `themes.json` gains per-theme status
  and a re-prioritised order; the stop-rule tally (open S1, open S2 by theme, core-task clicks and dead ends against
  the baseline, serious/critical axe per theme) is computed from files, not by hand.
- **Gate 3 artifact.** A digest page and a contact sheet the user can look at in minutes (§ Visual acceptance). The
  user routes every open S1/S2, answers any direction amendment, and says whether a stop-rule number is set now.
- **Closing.** Gate 3 answers become decision entries or dated amendments, `direction.md` amendments (dated), the
  umbrella's handoff and sequence, and `planned/` candidates for the routed fixes. No product code changes.

## Done when

The full matrix (194 cells) and T01–T12 are captured at one recorded commit; four walkthroughs (including the 375
touch pass) and seven lens audits by cold auditors are filed in the protocol format; every filed finding has a
verdict; the Gate 1 ledger and comb items 1–22 each have a status at that commit; `themes.json` is updated and
re-prioritised with a stop-rule tally; the user has held Gate 3 and every answer is recorded; the routed fixes are
`planned/` candidates or named in their owning slice; and no file under `apps/web/`, `packages/` or
`apps/prototype-host/` has changed except `CURRENT_SLICE`.

## Do not

- Fix anything in the product: no web, domain, contracts, host, seed or MCP change. Every finding, including an S1, is
  recorded and routed at Gate 3 (Open questions 2 and 3).
- Plan or start redesign slice 8 (agent connections), Slice 81.1 (TH13 content layouts) or redesign slice 9
  (vocabulary). This slice may *route* findings to them; it does not edit their plans beyond a named finding list in
  `planned/` candidates, and only after Gate 3.
- Show an auditor the Gate 1 findings, walkthroughs, `themes.json`, `reproduction.json`, the comb list, the slice
  records or `.prototype/notes.json`.
- Propose fixes inside findings (protocol §4.3).
- Use ports 4200 or 4310, `route.continue()`, more than two browser jobs, or `run_in_background`.
- Raise the bundle ceiling; claim the stop rule holds; close the umbrella; pass Gate 3 for the user.
- Rewrite a decision entry, `themes.json`'s Gate 1 arrays, or a Gate 1 finding record. Amend; add fields.

## Scope check

The comb covers every surface the matrix reaches, because every surface changed: tokens (71), primitives (72), lifts
and focus (73), feedback (74–75), section chrome (76), rows (77), states (78–79), the archive cascade (80) and the
shell (81) all paint or behave on every route (Open question 1). It **records**; the fixes it finds are routed at
Gate 3. The comb list is re-verified and filed, not fixed (Open question 2).

## Acceptance check

Run from the repository root at the step named. `C82` is the commit step 0 captures.

1. **Capture (step 0).** `pnpm --filter web build` succeeds; the initial bundle is recorded in the State header.
   `pnpm --filter @cwm/e2e exec playwright test --config ux/slice82.config.ts` (split by `UX_MATCH` into foreground
   halves, `'^[a-m]'` and `'^[n-z]'`, about 6–8 minutes each at Slice 81) leaves `apps/e2e/ux-output/<C82>/index.json` with **194/194** cells captured, and
   `coverage.json` lists the same three gaps as `matrix.ts:20-24` and nothing else. `node --import tsx
   apps/e2e/ux/report.ts apps/e2e/ux-output/<C82>` writes `contact-sheet.html`, `axe-summary.json` and
   `coverage.json`.
2. **Core tasks (step 0).** `apps/e2e/ux-output/<C82>/tasks/tasks.json` holds T01–T12, each with clicks, keystrokes,
   surfaces and dead ends. `docs/roadmap/70-ui-ux/comb-82/core-tasks.json` compares them with `baseline.json`
   (T01–T10) and with the latest recorded counts (Slice 81 step 0, `completed/81-one-navigation-tree.md:17-19`: T01 2/16 …
   T11 1/0, T12 1/0), and names every task over its baseline or with a dead end.
   The expected exceptions, recorded and not re-litigated: T08 +1 (accepted at Slice 81's Gate 2), T10's dead end
   (redesign slice 8).
3. **Rig (step 0).** `walk/env.sh` (or its replacement) starts an isolated host on 4322 with a scratch data file
   under `apps/e2e/ux-output/walk-env/` and **not** `/<name>.json` at the filesystem root; one `walk.mjs`
   `seed nested-projects` / `goto /projects/project-kitchen` / `shot` / `axe` sequence works in foreground commands
   and leaves the PNG and axe JSON in `ux-output/walk/<name>/`. `node --test apps/e2e/ux/harness.test.mjs` (plus
   any new rig test) passes.
4. **Comb filed (steps 1–3).** `docs/roadmap/70-ui-ux/comb-82/findings/` holds eleven files (`w1`–`w4`, `l1`–`l7`)
   and `comb-82/walkthroughs/` four, each a valid record set under `comb.test.mjs` (step 0 writes it first). Each
   walkthrough file names T01–T12 for each persona it ran, with outcome, clicks, keystrokes, dead ends and
   discoverability. W2 ran at 375×812 with touch.
5. **Admission (step 4).** `comb-82/reproduction.json` has a verdict for every filed id (the test fails on a missing
   or extra id). `comb-82/comb-list.json` has a status for items 1–22. `comb-82/ledger.json` has a status for each
   of the 296 admitted Gate 1 ids, each citing its source (slice record path and line, or the umbrella line that
   routes it).
6. **Synthesis (step 5).** `themes.json` has `status` and `priority` on every theme and a `comb82` block (admitted
   new findings per theme, by severity); every admitted comb finding is in exactly one theme; `comb-82/tally.json`
   is generated by `tooling/build-comb.mjs` and gives open S1, open S2 (with TH12 counted), the core-task table and
   serious/critical axe by theme. `node --test docs/roadmap/70-ui-ux/tooling/comb.test.mjs` passes.
7. **Gate 3 artifact (step 5).** `comb-82/gate3.md` (digest) and `apps/e2e/ux-output/<C82>/contact-sheet.html`
   exist; `gate3.md` names every decision the user must make, with options and a recommendation.
8. **Closing (step 7).** Every Gate 3 answer is a decision entry or a dated amendment indexed in
   `docs/decisions/README.md`; routed fixes are `planned/` candidates or listed in their owner's plan; the umbrella
   handoff and `goals.md` say what is next. `git diff --stat <plan-accept>..HEAD -- apps/web packages
   apps/prototype-host prototype` shows nothing. `pnpm test` and then `pnpm lint` are green.

## Capture scope

- **Rig.** `apps/e2e/ux/slice82.config.ts`, modelled on `slice81.config.ts`: host on **4358**
  (`.prototype/ux-slice82.json`, copied from `prototype/seeds/empty.json` before the run, as Slice 81's step 0 did), static build on **4258** via `walk/static.mjs`, `UX_STATIC_ORIGIN=http://localhost:4258`,
  `outputDir: ../ux-output/slice82-capture-results`. No `UX_BEFORE` build: there is one build. `UX_OBJECTS` is
  **not** set, so `capture.ts`'s "core task baseline" test runs `runCoreTasks` at 1440 (`capture.ts:181`). If that
  legacy path no longer completes on the current build, step 0 adds `comb-verification.ts` with only the core-task
  test, as Slice 81 did (`navigation-tree-verification.ts`), and sets `UX_OBJECTS=1`.
- **Walk rig ports.** Auditor hosts 4322–4325, control ports 5322–5325, static build 4201 (walkd's fixed origin,
  `walkd.mjs:24`). Reproduction host 4320. Never 4200/4310 as listeners.
- **The matrix:** all 194 cells of `matrix.ts`, both themes, 1440/1024/375 as the matrix assigns them, all six seeds.
- **Runtime surfaces** the matrix does not reach but the comb must see (captured once each, light 1440 and dark
  375, by a `comb-verification.ts` test reusing the slice verification files' steps; no new product selectors):
  the toast with Undo after a section removal (74), a row failure and Saving…/Saved in the drawer (75), the
  archive cascade confirmation on Kitchen (80, already `kitchen-archive-confirm`, so only the 375 drawer variant),
  the edit-project menu and the drawer tree at depth (81), the skip link focused (81), and a recovered failed
  section (78). Each names the slice verification file it borrows from.
- **Must change / must not change:** not applicable; this slice changes no product code, so every cell is evidence,
  not a pair. The Gate 0 captures (`c94f0f0e…`) are not on this machine; the comparison baseline for the sheet is
  Open question 5.
- **Disk.** `apps/e2e/ux-output` holds 6.9 GB of earlier commit folders. Step 0 deletes none of them; it records the
  free space before the run and stops if under 3 GB (the user decides what to prune).

## Visual acceptance

There are no before/after pairs: nothing is fixed. What the user looks at, at Gate 3 (Open question 5):

- `comb-82/gate3.md`: the counts (filed, admitted by severity, new / still open / regression / introduced), the
  stop-rule tally, the re-prioritised theme list with each theme's status, each open S1/S2 with its proposed route,
  the comb-list verdicts, the core-task table and any direction amendment proposed, each with options and a
  recommendation.
- The contact sheet at `C82` (`report.ts`'s `contact-sheet.html`), and per admitted S1/S2 one crop (the finding's
  evidence path), linked from the digest.

## Behaviour vs. appearance

Neither changes. The only code change is `CURRENT_SLICE = 82` (done in the plan session) plus disposable rig and
tooling under `apps/e2e/ux/` and `docs/roadmap/70-ui-ux/tooling/`. Every existing test stays green untouched.

## Auditor isolation and method

- **Cold briefs.** Each auditor gets: the goal of its pass, the surface inventory (extracted from the umbrella's
  *Surface inventory* section into `comb-82/briefs/inventory.md` at step 0, with no finding ids), its one lens or
  task list, the finding format (protocol §4.3) and the JSON schema `comb.test.mjs` enforces, its id prefix, the
  seeds and personas, the rig commands and its own ports, the decision index (`docs/decisions/README.md`, so it can
  cite a reopened decision), and the instruction not to propose fixes. Briefs are committed in `comb-82/briefs/` so
  the run is reproducible.
- **Forbidden reading**, named in every brief: `docs/roadmap/70-ui-ux/` except its own `comb-82/briefs/` file and
  `comb-82/findings/` file, `docs/roadmap/active/70-ui-ux-overhaul.md` beyond the inventory extract,
  `docs/roadmap/completed/7*.md` and `8*.md`, `.prototype/notes.json`, and git history. Each auditor states in its
  file's `attestation` field that it did not read them; the orchestrator spot-checks findings that echo Gate 1
  wording.
- **Walkthroughs (W1–W4)** drive the running app through the walk rig, narrating the expectation before each act
  (protocol §4.1). W1: Demo, mouse, 1440, both themes across the tasks. W2: Demo, touch, 375×812, its own pass.
  W3: Demo, keyboard only, 1440. W4: Alex and Sam, mouse, 1440, own-content equivalents. Each runs T01–T12 and
  records the walkthrough fields of Gate 1 (`walkthroughs/*.json`: outcome, clicks, keystrokes, surfaces, dead ends,
  `firstCorrectActionFoundImmediately`, discoverability, steps).
- **Lenses (L1–L7)** read the `C82` captures at full resolution (crops, `layout.json`, `aria.yml`, `axe.json`), may
  use one walk-rig browser to confirm a fact, and L2 greps the SCSS for token escapes.
- **Ids.** `C82-W1-001` …, `C82-L3-004` …, `C82-CL-01` … (comb list). Records carry the Gate 1 fields plus
  `auditor`, and no fix.
- **Browser jobs.** At most two at once across the run: W1 with W2 in step 1, W3 with W4 in step 2, lenses in step 3
  with at most two of them holding a browser.

## Severity and routing rule (what this slice fixes)

This slice fixes **nothing in the product** (recommended answer to Open questions 2 and 3). It produces a routed
list. Proposed routes, for the user at Gate 3:

- the five agent-connection S1s and anything about connecting, revoking or inspecting agents → redesign slice 8;
- vocabulary, ids, enums, casing and dates (TH14) → redesign slice 9;
- the six TH13 content layouts already queued → Slice 81.1, plus any new narrow-layout finding the user adds to it;
- TH12 scaffolding → open by decision, counted in the tally;
- everything else S1/S2 (including the comb list's copy and focus items) → a new follow-on, **Slice 82.1 — comb
  fixes**, created as a `planned/` candidate at step 7 with the routed ids, ordered before redesign slice 8 unless
  the user orders otherwise;
- S3 → left in the ledger, listed in the digest, routed only if the user picks some.

## File-level change list

### Code (the only allowed product file)

| File | Change | Responsibility |
|---|---|---|
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` | modify (plan session) | `CURRENT_SLICE = 82`; `dev-panel-store.spec.ts` pins the constant and stays green |

### Rig (disposable, `apps/e2e/ux/`, step 0)

| File | Change | Responsibility |
|---|---|---|
| `apps/e2e/ux/slice82.config.ts` | create | Capture config on 4258/4358, `.prototype/ux-slice82.json`, `testMatch: ['capture.ts', 'comb-verification.ts']` |
| `apps/e2e/ux/comb-verification.ts` | create | The runtime surfaces above, and the core-task test if the legacy one fails |
| `apps/e2e/ux/walk/env.sh` | modify | Linux paths (no `pwd -W` without a fallback); data under `ux-output/walk-env/` |
| `apps/e2e/ux/walk/session.mjs` | create only if needed (Q6) | Foreground driver: starts host and browser, runs a step file, writes shots/axe/aria, exits |
| `apps/e2e/ux/harness.test.mjs` | modify | A test that `env.sh`'s resolved data path is under `ux-output/walk-env/` (fails today on Linux) |

### Evidence and tooling (`docs/roadmap/70-ui-ux/`)

| File | Change | Responsibility |
|---|---|---|
| `comb-82/briefs/*.md` | create (step 0) | Inventory extract, the common brief, one brief per auditor |
| `comb-82/findings/{w1..w4,l1..l7}.json` | create (steps 1–3) | Filed findings, by auditor |
| `comb-82/walkthroughs/{w1..w4}.json` | create (steps 1–2) | Task runs, Gate 1 walkthrough shape |
| `comb-82/core-tasks.json` | create (step 0) | T01–T12 at `C82` against the baseline |
| `comb-82/reproduction.json` | create (step 4) | Verdict per filed id, method, classification (new / still open / regression / introduced) |
| `comb-82/comb-list.json` | create (step 4) | Items 1–22: status at `C82`, note id, the `C82-CL-nn` record where still open |
| `comb-82/ledger.json` | create (step 4) | Status of the 296 Gate 1 admitted findings with a source line each |
| `comb-82/tally.json` | create (step 5, generated) | The stop-rule tally |
| `comb-82/gate3.md` | create (step 5) | Digest and decisions for Gate 3 |
| `themes.json` | modify (step 5) | Add `status`, `priority`, `comb82` per theme; new themes TH16+; Gate 1 arrays untouched |
| `tooling/build-comb.mjs` | create | Validates the comb files, generates `tally.json`, writes the themes' `comb82` blocks |
| `tooling/comb.test.mjs` | create (test first) | Schema and consistency tests (§ Test plan) |

### Documentation

| File | Change | Responsibility |
|---|---|---|
| `docs/roadmap/active/82-overhaul-comb.md` | modify | This plan, State header each session, Revisions, Outcome |
| `docs/roadmap/active/70-ui-ux-overhaul.md` | modify | Handoff: Slice 82 active; at step 7, comb result, routed items, comb list replaced by a pointer to `comb-list.json`, next slice |
| `docs/roadmap/goals.md` | modify | "Now": Slice 82 active; at step 7, what is next |
| `docs/roadmap/70-ui-ux/direction.md` | modify (step 7, only if Gate 3 amends) | Dated amendment under the principle it changes |
| `docs/decisions/*.md`, `docs/decisions/README.md` | create / amend (step 7) | One entry per Gate 3 answer; dated amendments to the reopened ones |
| `docs/roadmap/planned/82.1-comb-fixes.md` | create (step 7, if routed) | The candidate, with the routed finding ids |
| `docs/architecture/testing/how.md` | modify (step 0) | The walk rig's Linux use and the slice 82 rig ports; the comb tooling |
| `docs/guides/ui-ux-overhaul-protocol.md` | modify only if a protocol rule is changed by the user at Gate 3 | — |
| `.prototype/notes.json` | append (step 4) | Friction the orchestrator meets while reproducing (§79) |

## Implementation sequence

Each step is one fresh session; each ends with a State header update and a commit (`docs(slice 82): …` or
`test(slice 82): …`, citing §N). A step that cannot finish hands off at a green point.

0. **Rig, briefs and recapture.** Write `comb.test.mjs`'s schema tests (red: no files) and the `harness.test.mjs`
   env-path test (red on Linux); fix `env.sh`, prove one walk sequence (Acceptance 3); add `session.mjs` only if Q6
   says so. Build the web app, record the bundle, record `C82`, free disk. Write `slice82.config.ts` and
   `comb-verification.ts`; capture 194 cells in subsets and the runtime surfaces; run `report.ts`. Write
   `core-tasks.json`. Write `briefs/` (inventory extract, common brief, eleven auditor briefs). Commit.
1. **Walkthroughs W1 (mouse 1440) and W2 (touch 375).** Two cold foreground subagents, two browsers. The
   orchestrator checks each file passes `comb.test.mjs`'s schema and the attestation; it does not edit findings.
2. **Walkthroughs W3 (keyboard) and W4 (personas).** Same.
3. **Lenses L1–L7.** Seven cold foreground subagents over the captures, at most two holding a browser; run in two
   batches (L1–L4, L5–L7) if one session cannot hold seven reports.
4. **Admission and reconciliation.** Reproduce every filed finding (rig on 4320, scripts in
   `apps/e2e/ux/walk/repro/c82-*.js`), write `reproduction.json`; build `ledger.json` from the slice records'
   "Findings closed" tables and the umbrella routes; re-verify comb items 1–22 and write `comb-list.json` plus the
   `C82-CL-*` records; record friction notes. Split into 4a (reproduction) and 4b (ledger and comb list) if needed.
5. **Synthesis and the Gate 3 artifact.** Classify, cluster, update `themes.json`, generate `tally.json` with
   `build-comb.mjs`, write `gate3.md`. State header: awaiting Gate 3. End with `CHAIN: STOP`.
6. **Gate 3** (the user). Nothing runs until the answers are in.
7. **Record and close.** Decision entries and amendments, `direction.md` amendments if any, `planned/` candidates
   and owner-plan lists for routed fixes, umbrella handoff and `goals.md`, Outcome, `roadmap.mjs complete`.

## Test plan — tests first

No product behaviour changes, so no product test is written or changed. The tooling the comb trusts is tested first.

| Test | Proves |
|---|---|
| `apps/e2e/ux/harness.test.mjs`: env.sh data path is under `ux-output/walk-env` | The rig no longer writes `/<name>.json` on Linux (red before the fix) |
| `tooling/comb.test.mjs`: every finding record has the protocol §4.3 fields, a `C82-` id, a severity S1–S3, a lens or `task:Tnn`, and no `fix` / `suggestion` / `recommendation` field | Findings follow the format and carry no fix |
| `comb.test.mjs`: ids are unique across all files | No collisions between auditors |
| `comb.test.mjs`: every filed id has exactly one verdict, and no verdict names an unfiled id | Nothing enters synthesis unverified |
| `comb.test.mjs`: every admitted id is in exactly one theme; no excluded id is in a theme | Clustering is total and clean |
| `comb.test.mjs`: every Gate 1 admitted id appears once in `ledger.json` with a status and a source | The reconciliation is complete |
| `comb.test.mjs`: comb list has items 1–22, each with a status, and an open item has a `C82-CL` record | The comb list is accounted for |
| `comb.test.mjs`: `tally.json` equals what `build-comb.mjs` computes from the files | The tally is generated, not hand-edited |
| `comb.test.mjs`: `themes.json`'s Gate 1 fields are byte-identical to the Gate 1 version (`git show 7169bdc:…`) | Gate 1 evidence is not rewritten |
| `comb.test.mjs`: each walkthrough file has T01–T12 for each persona it names | The task walks are complete |

Where `comb.test.mjs` runs is Open question 7.

## Boundaries touched

- **None of the architecture's code boundaries** are near: no product code changes (Behaviour vs. appearance).
- **`core/` → `prototype/`**: `CURRENT_SLICE` is in `prototype/dev-panel`; unchanged boundary.
- **Ports and data isolation** (Operational traps): the rig never listens on 4200/4310 and never reads or writes the
  developer's `.prototype/data.json`; walk hosts use scratch files under `ux-output/walk-env/`.
- **Decision log (§78)**: Gate 3 answers amend entries with dated amendments, never rewrite them.
- **Never build (§80)**: nothing here approaches it; any finding that would need it is recorded as such.

## Explicit non-goals

- Fixing any finding, including the comb list and any S1 (routed at Gate 3; Slice 82.1 or the owning slice).
- Redesign slice 8 (agent connections), Slice 81.1, redesign slice 9: not planned, not started.
- Meeting the stop rule, or deciding it holds. This comb reports the tally; the final comb after slices 8 and 9 is
  the one that may stop the umbrella.
- Storybook capture, drag frames, race and fault fixtures (the matrix's known gaps, `matrix.ts:20-24`).
- A published page (ChatGPT Site or Claude artifact). The Gate 3 artifact is local unless the user asks
  (Open question 5).
- New capture surfaces beyond the listed runtime ones; changing `matrix.ts` (it would change the denominator every
  sheet profile uses).
- Pruning `ux-output`.

## Open questions

1. **What "changed surfaces" means.** *Context:* protocol §8 says "a fresh comb on the changed surfaces"; no comb has
   run since Gate 1, and slices 71–81 changed tokens, primitives, patterns and the shell, which paint every route.
   *Options:* (a) the whole matrix, all six seeds, both themes, three widths, plus the listed runtime surfaces;
   (b) only surfaces a slice record lists in its capture scope as "must change"; (c) only the patterns and shell
   surfaces (project pages, sections, rows, states, navigation), skipping dashboard, settings, calendar, search and
   `/prototype/*`. *Recommendation:* (a), with `/prototype/*` (dev tooling, TH12 by decision) reached by lenses only,
   not by task walks. *Impact:* (a) is the most auditor time and the only option that can find regressions on
   surfaces no slice listed; (b)/(c) are cheaper and blind to exactly the cross-cutting changes the overhaul made.
2. **The comb list (items 1–22).** *Context:* 21 open wording, focus and consistency items the user parked for the
   comb (item 1 is closed by Slices 80–81). *Options:* (a) fix them in this slice; (b) re-verify and file them only;
   (c) split: re-verify and file here, fix in a follow-on (Slice 82.1) after Gate 3 with the comb's new S1/S2.
   *Recommendation:* (c). *Impact:* (a) puts web code and the bundle into a recording slice and lets the comb's
   evidence predate its fixes; (c) keeps one commit as evidence and lets Gate 3 order the fixes with everything
   else; (b) without a follow-on leaves them nowhere.
3. **New S1/S2 findings.** *Context:* the comb will find some; slices 8, 9 and 81.1 are pending, and TH12's S2s
   stay open by decision. *Options:* (a) fix here; (b) route each at Gate 3 to slice 8, 9, 81.1, open-by-decision or
   a new Slice 82.1 (§ Severity and routing rule); (c) route everything to the existing slices only. *Recommendation:*
   (b), and a new S1 that blocks a core task goes first in 82.1. *Impact:* (b) adds one slice before agent
   connections; (c) overloads slice 9 with non-vocabulary items.
4. **The stop rule's S2 number.** *Context:* protocol §8 needs "S2 findings below an agreed number"; none is agreed.
   *Options:* (a) choose a number now; (b) leave it to the final comb after slices 8 and 9; (c) have Gate 3 propose
   one from this comb's tally, for the user to set or defer. *Recommendation:* (c). *Impact:* a number chosen now has
   no data; one set at Gate 3 is informed and still early enough to steer 82.1, 8 and 9.
5. **Gate 3: when and what.** *Context:* protocol §8 holds Gate 3 "if the direction needs amending". Routing the
   open S1/S2 needs the user regardless. The Gate 0 captures are not on this machine (the ChatGPT Site holds them).
   *Options:* (a) always hold Gate 3 after step 5, reviewing the digest, the theme list, the routing, any direction
   amendment and the `C82` contact sheet; (b) hold it only if a direction amendment is proposed, routing by default;
   (c) as (a), plus a before/after sheet against the oldest local full capture (`0c19170…` or the earliest Slice 71
   folder) instead of Gate 0. *Recommendation:* (a), local files, no publication. *Impact:* (b) routes S1/S2 without
   the product owner; (c) costs a session of sheet work and compares against a non-baseline build.
6. **Auditor method, count and rig.** *Context:* Gate 1 used twelve auditors (four walks, seven lenses, one more
   pass) and the walk rig's background daemon; this environment runs subagents and commands in the foreground and
   allows two browser jobs. *Options:* (a) eleven auditors as Gate 1 (W1–W4, L1–L7), walk rig kept, with a
   foreground `session.mjs` driver (one command per walk step file) if the daemon cannot run in the foreground;
   (b) six auditors (mouse+keyboard walk, touch walk, personas walk, three merged lenses); (c) walks only.
   *Recommendation:* (a), for comparability with Gate 1. *Impact:* (a) is about four sessions of auditors; (b)
   halves that and loses lens independence; (c) loses the capture-based lenses that found most S3s.
7. **Where `comb.test.mjs` runs.** *Context:* `build-sheet.test.mjs` lives in the same folder; the root `pnpm test`
   runs only `scripts/*.test.mjs` and the workspace packages. *Options:* (a) run it by hand at each step and in the
   Acceptance check only; (b) add it to the root `test` script. *Recommendation:* (a), matching `build-sheet.test.mjs`
   and the evidence being disposable. *Impact:* (b) makes `pnpm test` fail whenever comb files are mid-step.

## Revisions

- **Draft (2026-11-24):** first draft, before review.

<!-- ───────────── Written before roadmap.mjs complete ───────────── -->

## Outcome

Not yet written.
