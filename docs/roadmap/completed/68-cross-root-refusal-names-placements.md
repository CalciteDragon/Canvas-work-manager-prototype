<!-- completed-record id="68" closed="2026-10-10" summary="A refused cross-root move describes each blocking placement's page and source in one shared sentence; agents remove it by the id from the text" -->
# Slice 68 — Cross-root move refusal names each placement

## Goal

When moving a project to another root is refused because a shortcut would cross root trees, the
refusal names where each blocking placement lives and what it points at. A person or an agent can
then remove it in one step, without searching the tree.

**Source.** Friction note `note-2026-10-03-002` (Slice 65 real use through HTTP MCP).
- Today the refusal is: `shortcut "shortcut-…" would cross root trees; remove that placement
  first`.
- Since [Slice 65](../completed/65-work-canvas-shortcuts.md), the blocking placement can sit on the
  mover's own Work canvas or anywhere else in the tree. An agent had to list shortcuts project by
  project to find it.

## Spec sections

- **§§26–27:** project hierarchy, and shortcuts across a root tree.
- **§54:** the MCP tools (`update_project`, `undo_operation`) whose refusal text a text-only client
  acts on ([MCP history conflict guidance](../../decisions/2026-09-mcp-history-conflict-guidance.md)).
- **§61:** HTTP rule errors.
- **§77, §79:** real use and friction.

## Build

- **The message.** `ProjectService.assertNoShortcutCarriedAcrossRoots`
  (`packages/domain/src/project-service.ts`) builds the message from data the check already reads.
  For each placement it names:
  - the shortcut id;
  - the **destination** project and page;
  - the **source** section's name (`nameOf`) and its owning project.

  It ends with the repair: "remove it from that page, then retry" (or "remove each from its page").
  The wording stays surface-neutral (AGENTS §1): it names no UI control or MCP tool.
- **One shared sentence.** The history executor gives the same refusal for Undo and Redo of a move
  (`project-history.ts`). Both should produce one sentence from one helper, rather than two copies.
- **Several placements.** Keep the message bounded: describe up to three placements, then list
  the rest by id (revised in round 1 from "and N more", so every id stays named).
- **Tests.**
  - Domain tests: one placement on the mover's own Work canvas; one on another canvas in the old
    root; several placements.
  - The MCP `update_project` refusal text in `mcp-acceptance.mjs` (both transports).
  - An HTTP route test.

## Done when

- **Through MCP, on a scratch `nested-projects` copy:** an agent places a shortcut to Garden's
  brief on Cabinets' Work canvas. It then calls `update_project` to move Cabinets to a new root.
  The refusal names Cabinets' Work page as the placement's canvas and Garden's brief as its source.
  - The agent removes exactly that shortcut, using the id in the message, and the retried move
    succeeds. No `list_section_shortcuts` call is needed.
  - The same sentence appears for a refused Undo/Redo of a move.
- **Atomicity.** The refusal still writes nothing.
- **Gates.** `pnpm test`, `pnpm lint` and `mcp-acceptance` pass, and real use is recorded.

## Do not

- Change when a move is refused (the both-ends rule from Slice 65), or add an automatic "remove and
  move" path.
- Add a new error type, error code or structured payload. This slice is about wording.
- Name a UI control or MCP tool in the domain message.

<!-- ───────────── Written when the slice starts ───────────── -->

## Design

**Where the sentence comes from today.** Two paths refuse the same placements:

- **Forward.** `ProjectService.update` → `assertNoShortcutCarriedAcrossRoots`
  (`project-service.ts:308-315`) throws a `DomainRuleError` naming only ids. HTTP maps it to 409
  `rule_violation` with body `{ error, message }`; MCP returns the message as text.
- **Undo/Redo.** `project-history.ts` `writeProject` → `crossRootShortcutConflicts` maps each
  placement to a typed `shortcut-reference` conflict. Local `refuse` → `refuseOnConflicts`
  (`operation-execution.ts:88-107`) renders the generic list, `shortcut-reference: shortcut [id] —
  remove the reference, then retry`. `OperationHistoryService` (`:268-275`) passes that message
  through as the `history_conflict` refusal text, beside the typed `conflicts`.

Both paths call `shortcutsCarriedAcrossRoots`. That function already reads each placement's page
and source section, and it lists the workspace's projects, archived ones included (no status
filter).

**The change.**

1. **`shortcutsCarriedAcrossRoots` returns what it read.** It returns `CarriedShortcut[]`
   (`{ shortcut, page, pageProject, source, sourceProject }`), not `SectionShortcut[]`.
   - The projects come from the `projects` list the function already loads, keyed by id, so there
     is no extra read.
   - A project absent from that list leaves the entry's project `undefined`, and the placement is
     still counted. This is defensive: integrity keeps both ends in one workspace.
   - Entries keep `shortcuts.list()` order. That is storage order, not canvas order: a Redo of a
     removal re-inserts at the end. Tests assert only orders they construct.
2. **One exported, pure helper writes the sentence:** `carriedShortcutsSentence(carried)` in
   `project-history.ts`. It returns `undefined` for an empty list.
   - **Every id is named.** The decisions say the refusal "names every such placement"
     (`2026-09-forward-reparent-…`, and `2026-10-work-canvas-shortcut-destinations.md:52-53`). That
     stays true. Only the **descriptions** are bounded: the first three placements are described,
     and any further ones are listed by id.
   - One placement:

     > `shortcut "shortcut-x" (on the Work page of "Cabinets", placing "Markdown" from "Garden") would cross root trees; remove it from that page, then retry`

   - Five placements:

     > `shortcuts "a" (on the Home page of "Home renovation", placing "Task List" from "Kitchen"), "b" (…), "c" (…), and "d", "e" would cross root trees; remove each from its page, then retry`

   - **Page.** The page word is the page kind, capitalized: `Home` or `Work`. Shortcuts sit only
     on canonical pages (`section-shortcut-service.ts:394`); any other kind would be shown the same
     way. A domain-local `pageWord(kind)` produces it. It is wording, not a type.
   - **Source.** `nameOf(source)` from contracts, which the domain already uses.
   - **Projects.** A project is named by its `name`; when unknown, by `[project-id]`.
   - **Surface-neutral.** It names no UI control or MCP tool.
3. **Forward path.** `assertNoShortcutCarriedAcrossRoots` throws
   `` `project "${subject.id}" cannot move to another root: ${sentence}` `` as a `DomainRuleError`.
   The error type and the 409 mapping are unchanged.
4. **Undo/Redo path.**
   - `crossRootShortcutConflicts` keeps producing exactly the same typed conflicts, with no
     `title` and no new field.
   - `writeProject` keeps the carried list. Its local `refuse` gains an optional `placements`
     argument. `writeProject` calls `shortcutsCarriedAcrossRoots` once, and `crossRootShortcutConflicts`
     becomes a pure map over that carried list, so nothing is read twice. (The other signature change
     is `shortcutsCarriedAcrossRoots`' return type, item 1.)
   - **Rendering without string surgery.** `refuseOnConflicts`' `sentence(shown)` callback
     receives an already-joined and already-bounded rendering of *all* conflicts. With five or
     more placements, other conflicts would be hidden in "and N more". So the existing list logic
     (`shown` + `more`, with `repairWords`) is extracted **unchanged** into an exported
     `conflictListText(conflicts, willRetire)` in `operation-execution.ts`.
     - `refuseOnConflicts` calls `conflictListText` itself, so its signature and every other
       executor's output stay byte-identical.
     - When placements exist, `refuse` calls `refuseOnConflicts(conflicts, () => opener +
       placementSentence + (others.length ? '; ' + conflictListText(others, false) : ''), () => false)`.
       Here `others` are the conflicts whose `problem !== 'shortcut-reference'`.
     - The typed payload still carries every conflict.
   - **Why other conflicts can appear.** `writeProject` can still append `new-dependent` conflicts
     for live children after the placement conflicts (`project-history.ts:547-550`). That happens
     on an archive+move recorded as `project.archive` (its Redo), or a reactivate+move recorded as
     `project.reactivate` (its Undo) — see `captureProjectWrite` (:259-273). The text therefore
     never omits a conflict that the typed payload carries.
   - **Opener.** It stays `refuse`'s own:
     `` `${Undo|Redo} of the ${operation.type minus "project."} on "<name>" was refused: …` ``.
     That reads "of the update", "of the archive" or "of the reactivate".
   - **Bound.** The generic five-item bound still applies to the other conflicts.

The shared text is the placement sentence, verbatim, from one helper. Each path keeps its own
opener, because forward and history refusals already open differently everywhere.

**Disclosure — accepted and recorded.**

- **What changes.** `ProjectService.update` asserts only `projects.write`
  (`project-service.ts:185-186`), and today's forward refusal names only ids. After this slice, a
  `projects.write`-only actor also learns same-workspace project and source-section names from a
  refused move. The family-grant decision (`2026-09-operation-family-permissions.md`) contemplates
  such actors.
- **Why it is accepted.**
  - History refusals already expose project titles to such an actor: `refuse` names the subject,
    and `parentConflicts` carry parent titles.
  - Every name is in the actor's own workspace and the tree it is writing to.
  - Gating the description on `projects.read` would give the same refusal two shapes, for no real
    protection in a single-workspace prototype.
- **Where it is recorded.** The decision amendment records this, and a domain test pins it.

## Acceptance check

1. **Domain** (`pnpm --filter @cwm/domain test`).

   **Fixture:** `buildHarness(buildSeed('nested-projects'))`, plus a new root `Other root`.
   - The root is named "Home renovation".
   - Kitchen's seeded placements, `shortcut-renovation-kitchen-tasks` and `-reflections`, sit on
     its Home page.
   - Their sources are named "Task List" and "Reflections" by `nameOf`.

   **Cases:**
   - **Forward, mover's own Work.**
     - Setup: Garden's untitled brief is placed on `page-project-cabinets`, and Cabinets is moved
       to `Other root`.
     - The `DomainRuleError` message contains the shortcut id,
       `on the Work page of "Cabinets", placing "Markdown" from "Garden"` and
       `remove it from that page, then retry`.
     - The store snapshot is unchanged.
   - **Forward, another canvas.** A new Cabinets section titled "Hinges" is placed on Garden's
     Work page (`page-project-garden`). Moving Cabinets gives a message containing
     `on the Work page of "Garden", placing "Hinges" from "Cabinets"`.
   - **Forward, several.** Moving Kitchen to `Other root` names both seeded placements.
     - Each is described `on the Home page of "Home renovation"`, placing `"Task List"` or
       `"Reflections"` `from "Kitchen"`.
     - The repair reads `remove each from its page`.
   - **Forward, beyond three.**
     - Setup: three more Kitchen sections are each placed on Home renovation's Home page, giving
       five placements with the two seeded ones first.
     - Moving Kitchen names all five ids and describes only the first three.
     - The message contains `and "<id4>", "<id5>" would cross root trees`.
     - Nothing is written.
   - **Grant.** An actor holding only `projects.write` (`agentActorFor(0, ['projects.write'])`)
     gets the same described message. This pins the accepted disclosure.
   - **Undo and Redo.**
     - The existing reversal cases in "a reparent reversal refuses a shortcut it would carry across roots" (`:666`) and the Slice 65 describe (`:766`) keep their typed
       conflicts exactly.
     - Their refusal message contains the expected sentence, computed in the test before stepping.
       The harness satisfies `ProjectHistoryRepositories`, so the test calls
       `carriedShortcutsSentence(await shortcutsCarriedAcrossRoots(h, subject, destination))`. The
       string is not copied by hand.
     - For example, the `:666` case gives
       `on the Home page of "Other root", placing "Kitchen notes" from "Kitchen"`.
   - **Mixed conflicts.**
     - Setup, on `nested-projects`. Cabinets has no children, so `h.actor` can archive it and
       move it to `Other root` in one update (`project.archive`), then Undo that.
     - Then `someoneElse` (`project-history.test.ts:13`) adds a live child under Cabinets and
       places Garden's brief on `page-project-cabinets`.
     - These are `someoneElse`'s writes because a placement records in the acting actor's history
       of the destination project. A write by `h.actor` would discard its Redo branch
       (`operation-recorder.ts:153-155`) and turn the refusal into `history_not_next`. This follows the
       Slice 65 Redo case at `:792-797`.
     - The Redo is refused. Its text contains the placement sentence **and** the generic
       `new-dependent: project "<child>"` entry.
     - The typed conflicts list both, and the opener reads `Redo of the archive on "Cabinets"`.
   - **Pure helper.**
     - `[]` gives `undefined`.
     - One entry uses the singular repair; several use the plural.
     - Five entries are all named, with three described.
     - An `undefined` project falls back to `[project-id]`.
2. **HTTP** (`pnpm --filter prototype-host test`). Assertions read `refused.body.message`, not
   `JSON.stringify(body)`, because stringifying escapes the quotes.
   - **Existing Home case** (`routes.test.ts:879`). It keeps both ids, and the message also
     contains `on the Home page of "Home renovation"` and `from "Kitchen"`.
   - **Existing Work case** (`routes.test.ts:947`, "answers 409 naming the Work placement…"). It
     already places Garden's brief on Cabinets' Work page, moves Cabinets, and checks the 409 and
     that nothing is written. It additionally asserts that `refused.body.message` contains
     `on the Work page of "Cabinets", placing "Markdown" from "Garden"`.
3. **MCP, both transports** (`pnpm --filter prototype-host mcp-acceptance`), in
   `assertProjectHistory`:
   - **Forward.** This is new work in the existing block (`:712-732`).
     - The refusal text contains `on the Work page of "<child's current name>"` and
       `placing "Anchor" from "<second's name>"`.
     - The id is parsed from that text (`/shortcut "([^"]+)"/`) and asserted equal to `pinnedId`.
     - `remove_section_shortcut` uses the **parsed** id, and the retried move succeeds.
   - **Reversal.** A new block, after the retried move.
     - Starting state: the top of the agent's history for the child is that move, `second` →
       `first`.
     - `foreign` (`agent-cursor`, still holding `projects.write` here) runs `create_section` on
       `first` with the explicit title `Reversal anchor`, which lands on its Home. It then places
       that section on the child's Work page. The script keeps `receiptOf(retried)` for the Undo;
       the current code drops it (`:731`).
       That placement is same-root at placement time. It is recorded in `foreign`'s history, so it
       does not block the agent's cursor.
     - The agent's `undo_operation` on the move is refused (`isError`, `history_conflict`).
     - The text contains (checked with `includes`)
       `on the Work page of "Renamed <title>", placing "Reversal anchor" from "Project history A <title>"`.
       The full text opens `history_conflict: Undo of the update on …`.
     - Nothing is written: `businessState` is unchanged, and `projectOf(child).parentProjectId` is
       still `first`.
     - Once `foreign` removes the placement, the Undo succeeds.
     - The verbatim "same sentence" is proven at the domain level. MCP proves the clause's content
       on both transports.
4. **Live run** (§77): `pnpm dev:host` on a scratch copy of `nested-projects`, with an agent
   connection over HTTP MCP. This is the Done-when.
   - Place Garden's brief on Cabinets' Work page (`add_section_shortcut`).
   - Create a new root, then try to move Cabinets under it (`update_project`). The refusal names
     `the Work page of "Cabinets"` and `"Markdown" from "Garden"`.
   - Remove the placement with the id copied from the text (`remove_section_shortcut`), without a
     `list_section_shortcuts` call. The retried move succeeds.
   - Provoke the reversal refusal. The seeded `agent-cursor` has only read grants, so the second
     actor is the **person, through HTTP**. Requests sent with no `x-prototype-user` header act as
     `users[0]` (`apps/prototype-host/api/context.ts:14-18`).
     - Garden's brief is now cross-root to Cabinets, so it cannot be placed (404).
     - The person first creates a titled section on the new root R (`POST /api/projects/<R>/sections`),
       which lands on R's Home.
     - The person then places it with `POST /api/projects/project-cabinets/shortcuts`,
       `pageId: page-project-cabinets`.
     - The agent's Undo of the move is refused with
       `on the Work page of "Cabinets", placing "<title>" from "<R's name>"`.
   - Record friction in `.prototype/notes.json`, and resolve `note-2026-10-03-002`.
5. `pnpm test`, `pnpm lint` (including `pnpm docs:check`) and `mcp-acceptance` are green.

## File-level change list

| File | Change | Responsibility |
|---|---|---|
| `packages/domain/src/project-history.ts` | modify | `CarriedShortcut` and the richer `shortcutsCarriedAcrossRoots`. Exported `carriedShortcutsSentence`, with a local `pageWord`. `crossRootShortcutConflicts` maps `entry.shortcut.id`, so its output is unchanged. Local `refuse` takes optional placements and replaces only the `shortcut-reference` part of the rendering. Doc comments. |
| `packages/domain/src/operation-execution.ts` | modify | Extract the existing list rendering, unchanged, into exported `conflictListText(conflicts, willRetire)`. `refuseOnConflicts` uses it, and its signature and output are unchanged. |
| `packages/domain/src/project-service.ts` | modify | `assertNoShortcutCarriedAcrossRoots` throws `project "<id>" cannot move to another root: <sentence>`. Doc comment. |
| `packages/domain/src/project-history.test.ts` | modify | Helper unit cases; the reversal cases assert the clause; the mixed-conflict Redo case. |
| `packages/domain/src/project-service.test.ts` | modify | The nested describe gains own Work, another canvas, several, beyond three, and grant. The default-harness Home describe keeps its id assertions, which stay true. |
| `apps/prototype-host/api/routes.test.ts` | modify | Extends the Home case (`:879`) and the Work case (`:947`) with assertions on `body.message`. |
| `apps/prototype-host/scripts/mcp-acceptance.mjs` | modify | Forward wording plus the id parsed from the text; the reversal block with `foreign`. Comments: the header (`:33-41`) gains a Slice 68 clause; the `assertProjectHistory` docblock (`:584-590`) mentions the reversal block; the forward block's Undo-avoidance comment (`:712-714`) stays true and gains a pointer to the reversal block. |
| `apps/web/src/app/prototype/dev-panel/dev-panel-store.ts` | modify | `CURRENT_SLICE = 68`. |
| `docs/decisions/2026-09-forward-reparent-refuses-cross-root-shortcut.md` | modify | Dated **Amended — Slice 68**: the sentence, the shared helper, every id named with three described, typed conflicts unchanged, mixed-conflict rendering, and the accepted `projects.write` disclosure. Answers its "Medium on the wording". |
| `docs/decisions/2026-10-work-canvas-shortcut-destinations.md` | modify | One dated line: the refusal now also describes each placement's page and source (Slice 68). The rule is unchanged. |
| `docs/decisions/README.md` | modify | Both rows' status notes mention Slice 68. |
| `docs/architecture/domain/how.md` | modify | The project-step paragraph (`:176-191`) covers the richer return value, the one shared sentence and the mixed rendering. The shared-formatter sentence (`:174-175`) names `conflictListText`. |
| `docs/architecture/domain/why.md` | modify | The decision link at `:240` drops "Home" from its stale title (stale since Slice 65). |
| `docs/architecture/testing/how.md`, `docs/architecture/testing/what.md` | modify | The `mcp-acceptance` description (`how.md:~81`, `what.md:~81`) adds Slice 68's id-from-text step and the reversal block. |
| `.prototype/notes.json` | modify | A Slice 68 real-use note. `note-2026-10-03-002` gains `resolvedAt` and `resolution`, the shape earlier resolved notes use. |
| `docs/roadmap/active/68-cross-root-refusal-names-placements.md` | modify | Revisions now, the Outcome at close. `progress.md` is regenerated by `roadmap.mjs`. |

No changes to contracts, schemas, MCP tool descriptions, web components or seeds. Checked and left
alone:
- `packages/domain/src/index.ts` does not re-export `project-history.ts`; tests import the module
  directly.
- `docs/architecture/mcp-tools/how.md` describes `update_project`'s receipts and rules, not this
  refusal's text.

## Test plan — tests first

Write each test first, and watch it fail on the old wording, not on a typo. Then implement.

| Test | Proves |
|---|---|
| `operation-execution.test.ts` (existing, unchanged) | The extraction is behaviour-preserving: the existing refusal-text cases still pass without edits. |
| `operation-execution.test.ts: refuseOnConflicts' message is sentence(conflictListText(...)) for a six-item list` (new) | Pins the new export as the single source of the list rendering. |
| `project-history.test.ts: carriedShortcutsSentence names nothing for an empty list` | It returns `undefined`, so neither caller checks emptiness. |
| `…: describes one placement's page, destination, source name and source owner, singular repair` | The exact one-placement sentence. |
| `…: names all five ids, describes the first three, plural repair` | The bound applies to descriptions only; every id stays named. |
| `…: falls back to the project id when a project is unknown` | The defensive path degrades the description and never drops a placement. |
| `project-service.test.ts` (nested): `S-dest names the mover's own Work page and the source's owner` (extends) | The friction note's scenario. |
| `…: S-src names another canvas holding the mover's section` (extends) | The other end of the both-ends rule. |
| `…: moving Kitchen describes both seeded Home placements` | Home wording, the seed's real names, the plural form. |
| `…: five carried placements: all ids, three described, nothing written` | The bound on the real path, and atomicity. |
| `…: a projects.write-only actor gets the described refusal` | The accepted disclosure is pinned. |
| `project-history.test.ts: reparent reversals (`:666` and the Slice 65 describe at `:766`) carry the shared sentence` (extends) | The Undo/Redo text equals the helper's output for the same placements; the typed conflicts are unchanged. |
| `…: Redo of an archive+move with a live child and a split placement lists both` | Mixed rendering, the operation-derived opener, and agreement between text and payload. |
| `routes.test.ts: Home 409 describes both placements` (extends); `Work 409 names Cabinets' Work page` (extends `:947`) | HTTP carries the sentence and writes nothing. |
| `mcp-acceptance.mjs`: forward (id from text) and reversal blocks | Both transports. |

The web is not tested, because it renders neither text: there is no move UI, and history feedback
renders `nextStep`, which does not change.

## Boundaries touched

- **Domain depends on domain and repository abstractions only.**
  - The helper is pure, and the check reads the same four repositories.
  - `ProjectService` gains no edge: it already imports `shortcutsCarriedAcrossRoots` from
    `project-history.ts`.
  - `nameOf` comes from contracts, as it already does elsewhere in the domain.
- **MCP tools call domain services.** No tool changes; the text arrives through the existing error
  mapping.
- **Contracts defined once.**
  - `CarriedShortcut` is a domain-local read result built from contract types, not a parallel
    contract.
  - `UndoConflict` is unchanged, so "no new structured payload" holds.
- **No `new Date()`, literal styles or prototype-mode checks** are touched.
- **Surface-neutral domain wording.** The sentence names pages and sections, never a control or a
  tool.

## Explicit non-goals

- Changing when a move is refused, or the order of the conflict checks. In particular, the
  children check is not suppressed when placements are found; both are reported.
- Adding a `title` or any field to the `shortcut-reference` conflict. Slice 69 owns how a shortcut
  is named. This sentence names the source by `nameOf` and its owning project, which already tells
  two untitled briefs apart.
- Changing the generic `refuseOnConflicts` rendering. It is extracted into `conflictListText`
  without change, and the other executors' output stays byte-identical, existing tests included.
- Changing the other executors' `shortcut-reference` conflicts (section removal, page, task).
- Gating the descriptions on `projects.read` (see Disclosure).
- A move UI, or an inline "remove and move".
- A new error type or code, or a change to an MCP tool description.

## Open questions

- None that change the shape of the work. The wording is the default above. Real use confirms it
  and the decision amendment records it. If it reads badly, only the helper changes.

## Revisions

- **Round 1 (2026-10-09):** the reviewer raised seven substantive findings. Each is fixed below.
  - **Seed names.** The seed names were wrong. The root is "Home renovation", and Kitchen's sources
    are "Task List" and "Reflections". The "several" cases moved to the `nested-projects` describe,
    because the default-harness describe has no seeded placements.
  - **Undo/Redo assumed only placement conflicts.** The design assumed the placement conflicts
    were the whole list. In fact, an archive+move Redo or a reactivate+move Undo also appends
    `new-dependent` conflicts.
    - Rendering now replaces only the `shortcut-reference` part.
    - The opener is described as operation-derived.
    - A mixed-conflict test is added.
  - **The bound contradicted two decisions.** A three-item bound broke "names every placement" in
    two decisions. Now every id is named and only the descriptions are bounded; the slice's "and N
    more" became the remaining ids.
  - **Disclosure was overstated.** The forward path does reveal new names to a
    `projects.write`-only actor. The plan now says so, accepts it, records it in the amendment and
    pins it with a test.
  - **MCP forward block.** It did not already remove the shortcut by the id from the text. That is
    now listed as new work.
  - **MCP reversal block.** It is now concrete: `foreign` places a section from `first` on the
    child's Work page, and a check that the projects are unchanged is added.
  - **Minor fixes.**
    - Route tests assert on `body.message`.
    - The testing docs and the Slice 65 decision are added to the change list.
    - The live run names the person as the second actor.
    - Order is storage order, and the unknown-project fallback is defensive.
    - The §54 citation is corrected.
- **Round 2 (2026-10-09):** The reviewer confirmed the round-1 fixes against the code. That
  covered the seed names, the counts, the reachability of mixed conflicts, the disclosure test, the
  MCP reversal mechanics, and the person as the live second actor. It raised two substantive
  findings:
  - **Rendering.** The "replace only the `shortcut-reference` part" rendering could not be built
    from `refuseOnConflicts`' already-joined, already-bounded `shown` string. The existing list
    logic is now extracted unchanged into an exported `conflictListText`, and `refuse` composes the
    placement sentence with `conflictListText(others)`. `operation-execution.ts` and the
    formatter sentence in domain `how.md` were added to the change list.
  - **Mixed-conflict setup.** The setup did not name its actor. A placement by `h.actor` would have
    discarded its own Redo branch. The setup writes are now `someoneElse`'s.

  The minor findings were also fixed:
  - "ends with" became "contains".
  - The HTTP Work case already exists (`:947`), so it is extended rather than added.
  - The live run's reversal step now creates a source section on the new root first, because
    Garden's brief would be cross-root by then.
  - The MCP reversal section has a fixed title, and it keeps the retried move's receipt.
  - The Undo/Redo tests compute the expected sentence from the harness.
  - The stale decision title in domain `why.md` is now in the change list.
- **Round 3 (2026-10-09):** The reviewer checked the extraction, the mixed-conflict setup, every
  literal string and the existing assertions against the code. **No substantive findings.** Minor
  fixes applied:
  - The `mcp-acceptance` comment edits are retargeted: the header, the docblock and the `:712-714`
    pointer.
  - The data flow is stated: one read in `writeProject`, and `crossRootShortcutConflicts` becomes a
    pure map. "Only signature change" is dropped.
  - A direct `conflictListText` test is added.
  - The Build wording is aligned.
  - The `:666` describe is named by its title instead of "Slice 39".
  - Line references are corrected.

## Outcome

**Deliverables** — A refused cross-root move now says where each blocking placement sits and what
it places: `shortcut "<id>" (on the Work page of "Cabinets", placing "Markdown" from "Garden") would
cross root trees; remove it from that page, then retry`. One pure helper,
`carriedShortcutsSentence` in [`project-history.ts`](../../../packages/domain/src/project-history.ts),
writes it from the `CarriedShortcut`s that `shortcutsCarriedAcrossRoots` now returns. The forward
refusal in [`project-service.ts`](../../../packages/domain/src/project-service.ts) and a reparent's
Undo/Redo both use it, each behind its own opener. `conflictListText` was extracted unchanged from
`refuseOnConflicts` in [`operation-execution.ts`](../../../packages/domain/src/operation-execution.ts),
so a mixed history refusal lists every other conflict after the sentence. HTTP 409s and both MCP
transports carry the text. `mcp-acceptance` removes the placement by the id parsed from the
refusal, and proves the same description on a refused Undo. The live run on a scratch
`nested-projects` copy over HTTP MCP did the Done-when exactly. The agent removed the placement with
no `list_section_shortcuts` call and the retried move succeeded. A person-placed section then made
the agent's Undo refuse with `on the Work page of "Cabinets", placing "Bench notes" from
"Workshop"`, and the refused Undo wrote nothing.

**Deliberate choices** — Every id is named; only the first three placements are described, so the
two decisions' "names every placement" stays true. The typed `shortcut-reference` conflicts are
unchanged (no title, no field); only the text differs. The `projects.write`-only disclosure is
accepted and pinned by a test. All three are recorded in the
[forward-reparent amendment](../../decisions/2026-09-forward-reparent-refuses-cross-root-shortcut.md).
Three placements read `a, b and c`, and four or more read `a, b, c, and d, e`, as the plan's examples
show. Tests pin both boundaries.

**Deviations from the plan** — None in shape. The route-test extensions were written after the
domain change. Their failure on the old wording was shown by temporarily restoring the pre-slice
domain files: both 409 cases failed, then passed again on the new code. The plan's forward test
cases extended the existing `S-dest`/`S-src` tests rather than adding new ones. Review added a
comment on `refuse`'s unused `shown` argument and helper tests for exactly three and four
placements.

**Deferred** — An untitled source still reads by its type ("Markdown"). Two untitled briefs in one
project would read the same, and the remove receipt says "Removed the Markdown shortcut". That
belongs to [Slice 69](../active/69-distinguishable-shortcut-names.md) (how a shortcut is named), recorded as friction note
`note-2026-10-09-007`. A move UI and an inline "remove and move" stay out of scope.

**Open questions** — None new. Whether three described placements is the right bound only matters
once real trees carry more than a handful of split placements.

**Documentation updated** — `docs/architecture/domain/{how,why}.md`,
`docs/architecture/testing/{how,what}.md`, both cross-root decisions (dated Slice 68 amendments)
and their index rows, and `.prototype/notes.json`: `note-2026-10-03-002` is resolved and
`note-2026-10-09-007` is added.

**Gates** — `pnpm lint` (with `docs:check`) and `mcp-acceptance` on both transports pass.
`pnpm test` did **not** pass in a single run on this machine. Across six full runs, each one had a
different set of unrelated specs hit vitest's 5 s timeout: domain import-lint and service specs,
host stdio and live-update specs, and web component specs. No assertion failed, and every run's
failures were timeouts only. Slices 66 and 67 recorded the same pattern. On the final tree, every
package passed on its own:
- the root script tests: 9;
- contracts 364, repositories 200, prototype-data 112, domain 844, mcp-tools 181, prototype-host 291;
- web 967/967, in five batches, because the whole web suite still times out on this machine even
  run alone.

Web depends only on `@cwm/contracts`, which this slice does not touch; its only change is
`CURRENT_SLICE`. No timeout was widened.
