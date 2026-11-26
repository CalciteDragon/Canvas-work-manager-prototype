<!-- plan id="82" status="active" summary="Mid-overhaul protocol §8 pass after the patterns and navigation layers: full re-capture and core-task run, a fresh cold comb (task walks incl. 375 touch, seven lenses), verified findings, theme re-prioritisation and Gate 3 (always held, Q5 (a))" -->
# Slice 82 — Protocol §8 comb

**State (2026-11-26):** **plan accepted by the user (2026-11-24, user decision) with all eight recommendations**
(Open questions 1–8 resolved: Q1 (a), Q2 (c), Q3 (b), Q4 (c), Q5 (a), Q6 (a), Q7 (a), Q8 (a)), after five review
rounds and two review rounds of the acceptance amendment; new Open question 9 (lens and reproduction daemons) blocked
nothing before step 3 and was **answered by the user on 2026-11-26: (a)** (see the end of this header). **`<plan-accept>` = the acceptance commit, subject
"docs(slice 82): plan taken up by the user; answers to Q1–Q8 recorded (§77, §78)"; its hash: `8c1a524`** (`8c1a5248596a566f202b0e02368de4bb7e4d4849`, recorded by the follow-up docs commit,
since a commit cannot name its own hash).
**Step 0a done (2026-11-24): rig and tests.** `63bc1d2` (env.sh on Linux with `--print-paths`; `build-comb.mjs`
validator, `comb.test.mjs`, `comb-fixtures.mjs`), `1855e62` (host via `tsx`, so a group kill releases its port;
`testing/how.md`), and the review-fix commit that records this header. **Acceptance 1 passed by the detached
lifecycle (Q6 (a)); `session.mjs` was not written (no (a′)).** `static.mjs` on 4201 and probes `w-probe`
(4322/5322) and `w-probe2` (4323/5323) started with `setsid`; `seed nested-projects`, `goto
/projects/project-kitchen`, `shot kitchen`, `axe kitchen` succeeded on both (PNG and axe JSON in
`ux-output/walk/w-probe*/`); after probe 1's `quit` and group kill, 4322/5322 were free and probe 2 still answered;
after the stop, nothing listened on 4201, 4322, 4323, 5322 or 5323. `harness.test.mjs` 10/10; `comb.test.mjs` by hand:
59 pass, 20 skipped (no `comb-82/` yet). **Traps for later steps (briefs must carry them):** `$!` after `setsid … &`
is not the process group (setsid may fork), so record it from inside: `setsid bash -c 'echo $$ > w1.pgid; exec bash
apps/e2e/ux/walk/env.sh w1 4322 5322' >log 2>&1 </dev/null &`, then `walk.mjs <ctl> quit; kill -TERM -- -"$(cat
w1.pgid)"`; and a host started through `pnpm --filter … start` survives the kill (fixed in `env.sh`; never start a
rig host through pnpm). File shapes step 0b–5 must follow are in `build-comb.mjs`'s header (see Revisions, step 0a).
`CURRENT_SLICE = 82` (`2e0f500`).
**Step 0b done (2026-11-24): recapture.** **`C82` = `37dd16e`** (`37dd16e2303e7d8968905de74767710d6b02b85c`, "test(slice
82): comb recapture rig …": `apps/e2e/ux/slice82.config.ts` on 4258/4358, host through `tsx`;
`apps/e2e/ux/comb-verification.ts`, `UX_COMB=tasks|surfaces[:group]`; `testing/how.md`, `what.md`). Nothing was
committed between the first capture command and the last. **Bundle 932.25 kB** initial (`pnpm --filter web build`;
equal to Slice 81's close, 932.25 kB — the brief's 932.12 kB is the Gate 2 figure before Slice 81's real-use fix;
ceiling 1,150 kB untouched; the existing 850 kB warning budget still warns). Disk: 109 GB free before and after
(`ux-output` 6.9 GB, plus 246 MB for `C82`; nothing pruned). **Matrix:** `apps/e2e/ux-output/37dd16e…/index.json`
**194/194 captured**, `gaps` = the three `matrix.ts` entries (Storybook, rare races/fault fixtures, dragging and
keyboard resize/move); ranges `^[a-d]` 38 cells 1.6 min, `^[e-k]` 70 cells (one cell, `kitchen-shortcut-picker-light-375`,
failed on a 30 s `waitForLoadState` and passed alone in 7 s), `^[l-o]` 36 cells 1.6 min, `^[p-z]` 50 cells 2.2 min.
**Core tasks** (`tasks/tasks.json`, recorded in [`comb-82/core-tasks.json`](../70-ui-ux/comb-82/core-tasks.json)):
identical to Slice 81's after counts — T01 2/16, T02 3/19, T03 10/38, T04 1/0, T05 2/0, T06 2/16, T07 3/0, T08 4/0,
T09 1/0, T11 1/0, T12 1/0; over baseline only **T08** (4 vs 3, the accepted +1); dead end only **T10** (the known one,
"Find Connect agent control"); **no regression against Slice 81**. **Runtime surfaces** (`comb/surfaces.json`, 8
surfaces × light 1440 / dark 375, 20 frames, each PNG + axe JSON with `incomplete` + ARIA): toast with Undo after a
section removal; two row failures; drawer Saving… then Saved; a failed section read then recovered by Try again; the
Renovation archive cascade confirmation; the edit-project menu; the tree at depth (five levels, in the drawer at
375); the skip link focused. All captured, zero axe violations; the only console errors are the injected 500s.
**`report.ts`** (run alone): `index.html` with the task table, `contact-sheet.html` and `.png` (heading still says
"Gate 0", `report.ts:21`; the digest must say so), `axe-summary.json` (194 scans, **0 serious/critical**; 16 cells carry 40 moderate/minor violations: `landmark-unique` 12, `heading-order` 8, `aria-allowed-role`, `landmark-no-duplicate-banner`, `page-has-heading-one`, `landmark-main-is-top-level`, `landmark-no-duplicate-main` 4 each — raw, for the lenses, not findings),
`coverage.json` (38 inventory rows, all `not-individually-verified`, as at every capture: the rig never marks a row
verified). Axe `color-contrast` incomplete on **194/194** cells (as at Slice 81; Q8 (a)). **Coverage gaps:** the
three matrix gaps above; `/prototype/*` reached by lenses only (Q1 (a)); no Storybook capture. `comb.test.mjs` by
hand: 59 pass, 20 skipped, 0 fail; `build-comb.mjs --check` valid. **Trap:** the `^[e-k]` run stalled for about 47
minutes in one cell before `kitchen-collapsed-light-375` (wall 18:56–19:48), and `timeout 590` around `pnpm exec
playwright` did not stop it (probably the signal reached pnpm, not the runner; not investigated); later steps should wrap the runner as
`timeout -k 20 590 ./node_modules/.bin/playwright …` or split ranges smaller. All rig ports (4258, 4358) were free
after every run. *Review* (one cold reviewer over `6ad932a..1e500ee`): no substantive findings; 5 minor, checked: the row-failure
surface clicks the page's first unchecked boxes rather than the first Task List's (both failures did land in the Task
List, ARIA lines 71 and 80, so the capture holds); the core-task test does not assert all twelve ids (all twelve are
present); `build-comb.mjs --check` does not validate `core-tasks.json` (only the step 5 tally reads it); the moderate
axe counts (now above); `surfaces.json` keeps entries of removed surfaces (none removed). None changes the rig, which
is frozen at `C82`.
**Step 0c done (2026-11-24): briefs.** [`comb-82/briefs/`](../70-ui-ux/comb-82/briefs/common.md) holds `common.md` (override of
AGENTS.md's start-up reading, forbidden and allowed reading, the detached rig lifecycle with the stop-before-report rule
and the 0a traps, no notes, the record and file shapes `build-comb.mjs` enforces, attestation, and § 10, the walkers'
task table and walkthrough shape), `inventory.md` (the umbrella's Surface inventory and seed anchors, verbatim: no ids
to strip), `decisions.md` (140 titles and paths from each entry's first heading, none carrying an id;
`parseDecisions` reads all 140), `t12-setup.js` and `w1`–`w4`, `l1`–`l7`.md. **Acceptance 4:** the id grep finds
nothing. **`t12-setup.js` proven** on probe `w-t12` (4322/5322) with `static.mjs` on 4201 serving the `C82` build:
`seed busy-week`, `goto /projects/project-launch`, `run -f …t12-setup.js` returned `ready: true`; the Task List
showed "Couldn’t load this task list." and Try again; pressing Try again rendered its three tasks without a reload
(the failure was lifted). Theme probe `w-theme`: Demo renders by the browser's colour scheme and `emulateMedia`
switches it, but the app's own theme switch sticks across a reseed, so W1 switches only with `emulateMedia`.
Afterwards 4201, 4322 and 5322 were free and `.prototype/notes.json` stayed at 1570 lines. L2's token-escape command
prints 7 lines, none with an id. `comb.test.mjs` by hand: 59 pass, 20 skipped, 0 fail. **Ports:** W1 4322/5322, W2
4323/5323, W3 4324/5324, W4 4325/5325; lens browsers L3 and L5 on 4326/5326, L4 and L7 on 4327/5327 (one pair each per
batch, L1–L4 then L5–L7); L1, L2, L6 work from the captures. **Lens browsers:** a lens holds
a browser only if its launch message says so (Open question 9 answered (a), 2026-11-26: the step 3 launch messages
allow L3, L4, L5 and L7 one each, on Q6 (a)'s detached lifecycle and stop rule); L5's `contrastTable` needs one. **Next: step 1** (W1 and W2): the
orchestrator starts `static.mjs` on 4201 (`setsid`, pgid file, as 0a), counts `.prototype/notes.json` lines, launches
W1 and W2 as two cold foreground subagents each told to read `briefs/common.md` and its own brief, then stops 4201. Rerun: (in apps/e2e) `UX_MATCH=<range> pnpm exec playwright test
--config ux/slice82.config.ts capture.ts`; `UX_COMB=tasks|surfaces[:group] … comb-verification.ts`; `node --import
tsx ux/report.ts ux-output/37dd16e2303e7d8968905de74767710d6b02b85c`.
**Step 1 done (2026-11-25): walkthroughs W1 and W2.** The orchestrator served the `C82` build (`apps/web/dist`, built
at 0b, no product commit since) with `static.mjs` on 4201 (`setsid`, pgid file; it listens on `[::1]`, so probe
`localhost:4201`, not `127.0.0.1`), launched W1 (4322/5322, `--theme light`) and W2 (4323/5323, `--touch --theme
light`) as two cold foreground subagents at once, each told only to read `briefs/common.md`, `inventory.md`,
`decisions.md` and its own brief, then stopped 4201. Both walkers reported their ports released; afterwards nothing
listened on 4200, 4201, 4310, 4320–4329 or 5320–5329 and no `walkd`, `env.sh`, `static.mjs`, host or headless
Chromium process was left. `.prototype/notes.json` 1570 lines before and after. **Filed:**
[`findings/w1.json`](../70-ui-ux/comb-82/findings/w1.json) 20 (S1 1, S2 5, S3 14; W1's report said 6/13, the file is
the record) and [`walkthroughs/w1.json`](../70-ui-ux/comb-82/walkthroughs/w1.json) (1440×900, mouse, T01–T06 light,
T07–T12 dark, `data-theme` checked per task); [`findings/w2.json`](../70-ui-ux/comb-82/findings/w2.json) 18 (S1 1, S2 6,
S3 11) and [`walkthroughs/w2.json`](../70-ui-ux/comb-82/walkthroughs/w2.json) (375x812, touch, light). Outcomes: T01–T09,
T11, T12 completed and **T10 blocked** in both walks (no control connects a new agent; both file it S1). Five findings
name a decision in `decisionReopened`. The findings were not edited. Spot check: the Acceptance 4 id pattern finds no
Gate 1 id in either file. Attestations: W1 read the host's `/api/activity` once to confirm a double save it had seen
in the app (said in its attestation; admission at 4b judges it); W2 reached `/prototype/state` by typing the address
in T10 (counted as keystrokes). `comb.test.mjs` by hand: 79 tests, 68 pass, 11 skipped, 0 fail;
`build-comb.mjs --check`: comb files valid. **Trap (for steps 2–4b briefs and launch messages):** `walkd`'s working
directory is `apps/prototype-host` (`env.sh` `cd`s there), so a relative path in `run` (e.g. `page.screenshot({ path:
'apps/e2e/…' })`) writes into the product tree: W1 left one stray screenshot under `apps/prototype-host/apps/e2e/…`
(an earlier take of its cited `018-t03-handle-zoom.png`); the orchestrator moved it to
`ux-output/walk/w1/018-t03-handle-zoom.stray-cwd.png` and removed the untracked folder, so `git diff --stat
<plan-accept>..HEAD -- apps/web packages apps/prototype-host prototype` stays empty. Tell walkers to pass absolute
paths (or use `shot`). `pnpm test` (first run: seven 5 s web timeouts under load, all seven specs green alone; a full
re-run green) and `pnpm lint` green. Commit `3beaebf`. *Review* (one cold reviewer over `3beaebf`, process and schema
only): no substantive findings; 5 minor, checked: C82-W1-008 cites its screenshot by bare file name in prose (the full
path is elsewhere in the file; step 4a's evidence-path check must resolve it or admission attaches the path, the
finding is not edited); W1's `/api/activity` read (left to 4b, above); C82-W2-010 sits in no task's `findings` list
(allowed for findings met on the way); the stray screenshot is cited nowhere; the step paragraphs run on without blank
lines (the header's existing style, kept). **Next: step 2** (W3 and W4) the same way, ports 4324/5324 and
4325/5325, with the `cwd` trap in the launch messages.
**Step 2 attempted (2026-11-25), not done: both walkers stopped by the account's usage limit.** The orchestrator
served the `C82` build on 4201 (`setsid`, pgid file) and launched W3 and W4 cold, with the `cwd` trap (absolute
paths or `shot`) in both launch messages. Partway through (W3 after T05; W4 in Sam's T05-equiv) both agents died
on an API rate limit (HTTP 429, "5-hour limit"). Neither had written `findings/` or `walkthroughs/` files (only
screenshots and a scratch script under `ux-output/walk/w3|w4/`), so **nothing was filed and nothing is committed as
evidence**; the partial walks are discarded. The orchestrator then stopped both daemons (`quit` plus group kill)
and 4201: nothing listened on 4200, 4201, 4310, 4320–4329 or 5320–5329, no rig process was left, and
`.prototype/notes.json` stayed at 1570 lines. No product file changed. **Next: redo step 2 from the start** (both
walkers fresh; the start command's `rm -rf ux-output/walk/<name>` clears the partial screenshots; W4's content
built up without reseeding, so it cannot resume mid-walk). **Traps:** launch both walker subagents explicitly in
the foreground (`run_in_background: false`; the Agent tool's default is background, which this session hit), and
start step 2 with a fresh usage window, since two full walks cost a lot; a walker cut off mid-walk leaves its
daemon running, so the orchestrator must stop it with § 4's stop commands.
**Step 2 done (2026-11-25): walkthroughs W3 and W4, second attempt.** The orchestrator served the `C82` build on
4201 again (`setsid`, pgid file) and launched W3 (4324/5324, `--theme dark`) and W4 (4325/5325, `--theme light`) at
once as two cold **foreground** subagents with the `cwd` trap in the launch messages. A new instruction in the launch
message told each walker to write its two files after every task. W3 finished. W4 hit the usage limit again,
during Sam's T09-equiv, but its files held Alex T01–T12 and Sam T01–T08-equiv, and its daemon (Sam's built-up data)
was still running. **Deviation from "redo from the start":** after the limit reset, the orchestrator resumed the
same W4 agent with the same daemon and data rather than discarding a nearly finished walk (W4's attestation
records the interruption, and nothing was redone). Then 4201 was stopped: nothing listened on 4200, 4201, 4310,
4320–4329 or 5320–5329, no rig process was left, `.prototype/notes.json` 1570 lines before and after, and
`git diff --stat <plan-accept>..HEAD -- apps/web packages apps/prototype-host prototype` stays empty (no stray
`cwd` file this time). **Filed:** [`findings/w3.json`](../70-ui-ux/comb-82/findings/w3.json) 11 (S1 1, S2 4, S3
6; four name a decision in `decisionReopened`) and [`walkthroughs/w3.json`](../70-ui-ux/comb-82/walkthroughs/w3.json)
(1440×900, keyboard, dark, Demo, 439 keys, no clicks; T01–T09, T11 and T12 completed, **T10 blocked**, filed as S1,
which W3 notes blocks every user, not only keyboard users); [`findings/w4.json`](../70-ui-ux/comb-82/findings/w4.json) 18 (S1 1, S2 5, S3 12) and
[`walkthroughs/w4.json`](../70-ui-ux/comb-82/walkthroughs/w4.json) (Alex and Sam, mouse, light; T01 as written,
T02–T09, T11, T12 as `-equiv`, **T10 blocked** for both; persona switched by the development dialog each time, no
`localStorage` fallback; both rendered light, including Sam, whose stored preference is dark; a direct link to
`project-kitchen` showed "This project isn't available" to both). The findings were not edited. Spot check: the
Acceptance 4 id pattern finds no Gate 1 id or note id in either walker's files. Attestations to judge at 4b: W3
wrote two temp JSON files under `/tmp` and deleted them; W4's scripted typing once opened Project details by menu
type-ahead (cancelled, no change). `comb.test.mjs` by hand: 79 tests, 68 pass, 11 skipped, 0 fail;
`build-comb.mjs --check`: comb files valid. *Review* (one cold reviewer, process and schema only): no substantive findings; minors checked: the resumed W4 departs from "redo from the start" (disclosed above); some evidence entries are free text without a path (allowed by common.md § 6); the screenshots live only under the git-ignored `ux-output/walk/w3|w4/` (53 and 104 files), as at step 1, so do not prune them before 4b. **Next: step 3** (lenses L1–L7).
**Open question 9 answered (2026-11-26, user decision): (a), as recommended.** The lens browsers (step 3, L3 and L5
on 4326/5326, L4 and L7 on 4327/5327) and the orchestrator's reproduction host (steps 4a and 4b, 4320/5320) use the
walkers' detached lifecycle and stop rule: started with `setsid … >log 2>&1 </dev/null &` inside one foreground
command, stopped with `walk.mjs … quit` plus a kill of the process group, their ports confirmed released before the
lens or the step reports, nothing detached outliving the session; the (a′) `session.mjs` replay driver is the
fallback if the detached lifecycle fails, without a new question. W4 from step 2 is **kept as filed** (the user did
not ask for a rerun; its resumed-walk deviation is disclosed above). Recorded docs-only (no product code, no rig
change, no capture). *Review* (one cold reviewer over the diff): no substantive findings; minors checked
and kept ("L1–L7" in the answer names the step, as the user worded it, while only L3, L4, L5 and L7 hold a browser;
the *Lenses* bullet and step 3 refer to Q6 (a)'s rule rather than repeating "nothing detached outliving the session"). **Next: step 3** (lenses L1–L7), in two batches if needed (L1–L4, then L5–L7), at most two lens
browsers at once; the orchestrator starts and stops `static.mjs` on 4201 around the batch, as at steps 1 and 2.

**Step 3 done (2026-11-26): lenses L1–L7.** At takeover, the L1, L2 and L4 drafts had an
"In progress" attestation, and two lens daemons and the static server were running. Both daemons
answered `quit` and their process groups and the static group were terminated. The drafts were set aside
outside the repository and those lenses started fresh. Seven cold subagents filed
[`l1.json`](../70-ui-ux/comb-82/findings/l1.json) (9),
[`l2.json`](../70-ui-ux/comb-82/findings/l2.json) (10),
[`l3.json`](../70-ui-ux/comb-82/findings/l3.json) (10),
[`l4.json`](../70-ui-ux/comb-82/findings/l4.json) (7),
[`l5.json`](../70-ui-ux/comb-82/findings/l5.json) (12),
[`l6.json`](../70-ui-ux/comb-82/findings/l6.json) (20), and
[`l7.json`](../70-ui-ux/comb-82/findings/l7.json) (10): 78 findings (S1 1, S2 60, S3 17), pending
admission. The orchestrator kept the findings as filed. Each lens sampled native-resolution regions
in all 194 matrix first screens, 492 scroll frames and 20 runtime frames, with larger checks as needed.
Attestations describe the scope. L3 and L4 used detached rigs on 4326/5326 and 4327/5327, then released
their port pairs for L5 and L7 respectively, with at most two lens browsers at a time.
**Q8 (a):** L5 measured 108 pairs across nine views in both themes using computed colors and backdrop
pixel sampling where required. All measured pairs met their thresholds (5.992:1–18.083:1). L5 checked
214 axe artifacts and reports unresolved axe `incomplete` cases. The contrast measurements and
incomplete counts go into the digest outside the stop rule. Each report passed the hand-run comb tests
(final: 69 passed, 10 skipped for later-step inputs, 0 failed). Static 4201 and both lens pairs are free
and no live rig process remains. `.prototype/notes.json` stayed at 1570 lines. The product diff from
`8c1a524` is empty. `pnpm test` then `pnpm lint` passed. One cold review of the staged diff found no
substantive process or schema issues. The reviewer independently checked the contrast arithmetic, the
current port state, and the absence of earlier audit IDs. Bundle last measured at C82 (932.25 kB).
**Next: step 4a** (ledger and comb list).
**Step 4a done (2026-11-26): ledger and comb list.** **Ledger** ([`ledger.json`](../70-ui-ux/comb-82/ledger.json),
`f6f4d2f`): the 296 admitted Gate 1 ids, built by one cold foreground subagent by § Build's rule and checked by the
orchestrator: **closed 195, partly-closed 1, advanced 3, open-routed 56, open-by-decision 17, open-unrouted 24**;
79 ids no record names (the five agent S1s → slice 8, TH14 → slice 9, TH12 → open by decision, the six TH13
layouts → 81.1, TH02 leftovers unrouted); ten TH01 ids Slice 71 left open (71:74) are open-unrouted. Orchestrator's
change to the subagent's draft: L2-012, L2-016 and L1-006 were `partly-closed` on Slice 81's "reproduce only in
part" (81:700), which means an earlier slice fixed one part and 81 closed the rest, so they are `closed` (81:1865).
Judgment calls kept, for step 5: L6-003 partly-closed (Revoke's failure text to slice 8, 78:720); W1-026, W3-012,
W2-009, W4-008 closed on 75's Outcome "evidences" (75:627, with 74:106 and 81:695); L7-009, L7-021 routed "comb" and
W1-041, W4-016 "slice 9 or the comb" (81:1166), which step 5 must settle; latest record wins for ids named twice.
**Evidence paths** (`64a80b9`, the Test plan's step 4a check): `build-comb.mjs --evidence` resolves every cited
path on this machine (a bare file name in the auditor's `ux-output/walk/<name>/`, test first in `comb.test.mjs`):
461 paths, 8 bare names resolved (C82-W1-008, W3-008 and six W4), **0 missing**. **Comb list**
([`comb-list.json`](../70-ui-ux/comb-82/comb-list.json)): items 1–22 re-verified by the orchestrator at the `C82`
build (static 4201; reproduction host 4320/5320, `setsid` + pgid files under `ux-output/walk-env/`), Q2 (c), no
fixes: **item 1 closed** (no "No workstreams yet" on archived Home renovation or Legacy attic); **item 8
partly-closed** (blocked Undo is now a headline with View details; the cascade restore toast is still two
sentences in one; expired/retired/unavailable not reachable, past the window the button reads "Nothing to undo");
**items 2–7, 9–22 open**, records `C82-CL-02`…`22` (S2: 2, 11, 16, 19, 20; the rest S3; severity is the
orchestrator's, the route is 82.1 for all, Q2 (c)). Methods as planned: item 6 by
[`repro/c82-item06-unreachable-write.js`](../../../apps/e2e/ux/walk/repro/c82-item06-unreachable-write.js) (writes and
history reads refused, `route.fallback()` otherwise: the header keeps a bare Retry after the network returns);
items 12–13 by [`repro/c82-mcp.mjs`](../../../apps/e2e/ux/walk/repro/c82-mcp.mjs) (SDK `Client`, Streamable HTTP,
protocol pinned, fixture token `prototype-user-a-readwrite`, `nested-projects`); item 16 by
[`repro/c82-open-archive-confirm.js`](../../../apps/e2e/ux/walk/repro/c82-open-archive-confirm.js) plus an MCP
`create_project` under Kitchen while the confirmation is open (the list became "its 2 workstreams", nothing
announced); item 10 by the same with the event stream aborted, so the late refusal fires. Item 20 reproduces for a
workstream creation (focus on `body` after Undo and Redo), not for a task or a section creation (focus stays on the
history button). Item 22 measured on a second, touch 375×812 daemon on the same ports: 202/178/178/136 px, identical
to the note; a resized desktop page gives lower figures, so the touch daemon is the way to measure it. Evidence
screenshots are under the git-ignored `ux-output/walk/repro/` and `repro-touch/` (some numbers repeat after the
daemon restart, and superseded takes stay on disk; only the paths the records cite count). Afterwards nothing
listened on 4200, 4201, 4310, 4320–4329 or 5320–5329, no rig process was left, `.prototype/notes.json` 1570 lines
(no product friction met; 4b records friction notes), and the product diff from `8c1a524` is empty.
`comb.test.mjs` by hand: 80 tests, 73 pass, 7 skipped, 0 fail. `pnpm test` then `pnpm lint` green. **Trap (for 4b):**
in a `walk.mjs run` script, never `context.unrouteAll()`: it removes walkd's own 4200→4201 and 4310→host routes
and the daemon stops loading the app (it happened once here; the daemon was restarted). Unroute only your own
handler, `context.unroute(pattern, handler)`. Also, `run` scripts share one function scope per call, so do not
declare `out` (it is a parameter). *Review* (one cold reviewer over `f6f4d2f`, `64a80b9` and the staged diff, process
and schema only): no substantive findings. Minors, checked: the item 22 script's comment and CL-22's repro said a
resized desktop page (fixed: it now restores the viewport it found and says to run it on a touch daemon); the
ledger and comb list carry keys the `build-comb.mjs` header did not list (now listed as unchecked extras).
Kept as they are: 46 ids close on 81:1865's general "closes as built" (allowed by the rule); 14 TH02 open-unrouted
sources name `themes.json TH02`, not a line (allowed for open ids); `--evidence` checks only `ux-output/` paths
and bare `.png/.json/.yml` names (the cited `repro/*.js` exist). **Next: step 4b** (reproduction of the 145 filed findings).

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

One protocol pass in steps 0a–7, each sized for one fresh session. Steps 1–3 are cold auditors; steps 0 and 4–7 are
the orchestrator's (protocol §2: synthesis is never delegated). Gate 3 sits between steps 5 and 6.

- **Recapture at one commit.** A slice-owned rig config (`slice82.config.ts`, ports 4258/4358) captures all 194
  matrix cells at the commit step 0b records (`C82`), the core tasks T01–T12, and a short list of post-Gate 1
  runtime surfaces the matrix does not reach (§ Capture scope). `report.ts` builds the contact sheet and axe
  summary. The build served is `apps/web/dist/web/browser` built at `C82`; its initial bundle is recorded (no web
  code changes in this slice, so the ceiling is not in play).
- **The walk rig works on Linux, driven by foreground commands.** `walk/env.sh` was written for Git Bash on Windows
  (`pwd -W` with no fallback on the data path, `env.sh:14`). Step 0a fixes that and proves the daemon lifecycle
  that foreground-only sessions need (Q6 (a), with the user-approved detached walker daemons). `walkd.mjs:24` hard-codes the static origin 4201, so the
  **orchestrator** starts one `static.mjs` on 4201 per auditor step and stops it after; walkers start only their own
  `env.sh`.
- **A fresh comb.** Four task walkthroughs (W1 mouse 1440, W2 touch 375, W3 keyboard, W4 personas Alex and Sam)
  and seven lens audits (L1–L7), each a new cold subagent that has not seen the Gate 1 findings, the themes, the
  comb list or the slice records (§ Auditor isolation and method). At most two browser jobs at once.
- **Admission.** The orchestrator reproduces every filed finding on a fresh seed or from the captures and records a
  verdict in Gate 1's vocabulary: `reproduced` and `reproduced-partly` (with a note) are admitted; `not-reproduced`,
  `not-reached` and `unverified` are excluded (Gate 1's key, `status`). The orchestrator also confirms or attaches
  the decision a finding would reopen (§ Auditor isolation). At step 5, after the ledger exists, each admitted
  finding is classified *new*, *still open* (it matches a Gate 1 finding the ledger shows open), *regression* (it
  matches one the ledger shows closed) or *introduced* (a surface or behaviour that did not exist at Gate 1).
- **Ledger reconciliation.** The Gate 1 ledger has no per-finding status (`findings/*.json`, `themes.json`):
  closures live only in the slice records (71–81; 72.1 names no Gate 1 id) and the umbrella's routing lines. A
  record's "Findings closed" table is written at plan time and some rows are conditional (Slice 81:661, :674) or say
  "advanced", and ids are abbreviated (`L1-001, -002, -003`, Slice 71:74), so the rule is: ranges are expanded; a
  *closed* or *partly closed* status cites the record's **Outcome** or its accepted answer, not only the table; an
  id no record or umbrella line names (about 80 of 296 by a reviewer's scan, mostly TH14 and TH12) is *open*, routed
  by its Gate 1 theme to the umbrella's sequence (TH14 → slice 9, TH12 → open by decision, others *open —
  unrouted*). Step 4a builds `comb-82/ledger.json` with a status from a fixed vocabulary (`closed`, `partly-closed`,
  `advanced`, `open-routed`, `open-by-decision`, `open-unrouted`) and the line each rests on.
- **The §8 comb list.** Items 1–22 in the umbrella are re-verified at `C82` by the orchestrator (not by auditors)
  and filed in the finding format (`C82-CL-01` …); item 1 is checked and recorded closed (Slice 81's Outcome: the
  tree draws no empty sentence under a root).
- **Synthesis.** Admitted findings join existing themes or new ones (TH16 …). The re-prioritised theme list is a
  **new file**, `comb-82/themes.json`, with each theme's status, priority, open Gate 1 ids and admitted comb ids;
  the Gate 1 `themes.json` is not edited, because `tooling/build-ledger.mjs:79` regenerates it wholesale. The
  stop-rule tally (`comb-82/tally.json`) is generated by `tooling/build-comb.mjs`, not written by hand, and has one
  line per §8 criterion: open S1; open S2 by theme with TH12 counted; the core-task table against the baseline with
  dead ends; serious/critical axe per colour theme and per cell, **plus** axe's `incomplete` `color-contrast` count
  (at Slice 81 every one of the 194 cells reported contrast incomplete and none serious, so "zero serious" alone
  measures nothing on glass) and L5's measured contrast results, both reported **outside the stop rule** (Q8 (a);
  L5's failures are still findings with a severity); and "mostly S3": the admitted comb findings by
  severity, split new / still open / regression / introduced.
- **Gate 3 artifact.** A digest the user can read in minutes plus the `C82` contact sheet (§ Visual acceptance).
  Gate 3 is always held after step 5 (Q5 (a)). The user routes every open S1/S2, answers any direction amendment,
  and sets or defers the S2 stop-rule number the digest proposes from this comb's tally (Q4 (c)).
- **Closing.** Gate 3 answers become decision entries or dated amendments, `direction.md` amendments (dated), the
  umbrella's handoff and sequence (with the routed ids per slice), and a `planned/` candidate for the comb fixes if
  routed. No product code changes.

## Done when

The full matrix (194 cells) and T01–T12 are captured at one recorded commit; four walkthroughs (including the 375
touch pass) and seven lens audits by cold auditors are filed in the protocol format; every filed finding has a
verdict; the Gate 1 ledger and comb items 1–22 each have a status at that commit; `comb-82/themes.json` re-prioritises
the themes and `comb-82/tally.json` gives the stop-rule tally; the user has held Gate 3 and every answer is recorded;
the routed fixes are a `planned/` candidate or listed per slice in the umbrella; and no file under `apps/web/`,
`packages/`, `apps/prototype-host/` or `prototype/` has changed since the plan's acceptance.

## Do not

- Fix anything in the product: no web, domain, contracts, host, seed or MCP change. Every finding, including an S1, is
  recorded and routed at Gate 3 (Q2 (c), Q3 (b)).
- Plan or start redesign slice 8 (agent connections), Slice 81.1 (TH13 content layouts) or redesign slice 9
  (vocabulary). None has a `planned/` file; this slice routes findings to them **in the umbrella's list only** and
  creates no plan for them.
- Show an auditor the Gate 1 evidence or anything that quotes it (§ Auditor isolation).
- Propose fixes inside findings (protocol §4.3).
- Use ports 4200 or 4310 as listeners, `route.continue()`, more than two browser jobs, or `run_in_background` (the approved exception, Q6 (a): the walk-rig
  daemons Q6 (a) describes, the orchestrator's `static.mjs` on 4201 and its Acceptance 1 probes and each walker's own
  `env.sh`, started detached with `setsid … >log 2>&1 </dev/null &` and stopped, `walk.mjs … quit` plus a kill of
  the process group or a kill of `static.mjs`, before the step or the walker reports; and, by Open question 9 (a) (user decision, 2026-11-26), the lens browsers'
  daemons (step 3, 4326–4327 / 5326–5327) and the orchestrator's reproduction host (steps 4a and 4b, 4320 / 5320) on
  the same terms, each stopped and its ports confirmed released before the lens or the step reports).
- Raise the bundle ceiling; claim the stop rule holds; close the umbrella; pass Gate 3 for the user.
- Rewrite a decision entry, the Gate 1 `themes.json`, `reproduction.json` or a Gate 1 finding record. Amend; add
  files.
- Let an auditor save a friction note (the host writes notes to the real `.prototype/notes.json`,
  `apps/prototype-host/prototype/notes.ts:18`, with no override).

## Scope check

The comb covers every surface the matrix reaches, because every surface changed: tokens (71), primitives (72), lifts
and focus (73), feedback (74–75), section chrome (76), rows (77), states (78–79), the archive cascade (80) and the
shell (81) all paint or behave on every route (Q1 (a): the whole matrix plus the listed runtime surfaces, with
`/prototype/*` reached by lenses only, not by task walks). It **records**; the fixes it finds are routed at Gate 3.
The comb list is re-verified and filed here and fixed in Slice 82.1 after Gate 3 (Q2 (c)).

## Acceptance check

Commands run from the repository root unless they say `(in apps/e2e)`. `<plan-accept>` is the commit at which the
user accepts the plan: the docs-only commit "docs(slice 82): plan taken up by the user; answers to Q1–Q8 recorded
(§77, §78)", whose hash the State header records. `C82` is the commit step 0b
captures: the commit that adds the rig files; nothing is committed between the first capture command and the last.

1. **Rig (step 0a).** `bash apps/e2e/ux/walk/env.sh --print-paths w-probe 4322 5322` prints a data path under
   `apps/e2e/ux-output/walk-env/` (never `/w-probe.json`). The method (Q6 (a)): with the orchestrator's `node
   apps/e2e/ux/walk/static.mjs apps/web/dist/web/browser 4201` (any current build; 0b rebuilds at `C82`) and two
   probes, `env.sh w-probe 4322 5322` and `env.sh w-probe2 4323 5323`, started detached (`setsid … >log 2>&1
   </dev/null &`, so the foreground command does not wait on an open pipe), the foreground commands `node apps/e2e/ux/walk/walk.mjs 5322 seed
   nested-projects`, `… goto /projects/project-kitchen`, `… shot kitchen`, `… axe kitchen` succeed on both probes and
   leave a PNG and an axe JSON in `apps/e2e/ux-output/walk/w-probe*/`; stopping one probe (`… quit` and a kill of its
   process group) leaves the other answering; after the orchestrator stops everything, nothing listens on 4201,
   4322, 4323, 5322 or 5323. Only if this detached lifecycle fails, the fallback (Q6 (a′)): `node apps/e2e/ux/walk/session.mjs` runs a step file with the same four
   actions in one foreground command and leaves the same files. `node --test apps/e2e/ux/harness.test.mjs` passes.
2. **Capture (step 0b).** `pnpm --filter web build` succeeds; the initial bundle is recorded in the State header.
   (in apps/e2e) `UX_MATCH=<range> pnpm exec playwright test --config ux/slice82.config.ts capture.ts`, in four
   ranges, `'^[a-d]'`, `'^[e-k]'`, `'^[l-o]'`, `'^[p-z]'` (Slice 81's halves took 8.6 and 5.3 minutes, near the
   10-minute foreground cap; a range that still runs long is split again), leaves `ux-output/<C82>/index.json` with
   **194/194** cells `captured` and `gaps` equal to the three entries of `matrix.ts:22-26`.
3. **Core tasks and runtime surfaces (step 0b).** (in apps/e2e) `UX_COMB=tasks pnpm exec playwright test --config
   ux/slice82.config.ts comb-verification.ts`, then `UX_COMB=surfaces` (split further by surface group if long),
   write `ux-output/<C82>/tasks/tasks.json` with T01–T12 (clicks, keystrokes, surfaces, dead
   ends) and the runtime surfaces in `ux-output/<C82>/comb/`. `docs/roadmap/70-ui-ux/comb-82/core-tasks.json`
   compares them with `baseline.json` (T01–T10) and with Slice 81's after counts
   (`completed/81-one-navigation-tree.md:1887-1889`: all at or under baseline except T08 at 4, the accepted +1, and
   T10's known dead end; T11 and T12, which have no Gate 0 baseline, are compared with those after counts only), and
   names every task over its baseline or with a dead end. Then (in apps/e2e) `node --import tsx ux/report.ts
   ux-output/<C82>` writes `index.html` (with the task table, `report.ts:24-26`), `contact-sheet.html` (overview only,
   `report.ts:27`), `axe-summary.json` and
   `coverage.json` (the umbrella's inventory rows, `coverage.ts:6-17`). The sheet's heading says "Gate 0"
   (`report.ts:21`); the digest says so rather than the rig being changed.
4. **Briefs (step 0c).** `comb-82/briefs/` holds `common.md`, `inventory.md`, `decisions.md`, `t12-setup.js` (the
   routed failed read T12 starts from) and eleven auditor briefs; `grep -rEn
   '(^|[^-0-9A-Z])([WL][0-9]-[0-9]{3}|TH[0-9]{2})|note-20[0-9-]+' docs/roadmap/70-ui-ux/comb-82/briefs` finds nothing
   (the pattern skips the `C82-` ids briefs may show).
5. **Comb filed (steps 1–3).** `comb-82/findings/` holds eleven files (`w1`–`w4`, `l1`–`l7`) and
   `comb-82/walkthroughs/` four, all passing `node --test docs/roadmap/70-ui-ux/tooling/comb.test.mjs`. Each
   walkthrough names T01–T12 for each persona it ran (W4 may use Gate 1's `Tnn-equiv` own-content ids), with
   outcome, clicks, keystrokes, dead ends and discoverability; W2's file says `viewport: "375x812"` and
   `inputMode: "touch"`, W3's `inputMode: "keyboard"`. L5's file has a `contrastTable` measured in both themes. `wc -l
   .prototype/notes.json` is the same before and after each auditor step.
6. **Admission (step 4).** `comb-82/ledger.json` has a status from the fixed vocabulary and a source for each of
   the 296 admitted Gate 1 ids. `comb-82/comb-list.json` has a status for items 1–22. `comb-82/reproduction.json`
   has a verdict (`status`) for every filed id and no other. `comb.test.mjs` passes.
7. **Synthesis (step 5).** Every admitted verdict has a `classification` and, unless *new* or *introduced*, a
   `matches` field naming the Gate 1 id. `node
   docs/roadmap/70-ui-ux/tooling/build-comb.mjs` regenerates `comb-82/tally.json`
   with no diff; `comb-82/themes.json` lists TH01–TH15 and any new theme with `status` and `priority`, and every
   admitted comb id is in exactly one theme. `git diff <plan-accept> -- docs/roadmap/70-ui-ux/themes.json
   docs/roadmap/70-ui-ux/reproduction.json docs/roadmap/70-ui-ux/findings` is empty.
8. **Gate 3 artifact (step 5).** `comb-82/gate3.md` exists, names `ux-output/<C82>/contact-sheet.html` and one crop
   per admitted S1/S2 (as code-span paths, not Markdown links: `ux-output/` is git-ignored and `check-docs.mjs`
   checks links by `existsSync`), names `core-tasks.json` for the task table, and names every decision the user must make with options and a recommendation.
9. **Closing (step 7).** Every Gate 3 answer is a decision entry or a dated amendment indexed in
   `docs/decisions/README.md`; the routed ids are a `planned/` candidate (created with `roadmap.mjs new`) or listed
   per slice in the umbrella; the umbrella handoff and `goals.md` say what is next. `git diff --stat
   <plan-accept>..HEAD -- apps/web packages apps/prototype-host prototype` is empty. `pnpm test`, then `pnpm lint`,
   are green.

## Capture scope

- **Rig.** `apps/e2e/ux/slice82.config.ts`, modelled on `slice81.config.ts`: host on **4358**
  (`.prototype/ux-slice82.json`, copied from `prototype/seeds/empty.json` before the run, as Slice 81's step 0 did),
  static build on **4258** via `walk/static.mjs`, `UX_STATIC_ORIGIN=http://localhost:4258`, `UX_OBJECTS=1` (as
  slices 77–81: `capture.ts:181` skips its legacy core-task test, and `layout.json` stays in the content coordinates
  recent captures use, `capture.ts:136`), `outputDir: ../ux-output/slice82-capture-results`,
  `testMatch: ['capture.ts', 'comb-verification.ts']`. No `UX_BEFORE` build: there is one build.
- **`comb-verification.ts`** holds the core-task test (`runCoreTasks`, as `objects-verification.ts:167` and
  `navigation-tree-verification.ts` do) and the runtime surfaces, selected by `UX_COMB=tasks|surfaces[:group]` and
  run as its own commands after the matrix ranges. All rig files write to `ux-output/<HEAD>` (`capture.ts:16,21`),
  so step 0b commits them first, records that commit as `C82`, and commits nothing else until the last capture
  command has run.
- **Walk rig ports.** Static build **4201** (walkd's fixed origin, `walkd.mjs:24`), serving the `C82` build, one per
  browser step (auditor steps and 4a/4b), started and stopped by the orchestrator; walker hosts 4322–4325 and control ports 5322–5325; lens browsers
  4326–4327 and 5326–5327; reproduction host 4320 on control 5320. Never 4200/4310 as listeners
  (walkd routes the app's 4200/4310 requests to these, `walkd.mjs:24-25`).
- **The matrix:** all 194 cells of `matrix.ts`, both themes, 1440/1024/375 as the matrix assigns them, all six seeds.
- **Runtime surfaces** the matrix does not reach but the comb must see, captured once each (light 1440 and dark 375)
  by `comb-verification.ts`, each borrowing the steps of the named slice verification file (no new product
  selectors): the toast with Undo after a section removal (74, `feedback-verification.ts`), a row failure and
  Saving…/Saved in the drawer (75, `placement-verification.ts`), a recovered failed section (78,
  `states-verification.ts`), the archive cascade confirmation in the 375 drawer (80,
  `cascading-archive-verification.ts`), and the edit-project menu, the drawer tree at depth and the skip link
  focused (81, `navigation-tree-verification.ts`).
- **No pairs.** This slice changes no product code, so every cell is evidence, not a pair. The Gate 0 captures
  (`c94f0f0e…`) are not on this machine; per Q5 (a) there is no before/after sheet: the `C82` contact sheet stands
  alone.
- **Disk.** `apps/e2e/ux-output` holds 6.9 GB of earlier commit folders. Step 0b deletes none; it records free space
  first and stops if under 3 GB (the user decides what to prune).

## Visual acceptance

There are no before/after pairs: nothing is fixed. What the user looks at, at Gate 3 (Q5 (a): always held after step 5; local files, no publication):

- `comb-82/gate3.md`: the counts (filed, admitted by severity, new / still open / regression / introduced), the
  stop-rule tally, the re-prioritised theme list with each theme's status, each open S1/S2 with its proposed route,
  the comb-list verdicts, the core-task table, any direction amendment proposed and the S2 number proposal
  from this comb's tally (Q4 (c)), each decision with options and a recommendation.
- The contact sheet at `C82` (`report.ts`'s `contact-sheet.html`), and per admitted S1/S2 one crop from the
  finding's evidence, named in the digest as a code-span path.

## Behaviour vs. appearance

Neither changes. The only product-tree code change is `CURRENT_SLICE = 82` (done in the plan session); the rest is
disposable rig and tooling under `apps/e2e/ux/` and `docs/roadmap/70-ui-ux/tooling/`. Every existing test stays
green untouched.

## Auditor isolation and method

- **Cold briefs.** Each auditor gets `briefs/common.md` (the goal of the comb, the finding format of protocol §4.3 and
  the JSON shape `comb.test.mjs` enforces, the verdict that only the orchestrator gives, no fixes, no notes, the rig
  commands, the forbidden reading), `briefs/inventory.md` (the umbrella's *Surface inventory* rows with finding and
  theme ids stripped), `briefs/decisions.md` (each decision's title and path from `docs/decisions/README.md`, ids
  stripped), and its own brief (its lens or task list, its id prefix, seeds, personas, ports and output files).
  Briefs are committed so the run is reproducible.
- **Decisions without the leak.** Decision entries quote Gate 1 finding ids (about thirty of them). An auditor does
  not open them: when a finding contradicts a decision it names the decision by its title from `decisions.md` in
  `decisionReopened`; the orchestrator confirms or attaches the citation at admission (protocol §4.3 is met at
  admission, before synthesis).
- **Forbidden reading**, named in every brief: all of `docs/roadmap/` (including the umbrella) except the
  auditor's own brief and output files and the shared brief files; `docs/decisions/` entries; `docs/architecture/`;
  `.prototype/notes.json`; git history; all of `apps/e2e/` except `ux/walk/*.mjs` and `walk/env.sh`;
  `apps/e2e/ux-output/` except `<C82>/` and its own `walk/<name>/`; and source comments (`apps/web/src/**/*.ts` and
  `.html`). Every brief opens by **overriding AGENTS.md's start-up instruction** to read the roadmap: the auditor
  reads AGENTS.md §1 for orientation only and nothing in `docs/` beyond its brief files. L2's token-escape
  check is one given command over `apps/web/src/**/*.scss` that prints only lines with a literal value and drops
  comment lines. Each findings file carries an `attestation` string saying the auditor kept to this; the
  orchestrator spot-checks any finding that echoes Gate 1 wording. *Known limit:* a determined auditor could still
  meet an id in SCSS comments; the attestation and the spot check are the guard.
- **Walkthroughs (W1–W4)** drive the running app through the walk rig, narrating the expectation before each act
  (protocol §4.1). W1: Demo, mouse, 1440, both themes across the tasks. W2: Demo, touch, 375×812, its own pass.
  W3: Demo, keyboard only, 1440. W4: Alex and Sam, mouse, 1440, own-content equivalents. Each runs **T01–T11** and
  records Gate 1's walkthrough fields (outcome, clicks, keystrokes, surfaces, dead ends,
  `firstCorrectActionFoundImmediately`, discoverability, steps). **T12** (recover a section after a failed read)
  starts from a routed 500 (`tasks.ts:163-168`); the failure is the starting condition, not the answer, so the
  walker runs, from the repository root, `node apps/e2e/ux/walk/walk.mjs <ctl> seed busy-week`, then `… goto
  /projects/project-launch` (seeding is the daemon's own command, which knows the walker's host port and resets the
  clock, `walkd.mjs:40`), then `… run -f docs/roadmap/70-ui-ux/comb-82/briefs/t12-setup.js`; the recovery is its
  own. `run` passes only `page, context, expect, out` (`walkd.mjs:36`), so the file inlines the rest of
  `tasks.ts:163-171`: route `GET /api/tasks` to a 500 with `route.fallback()` for everything else, reload, wait for
  the task-list frame's failure text, then lift the failure (a flag or `page.unroute`) before handing over, so Try
  again can succeed. Step 0c proves it once on a probe. W4 runs T12 as a `T12-equiv` on its persona's own project:
  it switches persona first, then runs the setup file with the path set to that project, so the failed read is in
  place for the persona walking it. T11 and T12 are new since
  Gate 1, whose walks covered T01–T10; that difference is recorded in the digest.
- **Lenses (L1–L7)** read the `C82` captures at full resolution (crops, `layout.json`, `aria.yml`, `axe.json`), may
  hold one walk-rig browser to confirm a fact (L3 and L5 on 4326/5326, L4 and L7 on 4327/5327, when the launch
  message allows it; the lens starts that `env.sh` daemon detached and stops it, `walk.mjs … quit` plus a kill of its
  process group, confirming its ports are released before it reports: Q6 (a)'s lifecycle, extended by Open
  question 9 (a); fallback (a′) `session.mjs`), and use the given token-escape command (L2). **Themes:** `walkd` sets
  the colour scheme at launch (`--theme`, default dark, `walkd.mjs:23`); each brief names the theme per daemon, and
  W1 switches with `page.emulateMedia({ colorScheme })` through `run` halfway through its tasks and records a
  per-task `theme` field (Gate 1's file-level `theme` stays as the starting theme); a persona's stored
  theme preference overrides the device and is recorded as such. **L5** measures contrast
  itself, because axe marks `color-contrast` incomplete over glass: computed foreground and backdrop colours
  (`getComputedStyle` plus pixel sampling of the screenshot behind the text) for body, muted and control text in
  both themes on a named cell list, filed as Gate 1's `contrastTable` shape; keyboard-only completion is W3's.
- **Ids.** `C82-W1-001` …, `C82-L3-004` …, `C82-CL-01` … (comb list). Records carry Gate 1's fields (id, surface,
  inventoryRow, seed, theme, viewport, state, persona, evidence, repro, expected, actual, lens, heuristic, severity,
  confidence, decisionReopened) plus `auditor`, and no fix.
- **Browser jobs.** At most two at once across the run: W1 with W2 in step 1, W3 with W4 in step 2, and in step 3 at
  most two lenses holding a browser.

## Severity and routing rule (what this slice fixes)

This slice fixes **nothing in the product** (Q2 (c), Q3 (b), user decision 2026-11-24). It produces a routed
list. Routes (comb-list items to 82.1 decided by Q2 (c); the rest proposed for the
user at Gate 3, Q3 (b)):

- the five agent-connection S1s and anything about connecting, revoking or inspecting agents → redesign slice 8;
- vocabulary, ids, enums, casing and dates (TH14) → redesign slice 9;
- the six TH13 content layouts already queued → Slice 81.1, plus any new narrow-layout finding the user adds to it;
- TH12 scaffolding → open by decision, counted in the tally;
- everything else S1/S2, and every comb-list item still open at `C82` whatever its severity (Q2 (c)) even where an earlier bullet would also fit, → a new follow-on, **Slice 82.1 — comb
  fixes**, created at step 7 with `roadmap.mjs new` as a `planned/` candidate carrying the routed ids, ordered before
  redesign slice 8 unless the user orders otherwise; a new S1 that blocks a core task goes first in 82.1 (Q3 (b));
- S3 (comb-list items excepted, Q2 (c)) → left in the ledger, listed in the digest, routed only if the user picks some.

Routes to slices 8, 9 and 81.1 are written as id lists in the umbrella's sequence, not as plans.

## File-level change list

### Code (the only allowed product-tree file)

| File | Change | Responsibility |
|---|---|---|
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` | modify (plan session, `2e0f500`) | `CURRENT_SLICE = 82`; `dev-panel-store.spec.ts` pins the constant and stays green |

### Rig (disposable, `apps/e2e/ux/`)

| File | Change | Responsibility |
|---|---|---|
| `apps/e2e/ux/walk/env.sh` | modify (0a) | Linux paths (no `pwd -W` without a fallback); data under `ux-output/walk-env/`; `--print-paths` dry run |
| `apps/e2e/ux/harness.test.mjs` | modify (0a, test first) | `env.sh --print-paths` gives a data path under `ux-output/walk-env/` (red on Linux today) |
| `apps/e2e/ux/walk/session.mjs` | create only if Acceptance 1's detached lifecycle fails (0a, Q6 (a′)) | Foreground fallback: one process per walker step file, replaying from the seed, so page state is explicit |
| `apps/e2e/ux/slice82.config.ts` | create (0b) | Capture config on 4258/4358, `.prototype/ux-slice82.json`, `UX_OBJECTS=1` |
| `apps/e2e/ux/comb-verification.ts` | create (0b) | Core tasks T01–T12 and the runtime surfaces |
| `apps/e2e/ux/walk/repro/c82-*.js` | create (4a–4b) | The orchestrator's reproduction scripts |

### Evidence and tooling (`docs/roadmap/70-ui-ux/`)

| File | Change | Responsibility |
|---|---|---|
| `tooling/comb.test.mjs` | create (0a, test first) | Schema and consistency tests (§ Test plan) |
| `tooling/build-comb.mjs` | create (0a skeleton, 5) | Validates the comb files, generates `tally.json` |
| `comb-82/core-tasks.json` | create (0b) | T01–T12 at `C82` against the baseline |
| `comb-82/briefs/*.md`, `briefs/t12-setup.js` | create (0c) | Common brief, inventory, decisions list, the T12 starting failure, eleven auditor briefs |
| `comb-82/findings/{w1..w4,l1..l7}.json` | create (1–3) | Filed findings, by auditor |
| `comb-82/walkthroughs/{w1..w4}.json` | create (1–2) | Task runs, Gate 1 walkthrough shape |
| `comb-82/reproduction.json` | create (4b; classification added at 5) | Verdict per filed id, method, classification |
| `comb-82/ledger.json` | create (4a) | Status of the 296 Gate 1 admitted findings with a source line each |
| `comb-82/comb-list.json` | create (4a) | Items 1–22: status at `C82`, note id, the `C82-CL-nn` record where still open |
| `comb-82/themes.json` | create (5) | Re-prioritised themes: status, priority, open Gate 1 ids, admitted comb ids, new TH16+ |
| `comb-82/tally.json` | create (5, generated) | The stop-rule tally |
| `comb-82/gate3.md` | create (5) | Digest and decisions for Gate 3 |

### Documentation

| File | Change | Responsibility |
|---|---|---|
| `docs/roadmap/active/82-overhaul-comb.md` | modify | This plan: State header each session, Revisions, Outcome |
| `docs/roadmap/active/70-ui-ux-overhaul.md` | modify | Handoff: Slice 82 active (plan session); at step 7 the comb result, routed ids per slice, the comb list replaced by a pointer to `comb-list.json`, the next slice |
| `docs/roadmap/goals.md` | modify | "Now": Slice 82 active (plan session); at step 7 what is next |
| `docs/roadmap/70-ui-ux/direction.md` | modify (7, only if Gate 3 amends) | Dated amendment under the principle it changes |
| `docs/decisions/*.md`, `docs/decisions/README.md` | create / amend (7) | One entry per Gate 3 answer; dated amendments to reopened ones |
| `docs/roadmap/planned/82.1-comb-fixes.md`, `docs/roadmap/planned/README.md` | create / modify (7, if routed) | The candidate with the routed ids; the README's file count ("The seven files here") |
| `docs/architecture/testing/how.md`, `what.md` | modify (0a, 0b) | The walk rig's Linux and detached use, the slice 82 ports, the comb tooling and where its test runs |
| `docs/guides/ui-ux-overhaul-protocol.md` | modify only if the user changes a protocol rule at Gate 3 | — |
| `.prototype/notes.json` | append (4) | Friction the orchestrator meets while reproducing (§79) |

## Implementation sequence

Each step is one fresh session; each ends with a State header update and a commit (`test(slice 82): …` or
`docs(slice 82): …`, citing §N). A step that cannot finish hands off at a green point.

- **0a. Rig and tests.** Write `harness.test.mjs`'s `--print-paths` test (red on Linux) and `comb.test.mjs`'s
  schema tests against small fixtures (red: no validator); fix `env.sh`, write `build-comb.mjs`'s validator, prove
  the detached walk lifecycle (Acceptance 1), and write `session.mjs` only if Acceptance 1 fails, per Q6 (a′). Update `testing/how.md`.
- **0b. Recapture.** Write `slice82.config.ts` and `comb-verification.ts` and commit them (`C82`); build the web app,
  record the bundle, check disk. Capture the four matrix ranges, then the core tasks and runtime surfaces; run
  `report.ts` (it launches Chromium for `contact-sheet.png`, `report.ts:27`, so it runs alone); then write and
  commit `core-tasks.json` and the State header.
- **0c. Briefs.** Write the shared brief files, `t12-setup.js` and the eleven auditor briefs; check them with
  Acceptance 4.
- **1. Walkthroughs W1 (mouse 1440) and W2 (touch 375).** Two cold foreground subagents, two browsers. The
  orchestrator checks each file passes `comb.test.mjs` and the notes line count; it does not edit findings.
- **2. Walkthroughs W3 (keyboard) and W4 (personas).** Same.
- **3. Lenses L1–L7.** Seven cold foreground subagents over the captures, at most two holding a browser; two batches
  (L1–L4, L5–L7) if one session cannot hold seven reports. A lens browser is an `env.sh` daemon on the walkers'
  detached lifecycle and stop rule (Open question 9 (a)): the lens stops it and confirms 4326/5326 or 4327/5327
  released before it reports; the orchestrator confirms the same before the step reports.
- **4a. Ledger and comb list.** Build `ledger.json` by the rule in § Build; re-verify comb items 1–22 and write
  `comb-list.json` and the `C82-CL-*` records. Items that need more than a click: item 6 (a write failing while the
  workspace is unreachable) by a routed failure with `route.fallback()`; items 12 and 13 (`restore_project` and the
  archive refusal as agents see them) through MCP at `http://127.0.0.1:4320/mcp` (`apps/prototype-host/main.ts:213`)
  with the fixture token `prototype-user-a-readwrite` (`packages/prototype-data` `agent-tokens.ts:18-22`), on the
  `nested-projects` seed (it holds `agent-claude`, which the token needs, `agent-tokens.ts:15-16`), driven by an SDK
  `Client` script in `repro/` that initialises a Streamable HTTP session first; item 16 (a live frame rewriting an open confirmation) by a second write to host 4320
  while the confirmation is open. Host 4320 is the reproduction host, on the detached lifecycle and stop rule 4b names
  (Open question 9 (a)).
- **4b. Reproduction.** The orchestrator serves the static build on 4201 for 4a and 4b too, and runs the
  reproduction host (4320, control 5320) for both as an `env.sh` daemon on the walkers' detached lifecycle and stop
  rule (Open question 9 (a)): started with `setsid`, stopped with `walk.mjs 5320 quit` plus a kill of its process
  group, 4320 and 5320 confirmed released before 4a or 4b reports, fallback (a′) `session.mjs`. Reproduce every filed
  finding (host 4320, scripts `repro/c82-*.js`), confirm decision
  citations, write `reproduction.json`, record friction notes.
- **5. Synthesis and the Gate 3 artifact.** Classify against the ledger, cluster, write `comb-82/themes.json`, generate `tally.json`,
  write `gate3.md`. State header: awaiting Gate 3. End with `CHAIN: STOP`.
- **6. Gate 3** (the user). Nothing runs until the answers are in.
- **7. Record and close.** Decision entries and amendments, `direction.md` amendments if any, the 82.1 candidate and
  the umbrella's per-slice id lists, the umbrella handoff and `goals.md`, Outcome, `roadmap.mjs complete`.

## Test plan — tests first

No product behaviour changes, so no product test is written or changed. The tooling the comb trusts is tested first
(step 0a), against small fixtures, before any real comb file exists.

| Test | Proves |
|---|---|
| `apps/e2e/ux/harness.test.mjs`: `env.sh --print-paths` data path is under `ux-output/walk-env` | The rig no longer writes `/<name>.json` on Linux (red before the fix) |
| `tooling/comb.test.mjs`: every finding has Gate 1's fields plus `auditor`, a `C82-` id, severity S1–S3, a lens or `task:Tnn`, and no `fix` / `suggestion` / `recommendation` key | Findings follow §4.3 and carry no fix |
| `comb.test.mjs`: `decisionReopened` is null or a title or path listed in `briefs/decisions.md` | A reopened decision is cited in a checkable form |
| `comb.test.mjs`: every findings file has a non-empty `attestation` | The isolation statement is present |
| `comb.test.mjs`: ids are unique across all files | No collisions between auditors |
| `comb.test.mjs`: every filed id has exactly one verdict whose `status` is one of Gate 1's five values, and no verdict names an unfiled id | Nothing enters synthesis unverified |
| `comb.test.mjs`: from step 5 (when `comb-82/themes.json` exists) every admitted verdict has a `classification`, and all but *new*/*introduced* a `matches` Gate 1 id | Classification is complete |
| `comb.test.mjs`: a *regression* names a Gate 1 id the ledger marks `closed` or `partly-closed`; a *still open* names one it marks open | The classification agrees with the ledger |
| `comb.test.mjs`: ledger statuses are from the six-value vocabulary, and `closed`/`partly-closed` cite a record's Outcome or answer line | The reconciliation rule is kept |
| `comb.test.mjs`: every admitted id (`reproduced`, `reproduced-partly`) is in exactly one theme in `comb-82/themes.json`; no excluded id is | Clustering is total and clean |
| `comb.test.mjs`: every Gate 1 admitted id appears once in `ledger.json` with a status and a source | The reconciliation is complete |
| `comb.test.mjs`: the comb list has items 1–22, each with a status, and an open item has a `C82-CL` record | The comb list is accounted for |
| `comb.test.mjs`: `tally.json` equals what `build-comb.mjs` computes from the files | The tally is generated, not hand-edited |
| `comb.test.mjs`: each walkthrough has T01–T12 (or `Tnn-equiv`) for each persona it names; W2 is `375x812` with `inputMode: "touch"`, W3 `keyboard` | The task walks are complete, and the touch and keyboard passes are those |
| `comb.test.mjs`: `tally.json` has a line for each §8 criterion, including contrast-incomplete and comb severity split | The tally answers the whole stop rule |

Each consistency test is skipped while its input file does not yet exist (the comb is mid-run between steps) and is
required from the step that writes it. The fixtures hold one good set and one bad file per check, and each check is
seen rejecting its bad file at 0a. `comb.test.mjs` runs by hand at
each step and in the Acceptance check only, not in the root `pnpm test` (Q7 (a)). Evidence paths (screenshots under the git-ignored `ux-output/`) are checked by `build-comb.mjs` at step 4a
on this machine, not by the test.

## Boundaries touched

- **None of the architecture's code boundaries** are near: no product code changes (Behaviour vs. appearance).
- **`core/` → `prototype/`**: `CURRENT_SLICE` is in `prototype/dev-panel`; unchanged boundary.
- **Ports and data isolation** (Operational traps): the rig never listens on 4200/4310 and never reads or writes the
  developer's `.prototype/data.json`; walk hosts use scratch files under `ux-output/walk-env/`. The one shared file a
  walk host can still write is `.prototype/notes.json`; briefs forbid saving notes and Acceptance 5 checks it.
- **Decision log (§78)**: Gate 3 answers amend entries with dated amendments, never rewrite them.
- **Never build (§80)**: nothing here approaches it; any finding that would need it is recorded as such.

## Explicit non-goals

- Fixing any finding, including the comb list and any S1 (routed at Gate 3; Slice 82.1 or the owning slice).
- Redesign slice 8 (agent connections), Slice 81.1, redesign slice 9: not planned, not started, no plan files.
- Meeting the stop rule, or deciding it holds. This comb reports the tally; the final comb after slices 8 and 9 is
  the one that may stop the umbrella.
- Storybook capture, drag frames, race and fault fixtures (the matrix's known gaps, `matrix.ts:22-26`).
- A published page (ChatGPT Site or Claude artifact). The Gate 3 artifact is local files, no publication
  (Q5 (a)).
- New capture surfaces beyond the listed runtime ones; changing `matrix.ts` (it would change the denominator every
  sheet profile uses).
- Editing or re-running `build-ledger.mjs` (it would regenerate the Gate 1 `themes.json`).
- Pruning `ux-output`.

## Open questions

Questions 1–8 were resolved by the user on 2026-11-24 and question 9 on 2026-11-26, each as recommended. The options are kept as written; each
question carries its answer, and the plan above reads the answers as settled.

1. **Resolved (user decision, 2026-11-24): (a).** **What "changed surfaces" means.** *Context:* protocol §8 says "a fresh comb on the changed surfaces"; no comb has
   run since Gate 1, and slices 71–81 changed tokens, primitives, patterns and the shell, which paint every route.
   *Options:* (a) the whole matrix, all six seeds, both themes, three widths, plus the listed runtime surfaces;
   (b) only surfaces a slice record lists in its capture scope as "must change"; (c) only the patterns and shell
   surfaces (project pages, sections, rows, states, navigation), skipping dashboard, settings, calendar, search and
   `/prototype/*`. *Recommendation:* (a), with `/prototype/*` (dev tooling, TH12 by decision) reached by lenses only,
   not by task walks. *Impact:* (a) is the most auditor time and the only option that can find regressions on
   surfaces no slice listed; (b) and (c) are cheaper and blind to exactly the cross-cutting changes the overhaul made.
   *Answer (user decision, 2026-11-24, as recommended):* **(a)** — the whole matrix (all six seeds, both themes, three widths) plus the listed runtime surfaces, with `/prototype/*` reached by lenses only, not by task walks.
2. **Resolved (user decision, 2026-11-24): (c).** **The comb list (items 1–22).** *Context:* 21 open wording, focus and consistency items the user parked for the
   comb (item 1 is closed by Slices 80–81). *Options:* (a) fix them in this slice; (b) re-verify and file them only;
   (c) split: re-verify and file here, fix in a follow-on (Slice 82.1) after Gate 3 with the comb's new S1/S2.
   *Recommendation:* (c). *Impact:* (a) puts web code and the bundle into a recording slice and lets the comb's
   evidence predate its fixes; (c) keeps one commit as evidence and lets Gate 3 order the fixes with everything
   else; (b) without a follow-on leaves them nowhere.
   *Answer (user decision, 2026-11-24, as recommended):* **(c)** — re-verify and file comb items 1–22 here; fix them in a follow-on Slice 82.1 after Gate 3.
3. **Resolved (user decision, 2026-11-24): (b).** **New S1/S2 findings.** *Context:* the comb will find some; slices 8, 9 and 81.1 are pending, and TH12's S2s
   stay open by decision. *Options:* (a) fix here; (b) route each at Gate 3 to slice 8, 9, 81.1, open-by-decision or
   a new Slice 82.1 (§ Severity and routing rule); (c) route everything to the existing slices only. *Recommendation:*
   (b), and a new S1 that blocks a core task goes first in 82.1. *Impact:* (b) adds one slice before agent
   connections; (c) overloads slice 9 with non-vocabulary items.
   *Answer (user decision, 2026-11-24, as recommended):* **(b)** — route each new S1/S2 at Gate 3 to slice 8, slice 9, 81.1, open-by-decision or a new Slice 82.1; a new S1 that blocks a core task goes first in 82.1.
4. **Resolved (user decision, 2026-11-24): (c).** **The stop rule's S2 number.** *Context:* protocol §8 needs "S2 findings below an agreed number"; none is agreed.
   *Options:* (a) choose a number now; (b) leave it to the final comb after slices 8 and 9; (c) have Gate 3 propose
   one from this comb's tally, for the user to set or defer. *Recommendation:* (c). *Impact:* a number chosen now has
   no data; one set at Gate 3 is informed and still early enough to steer 82.1, 8 and 9.
   *Answer (user decision, 2026-11-24, as recommended):* **(c)** — Gate 3 proposes the S2 stop-rule number from this comb's tally, for the user to set or defer.
5. **Resolved (user decision, 2026-11-24): (a).** **Gate 3: when and what.** *Context:* protocol §8 holds Gate 3 "if the direction needs amending". Routing the
   open S1/S2 needs the user regardless. The Gate 0 captures are not on this machine (the private ChatGPT Site holds
   them). *Options:* (a) always hold Gate 3 after step 5, reviewing the digest, the theme list, the routing, any
   direction amendment and the `C82` contact sheet; (b) hold it only if a direction amendment is proposed, routing by
   default; (c) as (a), plus a before/after sheet against the oldest full local capture instead of Gate 0.
   *Recommendation:* (a), local files, no publication. *Impact:* (b) routes S1/S2 without the product owner; (c)
   costs a session of sheet work and compares against a build that is not the baseline.
   *Answer (user decision, 2026-11-24, as recommended):* **(a)** — always hold Gate 3 after step 5 (digest, theme list, routing, any direction amendment, the `C82` contact sheet); local files, no publication.
6. **Resolved (user decision, 2026-11-24): (a).** **Auditor method, count and rig lifecycle.** *Context:* Gate 1 used eleven auditors (four walks, seven lenses)
   and the walk rig's daemon (`env.sh` + `walkd.mjs`, one persistent page per auditor). This environment runs
   subagents and long commands in the foreground and allows two browser jobs. *Options:* (a) eleven auditors as Gate
   1; the orchestrator starts one `static.mjs` on 4201 per step, and each walker starts its own `env.sh`
   **detached** (`setsid … >log 2>&1 </dev/null &` inside one foreground command, with `walk.mjs … quit` and a kill of its process group
   before it reports), so its page persists across its foreground `walk.mjs` commands; step 0a proves this, and if it fails, (a′) `session.mjs` replays each step file from a fresh
   seed in one foreground process; (b) six auditors (a mouse-and-keyboard walk, a touch walk, a personas walk, three
   merged lenses); (c) walks only. *Recommendation:* (a), for comparability with Gate 1. *Impact:* (a) is about four
   auditor sessions; a detached daemon is outside the "never background" rule's letter only in that it outlives one
   command, never the walker's turn; (a′) loses the walker's live page between steps; (b) halves the cost and loses
   lens independence; (c) loses the capture-based lenses that found most S3s.
   *Answer (user decision, 2026-11-24, as recommended):* **(a)** — eleven auditors as Gate 1; walkers start their own `env.sh` daemon detached as above, and every walker stops it (`walk.mjs … quit` plus a kill of its process group) and confirms its ports are released before it reports. The user explicitly approves this narrow exception to the foreground-only rule. If step 0a's Acceptance 1 shows the detached lifecycle fails, fall back to (a′), the `session.mjs` replay driver, without a new question.
7. **Resolved (user decision, 2026-11-24): (a).** **Where `comb.test.mjs` runs.** *Context:* `build-sheet.test.mjs` lives in the same folder and is run by hand
   (`testing/how.md:538`); the root `pnpm test` runs only `scripts/*.test.mjs` and the workspace packages.
   *Options:* (a) by hand at each step and in the Acceptance check only; (b) add it to the root `test` script.
   *Recommendation:* (a), matching `build-sheet.test.mjs`. *Impact:* (b) puts disposable evidence checks into the
   offline gate; its skip-while-absent rule keeps it green mid-run, but a half-written file would fail `pnpm test`.
   *Answer (user decision, 2026-11-24, as recommended):* **(a)** — `comb.test.mjs` runs by hand at each step and in the Acceptance check only, not in the root `pnpm test`.
8. **Resolved (user decision, 2026-11-24): (a).** **Contrast and the stop rule.** *Context:* §8 asks for zero serious or critical axe violations in either theme.
   Over frosted glass axe cannot decide contrast: at Slice 81 all 194 cells reported `color-contrast` *incomplete*
   and none serious, so the criterion passes without measuring. The user accepted Depth's demo tints at Gate 1:
   worst-case AA "is reported on every sheet but no longer gates" (umbrella, *Answered after Gate 1*). *Options:*
   (a) report L5's measured contrast and the incomplete count in the tally and digest, outside the stop rule, as the
   Gate 1 answer says; (b) count L5's measured AA failures as serious axe-equivalent violations in the stop rule;
   (c) as (a) now, and ask again at the final comb. *Recommendation:* (a), which keeps the Gate 1 answer; L5's
   failures are still findings with a severity. *Impact:* (b) reopens the contrast answer and could block the stop
   rule on the accepted tints; (a) leaves the axe criterion as "zero serious on what axe can decide", which the digest
   says plainly.
   *Answer (user decision, 2026-11-24, as recommended):* **(a)** — report L5's measured contrast and axe's `color-contrast` incomplete count in the tally and digest, outside the stop rule (keeps the Gate 1 answer); L5's failures are still findings with a severity.
9. **Resolved (user decision, 2026-11-26): (a).** **Lens and reproduction daemons under Q6 (a).** *Context:* the user's Q6 (a) approval names the walkers' detached
   `env.sh` daemons and the orchestrator's `static.mjs` on 4201 (and step 0a's probes, which prove them). The plan also
   runs walk-rig daemons for the lens browsers (step 3, 4326–4327 / 5326–5327) and the orchestrator's reproduction
   host (steps 4a–4b, 4320 / 5320), which Q6 (a)'s text does not name. *Options:* (a) they use the same detached
   lifecycle on the same terms (started with `setsid`, stopped with `quit` plus a process-group kill and their ports
   confirmed released before the lens or the step reports); (b) they use the (a′) `session.mjs` replay driver, one
   foreground process per step file, even if the detached lifecycle works. *Recommendation:* (a), the same mechanism
   and the same stop rule the user approved, with (b) as the fallback. *Impact:* blocks nothing in steps 0a–2; it
   must be answered before step 3 (lenses) starts. (b) needs `session.mjs` written even when 0a's Acceptance 1
   passes.
   *Answer (user decision, 2026-11-26, as recommended):* **(a)** — the lens browsers (step 3, L1–L7, 4326–4327 / 5326–5327) and the orchestrator's reproduction host (steps 4a and 4b, 4320 / 5320) use the same detached lifecycle and stop rule the user approved for the walkers: started with `setsid`, stopped with `quit` plus a process-group kill, ports confirmed released before the lens or the step reports, nothing detached outliving the session; the (a′) `session.mjs` replay driver is the fallback. The user did not ask to rerun W4: step 2's W4 is kept as filed (its resumed-walk deviation is disclosed in the State header).

## Revisions

- **Draft (2026-11-24, `2e0f500`):** first draft.
- **Round 1 (2026-11-24):** a cold reviewer returned 7 substantive and 6 minor findings, all checked against the code
  and all held. Changes: Acceptance's coverage check now reads `index.json`'s `gaps` (`coverage.json` lists inventory
  rows, `coverage.ts:6-17`; the gaps are `matrix.ts:22-26`); the config sets `UX_OBJECTS=1` and the core tasks run
  once from `comb-verification.ts`, not twice inside the matrix halves; the core-task comparison cites Slice 81's
  after counts (`:1887-1889`), not its before counts; auditor isolation now covers decision entries (a stripped
  title list, citation confirmed at admission), the repro scripts, verification files, `tasks.ts`, older
  `ux-output` folders and source comments, with an attestation and a stated limit; the re-prioritised themes go to a
  new `comb-82/themes.json`, because `build-ledger.mjs:79` regenerates the Gate 1 file; walks cover T01–T11 with T12
  script-only (a routed 500 a cold walker cannot cause), recorded as a deviation; step 0 is split into 0a/0b/0c and
  step 4 into 4a/4b; the axe tally is per colour theme; `env.sh:14`, eleven auditors; Acceptance 1 starts
  `static.mjs` on 4201 and checks the ports are released; `env.sh` gets a `--print-paths` dry run for its test; the
  detached-daemon lifecycle and the `session.mjs` fallback are spelled out in Q6; tests added for the attestation,
  `decisionReopened`, the verdict vocabulary and W2's touch pass; auditors may not save notes (the host writes the
  real `notes.json`, `notes.ts:18`) and Acceptance 5 checks it; routes to slices 8, 9 and 81.1 are umbrella id lists,
  not plans; 82.1 is created with `roadmap.mjs new`; `planned/README.md` and `testing/what.md` joined the change list.

- **Round 2 (2026-11-24):** a cold reviewer returned 6 substantive and 4 minor findings; spot-checked (194/194
  Slice 81 cells report `color-contrast` incomplete with zero serious; Gate 1 uses `inputMode: "touch"`; Slice 81's
  table has conditional closes at :661/:674) and all held. Changes: the orchestrator owns the one static server on
  4201 per step (two walkers could not each bind it), and Acceptance 1 proves two probes side by side; the tally
  covers every §8 criterion, adding axe's contrast-incomplete count, L5's measured contrast and the "mostly S3" split;
  L5 gets a contrast method; new Open question 8 on contrast and the stop rule; the ledger rule (expanded ranges,
  closed only on an Outcome or answer line, unnamed ids open by theme, a fixed status vocabulary); the ledger is
  built before reproduction and classification moves to step 5; the matrix runs in four ranges and the verification
  file by `UX_COMB`, under the 10-minute cap; `C82` is the rig commit and nothing is committed mid-capture; forbidden
  reading adds `docs/architecture/`, `apps/e2e/**` and the umbrella, and briefs override AGENTS.md's read-the-roadmap
  instruction; T12 is walked from a setup file instead of script-only; tests for the ledger vocabulary, the
  classification against the ledger, bad fixtures per check, `inputMode`, `Tnn-equiv` and Gate 1's `status` key;
  cwd per command; `report.ts` after the tasks; the sheet's "Gate 0" heading is named in the digest; lens ports;
  methods for comb items 6, 12, 13 and 16; an Acceptance 1 variant for (a′).

- **Round 3 (2026-11-24):** a cold reviewer returned 3 substantive and 6 minor findings; checked (`tasks.ts:163-171`,
  `report.ts:24-27`) and all held. Changes: `t12-setup.js` is specified (inline wait, lift the failure before handing
  over, full path, proven at 0c); the task table is in `index.html`, not the contact sheet, and the digest names
  `core-tasks.json`; `<plan-accept>` is recorded by the acceptance session; a classification test and a `matches`
  field; walk themes have a method; the orchestrator also serves 4201 for 4a/4b, and 0a may use any current build;
  the MCP route, token, seed and client for comb items 12–13; detached starts redirect their streams; `gate3.md`
  names `ux-output/` paths as code spans, since the folder is git-ignored and `check-docs` checks links.

- **Round 4 (2026-11-24):** a cold closure reviewer confirmed the cited facts and returned 2 substantive and 3 minor
  findings, all held. Changes: Acceptance 4's id grep no longer matches the `C82-` ids a brief may show; T12's setup
  seeds and navigates with walkd's own commands before `run -f`, and the file only routes, waits and lifts; W1
  records a per-task `theme`; `report.ts` runs alone because it launches a browser.

- **Round 5 (2026-11-24):** a cold closure reviewer re-checked the load-bearing facts and returned **no substantive
  findings**, plus two minor ones, both applied: two `walkd.mjs` line citations (:40 seed, :36 run), and W4 runs T12
  as a `T12-equiv` on the persona's own project. Review closed.

- **Acceptance (2026-11-24, user decision):** the user accepted the plan with all eight recommendations: Q1 (a) the
  whole matrix, `/prototype/*` by lenses only; Q2 (c) re-verify and file comb items 1–22 here, fix in Slice 82.1
  after Gate 3; Q3 (b) route new S1/S2 at Gate 3 to slice 8, slice 9, 81.1, open-by-decision or 82.1, a new S1 that
  blocks a core task first in 82.1; Q4 (c) Gate 3 proposes the S2 stop-rule number from the tally; Q5 (a) Gate 3
  always held after step 5, local files, no publication; Q6 (a) eleven auditors, walkers' detached `env.sh` daemons
  (an explicitly approved exception to the foreground-only rule), always stopped before the walker reports, (a′)
  `session.mjs` only if step 0a's Acceptance 1 fails; Q7 (a) `comb.test.mjs` by hand at each step and in the
  Acceptance check, not in `pnpm test`; Q8 (a) measured contrast and the `color-contrast` incomplete count reported
  outside the stop rule, L5's failures still findings with a severity. `<plan-accept>` is the acceptance commit
  (`8c1a524`, its hash recorded in the State header by a follow-up docs commit). Places changed: the State header; § Build (walk-rig bullet cites Q6 (a); the
  tally's contrast lines are outside the stop rule per Q8 (a); the Gate 3 bullet is always held, with the S2
  proposal per Q4 (c)); § Do not (Q2, Q3); § Scope check (Q1, Q2 conditionals settled); § Acceptance check
  (`<plan-accept>` defined as the acceptance commit; item 1 reads Q6 (a) as the method and (a′) as the fallback only
  if it fails); § Capture scope (no before/after sheet, per Q5 (a)); § Visual acceptance (Q5 (a), Q4 (c)); § Severity
  and routing rule (Q2/Q3 decided; the core-task S1 goes first in 82.1); the change list's `session.mjs` row; step
  0a of the Implementation sequence (`session.mjs` only if Acceptance 1 fails, per Q6 (a′)), not renumbered;
  § Test plan (Q7 (a)); § Explicit non-goals (Q5 (a)); § Open questions (each marked resolved with its answer, the
  options kept); the plan summary (Gate 3 always held); § Do not (the approved detached-daemon exception); the crop
  wording in § Visual acceptance (code-span paths, matching Acceptance 8). Review of this amendment: one cold
  reviewer, 2 substantive findings (the comb list must reach 82.1 whatever its severity, per Q2 (c); the plan summary
  still said "Gate 3 if the direction needs amending") and 5 minor, all checked and applied except keeping the Q6
  answer's "confirms its ports are released" (it matches Acceptance 1). Round 2: a cold reviewer confirmed the round-1
  fixes and returned 1 substantive finding (the Do-not exception named only walkers, while the plan also runs the
  orchestrator's `static.mjs`, probes, lens browsers and reproduction host as daemons) and 3 minor (comb-list routing
  wins over slices 9 and 81.1; how the `<plan-accept>` hash is found; the review count), all applied: the Do-not line names
  what Q6 (a) covers and new Open question 9 asks about the lens and reproduction daemons, which Q6 (a) does not
  name. Outside the plan: the umbrella's handoff line and `goals.md`'s "Now" line.

- **Step 0a (2026-11-24):** small defaults the plan left open, fixed in `build-comb.mjs`'s header so later steps
  write to them: a findings file is `{ auditor, attestation, findings: [...] }` (L5 adds `contrastTable`), not Gate
  1's bare array, and its `auditor` is its file name (`w1` … `l7`); `reproduction.json` keys verdicts by id and each
  verdict carries `severity`; the comb list's `C82-CL-nn` records live in `comb-list.json` and are **not** filed
  verdicts (the orchestrator re-verifies them itself), but the tally counts the open ones in the S1 line, a
  `comb-list` row of the S2 line and the severity split; `briefs/decisions.md` lists one decision per line as
  `- <title> — `<path>``, and `decisionReopened` must equal a title or path exactly; a ledger `basis` is `outcome`
  (the cited line is inside the record's `## Outcome`) or `answer` (the cited line says "answer"); ledger status
  `advanced` counts as open for *still open*; every ledger-open Gate 1 id sits in exactly one theme's
  `openGate1Ids`; `core-tasks.json` is `{ tasks: [{ id, clicks, keystrokes, deadEnds, baselineClicks, slice81Clicks }] }`;
  the tally's axe and contrast-incomplete lines read a committed digest `comb-82/axe.json` (`ux-output/` is
  git-ignored), written at step 5 from `axe-summary.json`, and the tally check fails once `themes.json` exists
  without a tally or with a null line. A cold reviewer of the step's diff returned 4 substantive findings (the CLI
  guard, null tally lines, S2 ids that could fall out of the tally, a substring decision match and an unchecked
  answer basis) and 4 minor ones (bad fixtures changing two things, lens range, auditor vs file name, stale tally
  blocking regeneration, doc order); all checked against the code, all applied, except an eleven-file completeness
  check, which stays with Acceptance 5's listing.

- **Step 0c (2026-11-24):** small defaults the plan left open, in the briefs: every walk task starts from a fresh
  seed at `/app` (as Gate 1's walks did), except T12; task goals are worded as a user would be told them, without
  routes or control names; walkers do not read the `C82` captures at all, and no auditor reads `<C82>/tasks/` or
  `index.html` (they show the scripted path); the walkers' task table and walkthrough shape sit in `common.md` § 10
  rather than a fourth shared file; W1 runs T01–T06 light and T07–T12 dark by `emulateMedia` and records the rendered
  `data-theme` per task; W2 is light and W3 dark throughout; W4 runs each persona on `nested-projects` without
  reseeding, T10 last from `agent-heavy`, one run per task (`Tnn` or `Tnn-equiv`, since `comb.test.mjs` counts them
  together), with an `equivalent` field and file-level `setupObservations`, persona switched by the development
  dialog (a `localStorage` fallback named); T12's file is path-free (it reloads the current page), so W4 runs it from
  its own project; lens browsers are gated on the launch message until Open question 9 is answered; L5's contrast
  cells, elements and the pixel-sampling method are named, and its `contrastTable` rows add `cell` and `method`.

- **Open question 9 answered (2026-11-26, user decision):** **(a)**, as recommended. The lens browsers (step 3,
  L1–L7, 4326–4327 / 5326–5327) and the orchestrator's reproduction host (steps 4a and 4b, 4320 / 5320) use the same
  detached lifecycle and stop rule the user approved for the walkers (started with `setsid`, stopped with `quit` plus
  a process-group kill, ports confirmed released before the lens or the step reports, nothing detached outliving the
  session), with the (a′) `session.mjs` replay driver as the fallback. The user did not ask to rerun W4: step 2's W4
  is kept as filed (its resumed-walk deviation stays disclosed in the State header). Places changed: the State header
  (date; the acceptance line's "blocks nothing before step 3"; step 0c's lens-browser line; step 2's "Next", now
  unconditional, and a new paragraph recording the answer); § Do not (the daemon exception now names the lens and
  reproduction daemons instead of deferring to Open question 9); § Auditor isolation and method (*Lenses*: the lens
  browser's ports, lifecycle and fallback); § Implementation sequence steps 3, 4a and 4b (lifecycle and stop rule;
  not renumbered); § Open questions (intro, and question 9 marked resolved with its answer, the options kept). The
  step 0c entry above still says lens browsers were gated "until Open question 9 is answered"; it is a frozen record
  and is not rewritten. Docs only: no product code, rig, brief or capture change.

<!-- ───────────── Written before roadmap.mjs complete ───────────── -->

## Outcome

Not yet written.
