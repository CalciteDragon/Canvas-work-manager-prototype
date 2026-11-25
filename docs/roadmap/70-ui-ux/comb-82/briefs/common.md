# Comb auditor brief — common part (Slice 82)

Every auditor reads this file, `inventory.md`, `decisions.md` and its own brief (`w1.md` … `w4.md`,
`l1.md` … `l7.md`), all in `docs/roadmap/70-ui-ux/comb-82/briefs/`. Nothing else in `docs/`.

## 0. This overrides AGENTS.md's start-up instruction

`AGENTS.md` tells every session to read the roadmap, the decision log and the architecture docs
first. **You must not.** Read `AGENTS.md` §1 for orientation only (what the product is, its stack),
then only the files this brief allows. The comb is only worth something if you see the product cold:
you have not seen earlier audits, their findings, their themes or the plans that followed them, and
you must not look for them.

## 1. What the comb is

Canvas Work Manager is a design-first prototype of a project and task manager. Its interface has been
through a long redesign. The comb is a fresh, independent audit of the build as it stands at one
recorded commit, **`C82` = `37dd16e2303e7d8968905de74767710d6b02b85c`**: every mismatch between what a
user would expect and what the product does, written as a finding. Your findings are evidence, not
tasks. Someone else (the orchestrator) reproduces each one before it counts, and decides what happens
to it. You do not fix anything, you do not propose fixes, and you do not change any file outside your
own output files.

## 2. Forbidden reading

Do not open, list, grep or otherwise read:

- anything under `docs/roadmap/` except this folder's brief files and your own output files (named in
  your brief); in particular not `docs/roadmap/70-ui-ux/` outside `comb-82/briefs/` and your outputs;
- the entries in `docs/decisions/` (`decisions.md` here gives you their titles; that is all you need);
- `docs/architecture/`, `docs/guides/`, the product specification and any other `docs/` file;
- `.prototype/notes.json` and every other file in `.prototype/`;
- git history (`git log`, `git show`, `git blame`, `git diff` of any kind);
- anything under `apps/e2e/` except `apps/e2e/ux/walk/*.mjs` and `apps/e2e/ux/walk/env.sh`, which you
  may read to drive the rig;
- anything under `apps/e2e/ux-output/` except `apps/e2e/ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/`
  (the captures; walkers: see your brief, which narrows this) and your own `apps/e2e/ux-output/walk/<name>/`
  and `apps/e2e/ux-output/walk-env/<name>*` files;
- the web app's source: `apps/web/src/**/*.ts` and `apps/web/src/**/*.html` (their comments refer to
  earlier audits). L2 reads `.scss` only through the one command its brief gives. No one else reads
  source.

Facts come from the running app, the captures and the rig's text tools (`aria`, `axe`, computed
styles through `run`), not from source. If you ever meet an earlier audit's id or wording by accident,
do not follow it; say so in your attestation.

## 3. Allowed reading

`AGENTS.md` §1; this folder's brief files; the captures at `C82` (below); your own walk output; the
walk-rig scripts named above; the running app through the rig.

**The captures** (`apps/e2e/ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/`, call it `<C82>`):

- `index.json` — the 194 matrix cells: `id`, `seed`, `route`, `state`, `theme`, `viewport`, `persona`
  and the artifact names. A cell id reads `<seed>-<view>-<theme>-<width>`.
- per cell: `<id>.png` (first screen), `<id>.scroll-0-N.png` (the rest of the page, in order),
  `<id>.layout.json` (element boxes), `<id>.aria.yml` (the accessibility tree), `<id>.axe.json` (axe,
  including `incomplete`), `<id>.console.json`.
- `comb/` — runtime surfaces the matrix cannot reach, each in light 1440 and dark 375: the toast with
  Undo after a section removal, a row failure, the task drawer saving then saved, a section whose read
  failed and then recovered, an archive cascade confirmation, the edit-project menu, the navigation tree
  five levels deep, the skip link focused (`.png`, `.aria.yml`, `.axe.json`; `surfaces.json` lists them).
- `axe-summary.json` — the axe counts across cells. `contact-sheet.html`/`.png` — overview thumbnails
  (its heading says "Gate 0"; ignore that).
- **Not** `tasks/` or `index.html` (scripted task runs; they would tell you the intended path).

Judge crops at full resolution, never thumbnails: most real problems are a few pixels of misalignment,
a faint focus ring, a label that wraps. Use the accessibility tree and computed styles to confirm a
claim a screenshot suggests.

**Seeds** (each loads a whole workspace; the clock is pinned to 2026-08-24 16:00 UTC): `empty`,
`personal-workspace`, `busy-week`, `nested-projects`, `overdue-chaos`, `agent-heavy`. `inventory.md`'s
last section names what each holds. **Personas:** Demo User (`user-demo`, the default), Alex
(`user-alex`, prefers light) and Sam (`user-sam`, prefers dark). Only Alex owns a project in any seed
(`project-alex-private`, in `nested-projects`).

## 4. The walk rig (Linux, foreground commands, one detached daemon)

All commands run from the repository root. The rig gives you one persistent headless Chromium page,
driven over HTTP, against your **own** prototype host with its own scratch data file. Browser requests
to `localhost:4200` go to the static build on **4201** and requests to the host's `4310` go to your
own host, so you never touch anyone else's data.

**4201 belongs to the orchestrator.** It is already serving the `C82` build when you start. Never start,
stop or restart anything on 4201. Never listen on 4200 or 4310.

Your brief names `<name>`, `<host>` and `<ctl>` ports and any daemon flags. Start your daemon
**detached**, in one foreground command, recording its process group from inside (`$!` is not the
group, because `setsid` may fork):

```bash
E=apps/e2e/ux-output/walk-env; mkdir -p "$E"; rm -rf apps/e2e/ux-output/walk/<name>
setsid bash -c "echo \$\$ > $E/<name>.pgid; exec bash apps/e2e/ux/walk/env.sh <name> <host> <ctl> <flags>" > $E/<name>-env.log 2>&1 </dev/null &
for i in $(seq 1 60); do curl -s -o /dev/null -X POST http://127.0.0.1:<ctl>/console && break; sleep 1; done; echo "up after ${i}s"
```

Then drive it with foreground commands (each returns JSON; `url` and `title` come with every reply):

```bash
node apps/e2e/ux/walk/walk.mjs <ctl> seed <seed>          # reload the seed into your host, reset the clock
node apps/e2e/ux/walk/walk.mjs <ctl> goto /app             # navigate (path only)
node apps/e2e/ux/walk/walk.mjs <ctl> shot <label> [--full] [--sel "css"]   # PNG into ux-output/walk/<name>/
node apps/e2e/ux/walk/walk.mjs <ctl> aria [css]            # accessibility tree, whole page or one element
node apps/e2e/ux/walk/walk.mjs <ctl> axe <label>           # axe scan, JSON into ux-output/walk/<name>/
node apps/e2e/ux/walk/walk.mjs <ctl> console               # console errors since the last call
node apps/e2e/ux/walk/walk.mjs <ctl> run "<js>"            # Playwright code with page, context, expect, out
node apps/e2e/ux/walk/walk.mjs <ctl> run -f <file.js>      # the same, from a file
```

`run` is how you click, type, press keys, hover and read computed styles, e.g.
`run "await page.getByRole('button',{name:'Save'}).click()"`, `run "await page.keyboard.press('Tab')"`,
`run "return await page.evaluate(() => document.activeElement?.outerHTML.slice(0,200))"`. Act as the
user would: locate things by what is visible or announced, not by reading source. Any `page.route` you
add must end in `route.fallback()`, never `route.continue()`. Scratch scripts go in your own
`apps/e2e/ux-output/walk/<name>/` folder, never in the repository's tracked tree.

**Stop before you report — always, also after an error:**

```bash
E=apps/e2e/ux-output/walk-env
node apps/e2e/ux/walk/walk.mjs <ctl> quit; kill -TERM -- -"$(cat $E/<name>.pgid)" 2>/dev/null
for i in $(seq 1 20); do ss -ltn | grep -qE ':(<host>|<ctl>)\b' || break; sleep 1; done
ss -ltn | grep -E ':(<host>|<ctl>)\b' && echo "STILL LISTENING" || echo "ports <host> <ctl> released"
```

If a port is still listening, kill the group again and re-check; report it if it will not release.
Nothing you start may outlive your turn. One browser per auditor, no more.

**Traps.** Never start a host through `pnpm` (it outlives the kill). `seed` resets your host's data and
clock; it does not reload the page, so `goto` after it. The first `seed` after start also proves the
host is up.

## 5. No friction notes

The app has a note-capture feature (in the development dialog). **Never save a note**, and never call
the host's notes endpoint: the host writes notes into the real project's `.prototype/notes.json`, not
your scratch file. Friction is a finding (or, for walkers, a step's `observed` and the task's
`discoverability`). The orchestrator counts that file's lines before and after your run.

## 6. The finding format (protocol: one record per finding)

Your findings file is JSON:

```json
{
  "auditor": "<w1…w4 | l1…l7, your file name>",
  "attestation": "<see § 8>",
  "findings": [ { …record… } ]
}
```

Each record has exactly these fields (all strings unless noted), plus nothing that proposes a fix:

| Field | Content |
|---|---|
| `id` | `C82-<FILE>-NNN`, your file name upper-cased, three digits from 001: `C82-W1-001`, `C82-L3-012` |
| `auditor` | your file name, as in the file's `auditor` |
| `surface` | where, outer to inner: `project workspace › Work canvas › Task List › row` |
| `inventoryRow` | the nearest row's *Surface* text from `inventory.md`, or `none` |
| `seed` | the seed it shows on |
| `theme` | `light`, `dark` or `both` |
| `viewport` | `1440x900`, `1024x768`, `375x812` … or `all` |
| `state` | the matrix state (`populated`, `error`, `task-drawer` …) or a short description |
| `persona` | `user-demo`, `user-alex` or `user-sam` |
| `evidence` | **list**, non-empty: repo-relative paths (`apps/e2e/ux-output/37dd16e…/<cell>.png`, `apps/e2e/ux-output/walk/<name>/007-x.png`), each with what to look at; axe rule ids; computed values; task step |
| `repro` | **list**, non-empty: numbered steps from a fresh seed |
| `expected` | what a user would expect |
| `actual` | what happens or is seen |
| `lens` | one of `hierarchy`, `consistency`, `affordance`, `states`, `accessibility`, `copy`, `ia`; walkers may use `task:T01` … `task:T12` (or `task:T05-equiv`) |
| `heuristic` | the principle: a Nielsen heuristic, a WCAG 2.2 SC, or internal consistency (name the two places) |
| `severity` | `S1` blocks a task · `S2` slows or confuses · `S3` polish |
| `confidence` | `observed` (you saw it) or `inferred` (you reasoned to it; say from what) |
| `decisionReopened` | `null`, or the **exact** title (or path) of the decision from `decisions.md` this finding contradicts |

**No fix, anywhere.** No `fix`, `suggestion`, `recommendation` or similar key, and no "should use X" or
"consider Y" in prose. Describe what a user expects and what happens. Proposing a fix now anchors the
later synthesis on the first idea.

**No verdict.** Do not add `status`, `verdict` or `reproduced`; only the orchestrator gives verdicts.

One finding per defect. When the same defect shows on many cells, file it once and list the cells in
`evidence`. Severity is about the user, not about how easy it looks to fix.

Example (invented, for shape only):

```json
{
  "id": "C82-L6-004", "auditor": "l6",
  "surface": "settings › agents › connection card › last-used line",
  "inventoryRow": "`/settings/agents`", "seed": "agent-heavy", "theme": "both", "viewport": "all",
  "state": "default", "persona": "user-demo",
  "evidence": ["apps/e2e/ux-output/37dd16e2303e7d8968905de74767710d6b02b85c/agent-heavy-settings-agents-light-1440.png (second card, bottom line)",
               "…-settings-agents-light-1440.aria.yml line 41: text \"used 3 d\""],
  "repro": ["1. seed agent-heavy as Demo", "2. open /settings/agents", "3. read the second card's last line"],
  "expected": "The time since an agent was last used reads as ordinary words.",
  "actual": "It reads \"used 3 d\", an abbreviation used nowhere else in the app.",
  "heuristic": "Nielsen #4 Consistency and standards",
  "severity": "S3", "confidence": "observed", "decisionReopened": null
}
```

## 7. Checking your file

When your file(s) are written, run (read-only; it only validates):

```bash
node docs/roadmap/70-ui-ux/tooling/build-comb.mjs --check
```

Fix every error it reports for **your** files (`<name>:` prefixes). Errors about other files are not
yours. Do not open the tool's source; its messages say what is wrong. JSON must parse.

## 8. Attestation

Your findings file's `attestation` is one honest paragraph, in your own words, covering: that you read
`AGENTS.md` §1 for orientation only and kept to § 2's forbidden reading; anything you opened by
mistake or met by accident; that you saved no friction note; that you stopped your daemon and its
ports were released (walkers and lenses who held a browser). If something did not hold, say what.

## 9. What you report back

A short message: your output files, the count of findings by severity, (walkers) each task's outcome,
the rig's stop result (ports released), and anything that kept you from covering your brief. Do not
paste your findings into the message; the files are the record.

## 10. For walkers (W1–W4): the tasks and the walkthrough file

Lenses may skip this section.

**How to walk.** Before each act, write down what you expect to happen (`expect`), then act, then
record what happened (`observed`). Every mismatch is a step with `mismatch: true` and usually a
finding. You are a first-time user who knows what the product is for and nothing about its layout:
look before you act, and record hesitation honestly. Screenshot (`shot`) at each meaningful step;
cite the file in the step's `evidence`. Do not read the captures (`<C82>/`) at all: your evidence is
your own walk.

**The tasks.** Each starts with `seed <seed>` then `goto <start>`; setup commands are not counted.

| Task | Seed | Start | Goal (as a user would be told it) |
|---|---|---|---|
| T01 | `empty` | `/app` | Create a new top-level project. |
| T02 | `nested-projects` | `/app` | Create a new workstream under Kitchen (Kitchen is part of the Home renovation project). |
| T03 | `nested-projects` | `/app` | In Kitchen, add a task list, add two tasks to it and mark both done. |
| T04 | `overdue-chaos` | `/app` | Find a task that is overdue and move its due date to a later day. |
| T05 | `nested-projects` | `/app` | In Kitchen, remove one section, then bring it back. |
| T06 | `nested-projects` | `/app` | In Kitchen, change the text of its Markdown notes and save it. |
| T07 | `nested-projects` | `/app` | Put a shortcut on Kitchen's canvas to a section that lives somewhere else. |
| T08 | `nested-projects` | `/app` | In Home renovation, hide its Reflections page, then turn it back on. |
| T09 | `nested-projects` | `/app` | Bring back something that was archived in Home renovation. |
| T10 | `agent-heavy` | `/app` | See what an already connected agent is allowed to do, then connect a new agent. |
| T11 | `overdue-chaos` | `/app` | From the dashboard, open an overdue task where it lives. |
| T12 | `busy-week` | see below | A task list on this project has just failed to load. Get it working again. |

**T12's start.** The failure is the starting condition, not part of the task:

```bash
node apps/e2e/ux/walk/walk.mjs <ctl> seed busy-week
node apps/e2e/ux/walk/walk.mjs <ctl> goto /projects/project-launch
node apps/e2e/ux/walk/walk.mjs <ctl> run -f docs/roadmap/70-ui-ux/comb-82/briefs/t12-setup.js
```

The last command reloads the page with the task list's read failing, waits until the failure shows,
then lifts it, so a real recovery can succeed. It replies `ready: true`. Recovering is yours; do not
reload the browser yourself unless that is genuinely what you, as the user, would try (and count it).

**Counting.** `clicks`: every mouse click or touch tap you make toward the goal (a wrong one counts
too). `keystrokes`: every character typed and every key pressed (W3 counts Tab, Shift+Tab, arrows,
Enter, Escape, Space each as one). Hover and reading are free. Setup (seed, goto, T12's setup file) is
free. `deadEnds`: times you went somewhere that could not lead to the goal and had to back out.

**Your walkthrough file** (`docs/roadmap/70-ui-ux/comb-82/walkthroughs/<name>.json`):

```json
{
  "auditor": "<name>", "inputMode": "mouse | touch | keyboard", "viewport": "1440x900 | 375x812",
  "theme": "<starting theme: light | dark>", "personas": ["user-demo"],
  "tasks": [
    {
      "task": "T01", "persona": "user-demo", "theme": "light",
      "outcome": "completed | blocked | inapplicable",
      "clicks": 3, "keystrokes": 16, "deadEnds": 0,
      "surfaces": ["Dashboard", "Navigation", "New project form", "Project workspace"],
      "firstCorrectActionFoundImmediately": false,
      "discoverability": "One or two sentences: how you found the way, and what you looked at first.",
      "steps": [ { "expect": "…", "action": "…", "observed": "…", "mismatch": true, "evidence": "apps/e2e/ux-output/walk/<name>/003-t01-form.png" } ],
      "verification": "How you confirmed the goal was reached (not counted).",
      "findings": ["C82-W1-001"]
    }
  ]
}
```

Exactly one run per persona per task, T01–T12, all twelve (W4: `T05-equiv` replaces `T05`, never
both). `blocked` means you could not reach the goal; record where you stopped. Findings filed from a
task use `lens: "task:Tnn"` (or `task:Tnn-equiv`) and appear in that task's `findings` list; ones
you notice on the way that are not about the task use the closest lens.
