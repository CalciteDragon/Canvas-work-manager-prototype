# AGENTS.md

**Read this file first, every session, before touching anything else in this repository.**
It is the entry point and the highest level of the documentation. Everything else — the
spec, the architecture tree, the roadmap, the decision log — is reached from here, and the
[documentation protocol](docs/documentation-protocol.md) says how each of those is kept
true.

---

## 1. What this project is

**Canvas Work Manager — Prototype.** A design-first prototype of a project/task
management application whose distinguishing feature is that AI agents are first-class
users of it, through a real MCP server.

The prototype exists to answer *what the product should be*, not to prove it can scale.
Its guiding trade-off:

> **Real product behavior + fake infrastructure.**
> Optimize for *time to change an idea*, never *time to production*.

### The documentation map

| Where | What it is | Read it when |
|---|---|---|
| `Canvas Work Manager — Prototype Product, Design & Development Specification.md` | **The spec.** What to build and why. Cited everywhere as §N. Design-first, corrected when the prototype disproves it. | Before implementing anything it covers. Read the section, not your memory of it. |
| [`docs/architecture/overview.md`](docs/architecture/overview.md) | **The system tree.** One folder per system, four files each — `overview` / `why` / `what` / `how` — mirroring the real structure of the code, with diagrams and links into the Compodoc API reference. | Before changing a system: its `overview.md` and `how.md`, then the code. |
| [`docs/roadmap/README.md`](docs/roadmap/README.md) | **The roadmap.** [`goals.md`](docs/roadmap/goals.md) says what is being pursued and why; [`progress.md`](docs/roadmap/progress.md) is the generated status board; `active/`, `planned/` and `completed/` hold one plan per slice in its current state. | At the start of every session, and at the start and end of every phase. |
| [`docs/decisions/README.md`](docs/decisions/README.md) | **The decision log** (§78). One small entry per answered question, indexed by system. The raw material for the MVP specification. | Before re-deciding anything; whenever a product question gets answered. |
| [`docs/guides/`](docs/guides/mcp-setup.md) | Task-oriented how-tos: connecting an MCP client, the first-milestone walkthrough. | When doing that task. |
| [`docs/documentation-protocol.md`](docs/documentation-protocol.md) | **The rulebook** for all of the above: what goes where, the four-file contract, Compodoc, the plan lifecycle, the checks. | Before adding or restructuring documentation. |
| [`README.md`](README.md) | Human quickstart: install, run, commands, environment. | When a command or URL changes. |
| `.prototype/notes.json` | In-app friction notes captured while using the prototype (§79). | Continuously, by using the app. |

`pnpm docs:api` builds the API reference into `docs/api/` (git-ignored); the `how.md`
files link into it by symbol. `pnpm docs:check`, part of `pnpm lint`, fails on a broken
structure, a broken link, a symbol that no longer exists, an unindexed decision, or a
stale board. `pnpm docs:site` serves all of it — these files, the architecture tree, the
decisions and the roadmap — as a browsable site with search and rendered Mermaid
([protocol §9](docs/documentation-protocol.md)); the Markdown remains the source of truth.

### Stack

- **Frontend:** Angular 22, standalone components, Signals, zoneless, Angular CDK, SCSS +
  CSS custom properties — [web](docs/architecture/web/overview.md)
- **Host:** `apps/prototype-host` — Node/TypeScript on `127.0.0.1:4310`. Fake API + MCP
  server + fake auth + mock AI — [prototype-host](docs/architecture/prototype-host/overview.md)
- **Persistence:** one file, `.prototype/data.json`, schema version 3. No SQLite, no
  Postgres (§14, §80) — [repositories](docs/architecture/repositories/overview.md)
- **Contracts:** Zod schemas in `packages/contracts`, shared by UI, API, MCP tools, tests
  and seeds (§11) — [contracts](docs/architecture/contracts/overview.md)
- **Domain:** `packages/domain`, every rule, over repository interfaces and a `Clock` —
  [domain](docs/architecture/domain/overview.md)
- **MCP:** official TypeScript SDK v2, protocol `2026-07-28`, Streamable HTTP at `/mcp`
  and stdio, serving the thirty-five tools of the transport-free registry (§50, §54, §59)
  — [mcp-tools](docs/architecture/mcp-tools/overview.md),
  [mcp-transport](docs/architecture/prototype-host/mcp-transport/overview.md)
- **Seeds and personas:** `packages/prototype-data`, six seeds, three personas, fixture
  tokens — [prototype-data](docs/architecture/prototype-data/overview.md)
- **Package manager:** pnpm 11 workspaces. `pnpm dev:web` and `pnpm dev:host`, in two
  terminals — never together ([decision](docs/decisions/2026-08-web-and-host-start-separately.md))
- **Verification:** vitest everywhere, Storybook on `@storybook/angular-vite`, Playwright
  in `apps/e2e` with its own servers, four acceptance scripts, and the boundary lints —
  [testing](docs/architecture/testing/overview.md). `pnpm test` is offline and browser-free;
  `pnpm e2e` is not part of it.

### Boundaries that must never be violated

These are the entire point of the architecture (§8, §12, §70). A change that breaks one
of them is wrong even if it works.

- Angular components depend on **gateway interfaces**, never on a concrete gateway,
  never on HTTP, never on Supabase-shaped anything. `app.config.ts` is the only file that
  names a concrete adapter.
- Domain services depend on **domain and repository abstractions only** — repository
  interfaces, `Clock`, and where an invariant needs it, another domain service through an
  **acyclic** edge (`TaskService` and `ReflectionService` compose `SectionService` to
  resolve a container; `SectionService` records each explicit add, move, settings update and removal's
  Undo inverse through the `UndoRecorder` interface; `UndoService` composes only `ActivityService`, never a section,
  task or reflection service). They must never know about HTTP, MCP, JSON adapters, or any other
  infrastructure. This describes the architecture the code already enforces; it does not
  authorize a new edge.
- MCP tools call **domain services**, never repositories directly.
- Contracts are defined **once**, in `packages/contracts`. No parallel type definitions
  anywhere.
- No `new Date()` in domain code — inject `Clock` (§45).
- No literal colors, spacing, or radii in component styles — use the design tokens (§21).
- No scattered `if (prototypeMode)` — one central flag service (§47).
- `core/` in the web app never depends on `prototype/`.

Each has a mechanical check or a named review pass; the list is in
[testing / how](docs/architecture/testing/how.md).

### Deliberately disposable (§71)

Do not over-engineer, do not add abstraction layers to, do not write exhaustive tests
for: the host's HTTP implementation, JSON repositories, prototype auth, fake users and
tokens, the mock AI provider, the event stream, the dev panel, the seed loader.

### Never build (§80)

Postgres, Supabase, RLS, production OAuth, cloud uploads, email, invitations, billing,
Redis, queues, production logging or analytics. If one seems necessary, that is a
finding to record in `docs/decisions/` and raise — not a task to start.

---

## 2. Living documentation

Documentation in this repository is **state, not commentary**. It describes what is true
now. Stale documentation is a defect with the same severity as a failing test, and
`pnpm lint` treats the structural half of it that way.

The full rules are the [documentation protocol](docs/documentation-protocol.md). The
ones you will use every phase:

1. **Update docs in the same change as the code.** Never "docs to follow." A change to a
   system's behaviour, shape or dependencies updates that system's folder under
   `docs/architecture/` in the same commit.
2. **Plans live in `docs/roadmap/` and nowhere else**, and move through
   `planned/ → active/ → completed/` with `scripts/roadmap.mjs`. One active plan per
   phase. Completed records are frozen. The board in `progress.md` is generated.
3. **Every answered product question becomes a `docs/decisions/` entry** in the §78
   format, indexed in `docs/decisions/README.md` and linked from the system's `why.md`.
   Small entries. Many of them. Never rewrite one — append a dated amendment.
4. **When intent changes, change the test *and* the implementation *and* the doc**
   (§77). Tests protect intentional behavior, not past decisions.
5. **Correct the spec when the prototype disproves it.** Record the disagreement in a
   decision entry, then update the spec section and note it in the entry.
6. **No aspirational documentation.** Nothing is documented as existing before it does.
   A planned thing is a file in `docs/roadmap/planned/`.
7. **Public symbols are documented in their own doc comments**, which Compodoc renders;
   `how.md` links to them rather than restating them.

---

## 3. Development phase protocol

A **phase** is one slice from the roadmap, or a coherent group of small ones. Follow all
five steps, in order, for every phase. Do not skip steps because a phase looks small —
the small ones are where scope quietly leaks.

### Step 1 — Write the implementation plan

Start the slice: `node scripts/roadmap.mjs start docs/roadmap/planned/<file>` (or
`roadmap.mjs new <id> <slug> --title … --summary …` first for a slice that has no
candidate file). The plan is now `docs/roadmap/active/<file>`, and it is the only planning
document you edit during the phase.

Before writing it, read the relevant spec sections, the `overview.md` and `how.md` of every
system the phase touches, and the actual code. Plan from the repository, not from
assumptions. Fill in the template's sections:

- **Goal** — one sentence.
- **Spec sections** — the §N list this phase implements.
- **Acceptance check** — copied from the slice's *Done when*, made concrete and
  executable. This is what "finished" means; nothing else counts.
- **File-level change list** — every file created or modified, with the responsibility of
  each. Concrete paths, not "the relevant components." Include the documentation files
  that will change.
- **Test plan** — the test cases to write **first**, named, with what each proves.
- **Boundaries touched** — which of §1's boundaries this phase comes near, and how it
  stays on the right side of each.
- **Explicit non-goals** — the slice's *Do not* list, plus anything tempting you have
  decided to defer.
- **Open questions** — decisions the plan cannot make alone. Resolve these before
  implementing; escalate to the user if the answer changes the shape of the work.

Keep the plan tight enough that its file list can be read as a checklist.

### Step 2 — Review the plan with a subagent, iteratively

Deploy a review subagent against the written plan. Give it the plan file, the spec
section numbers, the standing boundaries from §1, and the architecture folders of the
systems it touches. Ask it specifically to find:

- spec requirements the plan misses or misreads
- boundary violations, including subtle ones (a domain service reaching for HTTP, a
  component importing a concrete gateway, a duplicated type)
- scope creep — work that belongs to a later slice
- gaps in the test plan, especially untested failure and permission paths
- acceptance criteria that are not actually verifiable
- documentation the change list forgets: the system folders, a decision entry, a guide

**Iterate.** Revise the plan, re-review, repeat until the reviewer returns no substantive
findings. Two or three rounds is normal; one round usually means the reviewer was
under-briefed. Do not begin implementing against a plan that still has open findings.

Record what each round changed under the plan's **Revisions**. It is evidence the process
ran, and it is often where the interesting reasoning lives.

### Step 3 — Implement with TDD and subagent-driven development

**Test first, always:**

1. Write the failing test from the plan's test plan.
2. Watch it fail — for the right reason. A test that passes before implementation, or
   fails on a typo, is testing nothing.
3. Write the minimum implementation to pass it.
4. Refactor with the test green.
5. Commit at each meaningful green point, referencing the slice and §N.

**Delegate to subagents where parallelism is real.** Good candidates: independent files
with no shared surface, mechanical repetition across many similar units, isolated
research into a library's actual API, exploratory search across the codebase.

Brief every subagent as if it knows nothing — because it does. A cold-start subagent
needs: the goal, the exact files, the relevant spec §N, the architecture folder of the
system, the boundaries it must respect, the acceptance check, and what *not* to touch. A
vague brief produces work you will throw away, which costs more than doing it yourself.

**Do not delegate:** anything requiring the accumulated context of this phase, anything
crossing an architectural boundary, or anything where you would have to read the whole
result carefully to trust it. Verification cost is part of delegation cost.

Keep the suite green throughout. Never move to the next test with a red one behind you
unless it is the one you are currently driving.

### Step 4 — Review the work with subagents

When implementation is complete and the suite is green, deploy review subagents against
the **diff**, not against your description of it. Cover:

- **Correctness** — does it work, including edge cases, failure paths, and empty states?
- **Spec conformance** — does it do what §N actually says, checked against the text?
- **Boundaries** — are §1's rules intact? This deserves its own reviewer pass.
- **Acceptance** — is the plan's acceptance check genuinely satisfied, demonstrated by
  running it rather than by reasoning about it?
- **Living documentation** — do the touched systems' four files describe what is now
  true? Is every answered question a decision entry? Are the README and the guides
  right? Does `pnpm docs:check` pass?

Fix what the review finds, then re-verify. Do not accept a review finding uncritically —
subagents are confidently wrong sometimes. Check the claim against the code before acting
on it, and say so plainly if the finding does not hold.

Then run the phase in the actual application (§77): load a realistic seed, use the
feature, try it through MCP if applicable, and record friction in `.prototype/notes.json`
(bump `CURRENT_SLICE` in the dev panel store when the slice starts). Passing tests are
not evidence that a design feels right.

### Step 5 — Close the phase

Write the plan's **Outcome** — a few paragraphs, not a report:

- **Deliverables** — what now exists and works, with file links.
- **Deliberate choices** — decisions made and why, especially ones a reader would
  otherwise question, and options rejected with the reason. Link the decision entries.
- **Deviations from the plan** — what changed mid-implementation and what caused it.
- **Deferred** — anything intentionally left out, and which slice it belongs to.
- **Open questions** — what the phase surfaced that the next one, or the user, must
  answer.
- **Documentation updated** — the architecture folders, decisions and guides touched.

Then `node scripts/roadmap.mjs complete docs/roadmap/active/<file> --summary "…"`, which
freezes the record and regenerates the board. Update `docs/roadmap/goals.md` if the
direction moved. `pnpm docs:check` and `pnpm lint` green before the closing commit.

Report honestly. If something is partially done, say which part. If a test is skipped,
say so and why. Never report a phase complete when it is not.

---

## 4. Context-aware agentic coding

Context is the scarce resource. Spend it on the code that matters and refuse to spend it
anywhere else.

**Ground every change in the actual repository.** Read the files you are about to change
before changing them. Read the spec section before implementing it. Read the system's
`how.md` before its code — it says where to look first and names the trap. Follow the
existing idiom — naming, comment density, file layout, test style — rather than importing
conventions from elsewhere. When in doubt about a pattern, find the nearest existing
example and match it.

**Read narrowly, not exhaustively.** Search for the specific symbol; read the specific
range. The architecture tree exists so that orientation costs four short files, not a
2000-line read.

**Keep the working set small.** A phase should touch a bounded set of files. If it is
sprawling, the phase was scoped wrong — stop and re-slice rather than pushing through.

**Prefer deleting to adding.** This is a prototype (§77). Bad ideas should be thrown away
cheaply. Do not preserve code because it exists, and do not build abstraction for a
second use case that has not appeared.

**Verify, do not assume.** Run the command. Check the output. Load the seed and click the
thing. "Should work" is not a result. When you report something works, it is because you
watched it work.

**State assumptions out loud.** When something is genuinely ambiguous, do the work that
does not depend on the answer, then state the assumption you made or ask the one question
that matters. Do not block a whole phase on a question you could answer with a defensible
default and a note.

---

## 5. Efficient working methods

**Batch independent work.** Issue independent reads, searches, and edits together rather
than one per turn. Every turn re-sends the conversation; turn count is the dominant cost.

**Do not re-verify what is already verified.** Once a check passes, do not run it again
until the code changes. Do not re-read a file you just wrote.

**Run long things in the background and collect them once.** Never poll in a sleep loop.

**Do not do unasked work.** No changelogs, no formatting sweeps, no coverage passes, no
opportunistic refactors outside the phase. Note what you spotted; leave it for its own
slice — a candidate in `docs/roadmap/planned/` if it deserves one, a friction note if it
does not.

**Fail loudly and early.** Validate seeds against schemas, lint the banned patterns
(`new Date()` in domain, literal colors in components), keep `docs:check` green, and let
CI catch drift rather than a confused debugging session later.

**Commit in small, green, described increments.** Reference the slice and the §N. A
readable history is how the next session — yours or someone else's — rebuilds context
without re-reading everything.

**Leave the repository ready for a cold start.** The next agent begins with only this
file. Everything they need to continue must be reachable from it, and true.
