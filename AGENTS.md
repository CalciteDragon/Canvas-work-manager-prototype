# AGENTS.md

**Read this file first, every session, before touching anything else in this repository.**
It is the entry point. Everything else — the spec, the development plan, the decision
log — is reached from here.

---

## 1. What this project is

**Canvas Work Manager — Prototype.** A design-first prototype of a project/task
management application whose distinguishing feature is that AI agents are
first-class users of it, through a real MCP server.

The prototype exists to answer *what the product should be*, not to prove it can
scale. Its guiding trade-off:

> **Real product behavior + fake infrastructure.**
> Optimize for *time to change an idea*, never *time to production*.

### The two authoritative documents

| File | Role |
|---|---|
| `Canvas Work Manager — Prototype Product, Design & Development Specification.md` | The spec. What to build and why. Cited throughout as §N. |
| `development.md` | The slice plan. The order to build it in, with acceptance checks. |

Read the relevant spec sections before implementing — not a summary of them, and not
your memory of them. Cite section numbers (§N) in plans, commits, and PR text so
reviewers can verify against the source.

### Stack

- **Frontend:** Angular 22, standalone components, Signals, Angular CDK, SCSS + CSS custom properties
- **Host:** `apps/prototype-host` — Node/TypeScript on `:4310`. Fake API + MCP server + fake auth + mock AI
- **Persistence:** one file, `.prototype/data.json`. No SQLite, no Postgres (§14, §80)
- **Contracts:** Zod schemas in `packages/contracts`, shared by UI, API, MCP tools, tests, and seeds (§11)
- **MCP:** official TypeScript SDK v2, protocol `2026-07-28`, Streamable HTTP + stdio (§50, §59)
- **Package manager:** pnpm workspaces. `pnpm dev` starts everything (§75)
- **Component workbench:** Storybook on `@storybook/angular-vite`, configured in
  `apps/web/.storybook/`, stories beside their components as `*.stories.ts`. `pnpm storybook`
- **End-to-end:** Playwright in `apps/e2e`, its own package, its own servers, its own data
  file. `pnpm e2e` — and **not** part of `pnpm test`, which stays offline and browser-free

### Boundaries that must never be violated

These are the entire point of the architecture (§8, §12, §70). A change that breaks
one of them is wrong even if it works.

- Angular components depend on **gateway interfaces**, never on a concrete gateway,
  never on HTTP, never on Supabase-shaped anything.
- Domain services depend on **repository interfaces + `Clock`** only. They must not
  know about HTTP, MCP, or JSON.
- MCP tools call **domain services**, never repositories directly.
- Contracts are defined **once**, in `packages/contracts`. No parallel type
  definitions anywhere.
- No `new Date()` in domain code — inject `Clock` (§45).
- No literal colors, spacing, or radii in component styles — use the design tokens (§21).
- No scattered `if (prototypeMode)` — one central flag service (§47).

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

Documentation in this repository is **state, not commentary**. It describes what is
true now. Stale documentation is a defect with the same severity as a failing test.

### The living documents

| Document | Contains | Updated |
|---|---|---|
| `AGENTS.md` | This file. Project orientation + working protocol. | When architecture, stack, or protocol changes. |
| `development.md` | The slice plan, with each slice's status. | At the start and end of every phase. |
| `docs/decisions/` | Decision log entries (§78). | Whenever a product question gets answered. |
| `docs/plans/` | One implementation plan per phase (see §3). | Live during a phase; archived after. |
| `.prototype/notes.json` | In-app friction notes captured while using the prototype (§79). | Continuously, by using the app. |
| `docs/mcp-setup.md` | How to connect a real MCP client. | When transports or tokens change. |

### Rules

1. **Update docs in the same change as the code.** Never "docs to follow."
2. **Mark slice status in `development.md`** — `not started` / `in progress` /
   `done` / `superseded` — with a one-line note when reality diverged from the plan.
3. **Every answered product question becomes a `docs/decisions/` entry** in the §78
   format: Question / Options tested / What we learned / Current decision /
   Confidence / Revisit when. Small entries. Many of them. This log is the raw
   material for the MVP specification — it is arguably the most valuable output of
   the whole prototype.
4. **When intent changes, change the test *and* the implementation *and* the doc**
   (§77). Tests protect intentional behavior, not past decisions. Do not preserve a
   behavior merely because a test asserts it.
5. **Correct the spec when the prototype disproves it.** The spec is design-first,
   not immutable. Record the disagreement in `docs/decisions/`, then update the spec
   section and note it in the entry.
6. **No aspirational documentation.** Do not document a feature as existing before it
   does. Do not leave TODO-shaped prose in place of the current truth.

---

## 3. Development phase protocol

A **phase** is one slice from `development.md`, or a coherent group of small ones.
Follow all five steps, in order, for every phase. Do not skip steps because a phase
looks small — the small ones are where scope quietly leaks.

### Step 1 — Write the implementation plan

Create `docs/plans/<slice-number>-<slug>.md`. Before writing it, read the relevant
spec sections and the actual code the phase touches. Plan from the repository, not
from assumptions.

The plan contains:

- **Goal** — one sentence.
- **Spec sections** — the §N list this phase implements.
- **Acceptance check** — copied from the slice's *Done when*, made concrete and
  executable. This is what "finished" means; nothing else counts.
- **File-level change list** — every file created or modified, with the responsibility
  of each. Concrete paths, not "the relevant components."
- **Test plan** — the test cases to write **first**, named, with what each proves.
  Domain tests, component tests, MCP contract tests, e2e — whichever the phase earns.
- **Boundaries touched** — which of §1's architectural boundaries this phase comes
  near, and how it stays on the right side of each.
- **Explicit non-goals** — the slice's *Do not* list, plus anything tempting you have
  decided to defer.
- **Open questions** — decisions the plan cannot make alone. Resolve these before
  implementing; escalate to the user if the answer changes the shape of the work.

Keep the plan tight enough that its file list can be read as a checklist.

### Step 2 — Review the plan with a subagent, iteratively

Deploy a review subagent against the written plan. Give it the plan file, the spec
section numbers, and the standing boundaries from §1. Ask it specifically to find:

- spec requirements the plan misses or misreads
- boundary violations, including subtle ones (a domain service reaching for HTTP, a
  component importing a concrete gateway, a duplicated type)
- scope creep — work that belongs to a later slice
- gaps in the test plan, especially untested failure and permission paths
- acceptance criteria that are not actually verifiable

**Iterate.** Revise the plan, re-review, repeat until the reviewer returns no
substantive findings. Two or three rounds is normal; one round usually means the
reviewer was under-briefed. Do not begin implementing against a plan that still has
open findings.

Record what the review changed — a short "Revisions" section at the bottom of the plan
is enough. It is evidence the process ran, and it is often where the interesting
reasoning lives.

### Step 3 — Implement with TDD and subagent-driven development

**Test first, always:**

1. Write the failing test from the plan's test plan.
2. Watch it fail — for the right reason. A test that passes before implementation, or
   fails on a typo, is testing nothing.
3. Write the minimum implementation to pass it.
4. Refactor with the test green.
5. Commit at each meaningful green point, referencing the slice and §N.

**Delegate to subagents where parallelism is real.** Good candidates: independent
files with no shared surface, mechanical repetition across many similar units,
isolated research into a library's actual API, exploratory search across the codebase.

Brief every subagent as if it knows nothing — because it does. A cold-start subagent
needs: the goal, the exact files, the relevant spec §N, the boundaries it must respect,
the acceptance check, and what *not* to touch. A vague brief produces work you will
throw away, which costs more than doing it yourself.

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
- **Living documentation** — are `development.md`, `docs/decisions/`, and any affected
  docs updated in this same change?

Fix what the review finds, then re-verify. Do not accept a review finding uncritically —
subagents are confidently wrong sometimes. Check the claim against the code before
acting on it, and say so plainly if the finding does not hold.

Then run the phase in the actual application (§77): load a realistic seed, use the
feature, try it through MCP if applicable, and record friction in `.prototype/notes.json`.
Passing tests are not evidence that a design feels right.

### Step 5 — Final overview

Close the phase with a **concise** written summary — a few paragraphs, not a report:

- **Deliverables** — what now exists and works, with file links.
- **Deliberate choices** — decisions made and why, especially ones a reader would
  otherwise question, and options rejected with the reason.
- **Deviations from the plan** — what changed mid-implementation and what caused it.
- **Deferred** — anything intentionally left out, and which slice it belongs to.
- **Open questions** — what the phase surfaced that the next one, or the user, must
  answer.

Report honestly. If something is partially done, say which part. If a test is skipped,
say so and why. Never report a phase complete when it is not.

---

## 4. Context-aware agentic coding

Context is the scarce resource. Spend it on the code that matters and refuse to spend
it anywhere else.

**Ground every change in the actual repository.** Read the files you are about to
change before changing them. Read the spec section before implementing it. Follow the
existing idiom — naming, comment density, file layout, test style — rather than
importing conventions from elsewhere. When in doubt about a pattern, find the nearest
existing example and match it.

**Read narrowly, not exhaustively.** Search for the specific symbol; read the specific
range. Reading a 2000-line file to change 10 lines burns context that a later, harder
decision in the same phase will need.

**Keep the working set small.** A phase should touch a bounded set of files. If it is
sprawling, the phase was scoped wrong — stop and re-slice rather than pushing through.

**Prefer deleting to adding.** This is a prototype (§77). Bad ideas should be thrown
away cheaply. Do not preserve code because it exists, and do not build abstraction for
a second use case that has not appeared.

**Verify, do not assume.** Run the command. Check the output. Load the seed and click
the thing. "Should work" is not a result. When you report something works, it is
because you watched it work.

**State assumptions out loud.** When something is genuinely ambiguous, do the work that
does not depend on the answer, then state the assumption you made or ask the one
question that matters. Do not block a whole phase on a question you could answer with
a defensible default and a note.

---

## 5. Efficient working methods

**Batch independent work.** Issue independent reads, searches, and edits together
rather than one per turn. Every turn re-sends the conversation; turn count is the
dominant cost.

**Do not re-verify what is already verified.** Once a check passes, do not run it again
until the code changes. Do not re-read a file you just wrote.

**Run long things in the background and collect them once.** Never poll in a sleep loop.

**Do not do unasked work.** No changelogs, no formatting sweeps, no coverage passes, no
opportunistic refactors outside the phase. Note what you spotted; leave it for its own
slice.

**Fail loudly and early.** Validate seeds against schemas, lint the banned patterns
(`new Date()` in domain, literal colors in components), and let CI catch drift rather
than a confused debugging session later.

**Commit in small, green, described increments.** Reference the slice and the §N. A
readable history is how the next session — yours or someone else's — rebuilds context
without re-reading everything.

**Leave the repository ready for a cold start.** The next agent begins with only this
file. Everything they need to continue must be reachable from it, and true.
