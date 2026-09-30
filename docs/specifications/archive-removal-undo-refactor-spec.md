# Archive, Removal, and Undo Refactor Specification

**Status:** Proposed  
**Scope:** Project section removal, long-term recovery, archive UX, and future undo/redo support  
**Primary code areas:** `packages/contracts`, `packages/domain`, `packages/repositories`, `apps/prototype-host`, `apps/web`  

## 1. Executive Summary

The current archive model is carrying two different responsibilities:

1. **Long-term recovery of meaningful user content** - for example, task lists with real tasks or rich-text notes that would be painful to recreate.
2. **Reversibility of UI mutations** - preserving enough state to undo removing, moving, or editing a section.

Those responsibilities should be separated.

The target model is:

- **Remove** means "take this thing out of the active project UI."
- **Archive** means "preserve meaningful user-created content so it can be intentionally recovered later."
- **Undo** means "reverse a recent user operation as faithfully as possible."

Archive should no longer be a direct projection of every entity that has an `archivedAt` marker. It should become a product-level projection of **recoverable content**. Undo should be a separate, operation-level mechanism that records the inverse of mutations inside the same unit of work.

This allows disposable views such as Progress, Timeline, or Recent Activity to be deleted without cluttering the Archive, while still supporting an immediate Undo button. Data-bearing sections such as task lists, reflections, and non-empty rich text can remain recoverable in the Archive when their removal would otherwise discard meaningful content.

The refactor should be incremental: preserve the existing tombstone and cascade-marker persistence where it already provides strong referential integrity, decouple it from Archive UI semantics, then add an independent undo model.

---

## 2. Problem Statement

Today, section removal is modeled primarily through archiving. This creates friction because the same persistence concept is being used to answer two different product questions:

- "Should the user be able to find this content in Archive in a month?"
- "Should the user be able to reverse the UI action they just took?"

These questions do not have the same answer.

A Progress view, for example, contains little or no unique user data. The user can recreate it in a few clicks. Keeping every removed Progress view in the Archive creates noise and makes Archive feel like implementation history rather than a useful recovery surface.

A task list containing real tasks is different. Removing it may hide or discard substantial user-created information. That content should have a durable recovery path.

Rich text exposes another important distinction: section ownership alone is not enough to determine recovery behavior. Rich text may not own rows in a separate collection, but its `config.text` can contain irreplaceable user content.

The current architecture therefore conflates:

- entity lifecycle,
- long-term user recovery,
- referential-integrity tombstones,
- layout restoration,
- and future UI undo.

The refactor should give each concern an explicit responsibility.

---

## 3. Goals

The refactor should achieve the following:

1. Keep the Archive useful and low-noise by showing only content worth intentionally recovering.
2. Allow disposable UI views to be permanently removed without creating Archive clutter.
3. Preserve durable recovery for user-created data that is difficult or costly to reproduce.
4. Support a future immediate Undo UI for section removal and other project mutations.
5. Make Undo more faithful than Archive Restore, including placement restoration where possible.
6. Keep mutations, activity history, and undo metadata atomic through the existing `UnitOfWork` boundary.
7. Preserve current referential-integrity guarantees during migration rather than rewriting storage all at once.
8. Keep the model extensible enough to support Redo later without moving to event sourcing.
9. Make removal behavior understandable from explicit capabilities rather than implicit section-type assumptions.

## 4. Non-Goals

This refactor does **not** require:

- converting the application to event sourcing;
- making ActivityEvent the source of truth for undo;
- immediately replacing all archived section tombstones with a new archive storage format;
- implementing unlimited persistent undo history;
- implementing Redo in the first pass;
- preserving the exact original placement when restoring old content from Archive;
- making all section types follow the same deletion policy.

---

## 5. Core Design Principle

The system should treat these as three separate concepts:

```text
Undo is about actions.
Archive is about content.
Remove is about layout.
```

A section removal flows through all three concerns, but none of them should define the others.

```text
                       Remove section
                            |
              +-------------+-------------+
              |             |             |
              v             v             v
        Active layout   Recovery       Undo history
        is changed      decision       records action
              |             |             |
              |        valuable data?     |
              |          /       \        |
              |        yes       no       |
              |         |         |       |
              |      retain     discard   |
              |                         |
              +-------------------------+
                         |
                  immediate Undo
```

### 5.1 Remove

**Product meaning:** "I do not want this thing on the active project surface anymore."

Remove determines what leaves the current layout. It does not promise long-term retention by itself.

### 5.2 Archive

**Product meaning:** "Preserve meaningful content so I can deliberately recover it later."

Archive is a durable, user-facing recovery feature. It should not be a raw list of every removed UI object.

### 5.3 Undo

**Product meaning:** "Reverse the operation I just performed as accurately as possible."

Undo is short-lived action history. It should work even when the removed object is not eligible for long-term Archive retention.

---

## 6. Separate Ownership from Recoverability

The current distinction between row-owning containers and views remains valuable, but it should not directly determine Archive behavior.

Two independent questions must be modeled:

1. **Does this section own canonical rows?**
2. **Does removing this section risk losing meaningful user-created content?**

Example:

| Section type | Owns canonical rows? | Contains potentially meaningful recoverable content? |
|---|---:|---:|
| Task list | Yes | Yes |
| Reflections | Yes | Yes |
| Rich text | No separate rows | Yes |
| Progress | No | No |
| Timeline | No | No |
| Recent activity | No | No |

This avoids the brittle rule:

```ts
if (section.isContainer) archive();
else delete();
```

Rich text proves that "container" and "worth recovering" are different concepts.

---

## 7. Proposed Section Capability Model

Section behavior should be described in one explicit registry.

A conceptual shape:

```ts
interface SectionCapabilities {
  ownedData?: 'tasks' | 'reflections';

  recovery:
    | 'none'
    | 'config'
    | 'owned-content';
}
```

Example configuration:

```ts
const SECTION_CAPABILITIES = {
  'task-list': {
    ownedData: 'tasks',
    recovery: 'owned-content',
  },

  reflections: {
    ownedData: 'reflections',
    recovery: 'owned-content',
  },

  'rich-text': {
    recovery: 'config',
  },

  progress: {
    recovery: 'none',
  },

  timeline: {
    recovery: 'none',
  },

  'recent-activity': {
    recovery: 'none',
  },
} satisfies Record<string, SectionCapabilities>;
```

### 7.1 Capability vs. actual removal outcome

A capability describes what a section *can* contain, not whether a particular removal must create an Archive item.

The final decision should also consider the mutation result.

Examples:

- A task list with 15 tasks that are cascaded on removal has meaningful recoverable content -> retain and expose through Archive.
- A task list whose tasks are reassigned to another list before removal no longer contains meaningful content -> delete the empty section and do not create Archive clutter.
- An empty rich-text section -> delete.
- A rich-text section with notes -> retain/recover.
- Progress -> delete regardless of its display configuration; Undo can still reconstruct it.

This implies a domain-level decision such as:

```ts
const recoveryDecision = recoveryPolicy.evaluate({
  section,
  ownedRowsBefore,
  ownedRowsAfter,
  removalMode,
});
```

The capability registry supplies the rules; the actual mutation supplies the context.

---

## 8. Internal Tombstones Are Not Archive Items

A major simplifying principle is:

> An internally retained tombstone does not have to appear in the user-facing Archive.

The current persistence model may need to keep an archived section record because row references and cascade markers depend on it. That is an internal integrity requirement, not a UX requirement.

The architecture should therefore distinguish:

```text
Internal persistence                  User-facing Archive
--------------------                  -------------------
Archived section tombstone   ----->   Maybe represented
Archived task rows           ----->   Represented if meaningful
Archived rich-text content   ----->   Represented if meaningful
Deleted Progress view        ----->   Not represented
```

This is the lowest-risk first step because it allows the Archive UX to improve without immediately rewriting the row-reference model.

### 8.1 Archive becomes a projection

Instead of defining Archive as:

```ts
sections.filter(section => section.archivedAt != null)
```

introduce a domain projection such as:

```ts
interface ArchiveEntry {
  id: string;
  projectId: ProjectId;
  sourceKind: 'section' | 'task-group' | 'reflection-group';
  title: string;
  summary?: string;
  archivedAt: IsoDateTime;
  recoverableContentCount?: number;
  restoreTarget: ArchiveRestoreTarget;
}
```

The exact storage representation can remain unchanged initially. `ArchiveService.list()` derives user-facing recovery entries from internal canonical state.

This means Archive is a product concept, not a direct entity-state dump.

---

## 9. Archive Restore Semantics

Archive Restore should optimize for recovering content, not replaying history exactly.

Its promise should be:

> "Bring my saved content back into the active project."

It may restore a section using a sensible current placement rather than its exact old coordinates or index.

For example, restoring an old task list can:

1. reactivate or reconstruct its section;
2. restore the task rows that were cascaded with it;
3. place it at the end of the appropriate current page, or another deterministic default location;
4. preserve meaningful settings such as title and section configuration.

Archive Restore does not need to guarantee pixel- or index-perfect historical placement.

This is intentionally different from Undo.

---

## 10. Undo Must Be a Separate Operation Model

ActivityEvent should remain audit/history data. It should not become the undo engine.

Activity history answers:

> "Who did what, to what, and when?"

Undo needs to answer:

> "What exact inverse mutation can reconstruct the previous state?"

Those records have different durability, payload, and semantics.

Introduce an independent operation-level record, tentatively named `UndoRecord` or `MutationReceipt`.

Recommended conceptual shape:

```ts
interface UndoRecord {
  id: UndoRecordId;
  workspaceId: WorkspaceId;
  projectId?: ProjectId;

  actorUserId: UserId;

  label: string;
  createdAt: IsoDateTime;

  inverse: UndoOperation;
}
```

The inverse should be a typed, versioned union rather than an arbitrary JSON blob.

```ts
type UndoOperation =
  | {
      version: 1;
      type: 'section.remove';
      section: ProjectSection;
      placement: PlacementSnapshot;
      rows: RowSnapshot[];
    }
  | {
      version: 1;
      type: 'section.move';
      sectionId: SectionId;
      placementBefore: PlacementSnapshot;
    }
  | {
      version: 1;
      type: 'section.update';
      sectionId: SectionId;
      before: SectionEditableState;
    }
  | {
      version: 1;
      type: 'section.add';
      sectionId: SectionId;
    };
```

The first implementation can support only the operations required by the current UI while retaining a versioned extension point.

---

## 11. Undo Records Are Operation-Level, Not Row-Level

One user action can mutate many canonical records.

Removing one task-list section might affect:

- one section;
- many tasks;
- nested subtasks;
- cascade markers;
- layout ordering;
- one ActivityEvent;
- one UndoRecord.

This should still produce exactly **one undoable user operation**.

```text
operation-123
|
+-- section removed/retained
+-- tasks archived or reassigned
+-- placement changed
+-- ActivityEvent recorded
+-- one UndoRecord recorded
```

The UI should be able to show:

```text
Task list removed.  [Undo]
```

rather than exposing internal row mutations.

---

## 12. UnitOfWork Integration

Undo metadata should participate in the same transaction boundary as the mutation it can reverse.

Recommended flow:

```text
Domain service
  |
  +-- unitOfWork.run(...)
        |
        +-- mutate canonical state
        +-- ActivityService.record(...)
        +-- UndoRecorder.record(...)
        |
        +-- validate
        +-- persist
        +-- commit
```

Like `ActivityService.record()`, `UndoRecorder.record()` should not open its own unit of work. It participates in the caller's operation.

Required guarantee:

> A mutation must not commit successfully without the UndoRecord that the UI was promised for that mutation.

If undo persistence fails, the mutation should roll back with the rest of the unit of work.

---

## 13. Placement Snapshot Strategy

For true Undo, storing only a numeric position is fragile.

Example:

```text
Before: A B C D
Remove C -> A B D
Insert X -> A X B D
Undo C
```

Blindly restoring `position = 2` may no longer reflect the user's original spatial intent.

Store stable neighbors in addition to a fallback index:

```ts
interface PlacementSnapshot {
  pageId: ProjectPageId;

  previousId?: PlacementId;
  nextId?: PlacementId;

  fallbackIndex: number;
}
```

Undo placement algorithm:

1. If the previous neighbor still exists, restore after it.
2. Else if the next neighbor still exists, restore before it.
3. Else use the fallback index clamped to the current placement list.
4. If the original page is no longer available, use a deterministic project-specific fallback and surface that the restore was partial if necessary.

Archive Restore does not require this precision.

---

## 14. Removal Behavior Matrix

The product behavior should be driven by meaningful content, not by a blanket "all removed sections are archived" rule.

| Removal case | Active result | Archive | Undo |
|---|---|---|---|
| Remove Progress | Hard-delete section | No entry | Recreate exact section/config/placement |
| Remove Timeline | Hard-delete section | No entry | Recreate exact section/config/placement |
| Remove Recent Activity | Hard-delete section | No entry | Recreate exact section/config/placement |
| Remove empty rich text | Hard-delete section | No entry | Recreate section/config/placement |
| Remove rich text with notes | Retain recoverable content | Yes | Restore exact prior section/placement |
| Remove task list and cascade tasks | Retain section/tombstone + affected rows | Yes | Reverse complete operation |
| Remove task list and reassign all tasks | Delete now-empty source section | No entry | Restore source list and reverse reassignment |
| Remove reflections section with reflections | Retain recoverable content | Yes | Reverse complete operation |

This matrix should be enforced by domain tests, not just UI behavior.

---

## 15. Same Section Type Can Have Different Outcomes

The recovery decision should be contextual.

### 15.1 Task list removed with cascade

```text
Remove "Sprint Tasks"
  -> tasks would otherwise leave the active project
  -> retain recoverable task content
  -> show Archive entry
  -> record Undo operation
```

### 15.2 Task list removed with reassignment

```text
Remove "Sprint Tasks"
  -> move all tasks into "Backlog"
  -> source section is now empty and carries no unique content
  -> delete source section
  -> do not show Archive entry
  -> record Undo operation containing old section + reassignment inverse
```

This is more intuitive than permanently categorizing the entire section type as "archive on remove."

---

## 16. Archive and Undo UX Contract

The UI should communicate different promises.

### Undo

**Promise:** "Put it back how it was."

Expected characteristics:

- immediate or recent;
- action-oriented;
- placement-aware;
- reverses the whole user operation;
- may exist for disposable UI elements;
- may expire or be bounded.

Suggested surface:

```text
Progress removed.  [Undo]
```

### Archive

**Promise:** "Bring my saved content back."

Expected characteristics:

- durable;
- content-oriented;
- intentionally browsable;
- low-noise;
- only contains difficult-to-reproduce content;
- restore may use a sensible new placement.

This distinction should be reflected in copy, service naming, and tests.

---

## 17. Redo Compatibility

Redo does not need to ship with the initial refactor, but the Undo representation should not block it.

A useful model is:

```text
Command A
   |
   +--> executes and produces inverse B

Undo executes B
   |
   +--> execution of B produces inverse A

Redo can execute A again
```

Typed inverse operations make this possible without introducing full event sourcing.

---

## 18. Proposed Domain Responsibilities

### `SectionService`

Responsible for:

- validating section removal;
- applying remove/reassign/cascade mutation semantics;
- consulting section recovery capabilities;
- choosing delete vs retain/tombstone;
- collecting the before-state needed for Undo;
- recording one operation-level undo record.

### `ArchiveService`

Responsible for:

- projecting internal state into user-facing `ArchiveEntry` records;
- excluding disposable view tombstones or implementation artifacts;
- restoring meaningful content using Archive Restore semantics;
- exposing enough metadata for clear Archive UI.

### `UndoRecorder` / `UndoService`

Responsible for:

- storing typed inverse operations;
- returning an operation identifier that the UI can invoke;
- applying an inverse operation atomically;
- enforcing user/workspace/project scope;
- eventually supporting bounded history and redo.

### `ActivityService`

Remains responsible for attributable historical/audit events. It should not carry reversible state snapshots.

### Repositories / DataStore

Remain canonical storage and atomic persistence boundaries. Existing tombstones and cascade markers can remain during the initial migration.

---

## 19. Contract Changes

Suggested additions under `packages/contracts`:

### 19.1 Section capabilities

The capability registry may remain domain-side if it is implementation policy rather than API data. If clients need capability metadata to render removal copy or controls, expose a serializable subset.

### 19.2 Undo contracts

Potential contracts:

```ts
export const UndoRecordIdSchema = z.string().uuid();

export const UndoReceiptSchema = z.object({
  undoId: UndoRecordIdSchema,
  label: z.string().min(1),
  createdAt: IsoDateTimeSchema,
});
```

Mutation endpoints that support Undo can return:

```ts
{
  result: ..., 
  undo?: UndoReceipt
}
```

Alternatively, the server can publish the receipt through the existing live-event channel if that better matches UI flow. The initial implementation should prefer the least coupled path.

### 19.3 Archive projection

Prefer a purpose-built `ArchiveEntry` contract over sending raw archived `ProjectSection` records to the Archive page.

---

## 20. Persistence Strategy

### Phase-one persistence

Keep existing canonical entities and markers where practical:

- `ProjectSection.archivedAt`
- row-level `archivedAt`
- `archivedWithSectionId`
- existing source IDs and referential constraints

Add undo storage separately, for example:

```ts
PrototypeDocumentSchema = z.object({
  // existing collections...
  undoRecords: z.array(UndoRecordSchema),
});
```

If undo history is intentionally session-scoped later, it could migrate out of the main PrototypeDocument. For the prototype, persistent records are the simplest durable implementation and easiest to test.

### Future archive extraction

If Archive eventually needs independent retention, metadata, permanent purge, or cross-project restore, introduce a first-class `ArchiveItem` aggregate containing a self-contained recovery bundle.

That is deliberately deferred. The architecture should make this possible without requiring it now.

---

## 21. API / Service Behavior

A section removal request should express the user's handling choice for owned content when relevant.

Conceptually:

```ts
type RemoveSectionInput = {
  sectionId: SectionId;

  ownedContent?:
    | { mode: 'cascade' }
    | { mode: 'reassign'; targetSectionId: SectionId };
};
```

The domain service then:

1. loads the section and affected content;
2. validates permissions and project/page ownership;
3. captures the before-state required for Undo;
4. performs cascade or reassignment;
5. evaluates whether meaningful recoverable content remains;
6. retains or deletes the section accordingly;
7. records ActivityEvent;
8. records UndoRecord;
9. commits atomically;
10. returns the result plus an Undo receipt.

The UI should not decide whether a section is internally archived or permanently deleted. That belongs to domain policy.

---

## 22. UI Refactor

### 22.1 Removal dialog

The removal dialog should focus on user consequences, not persistence implementation.

Examples:

For a disposable Progress view:

```text
Remove Progress?
You can add another Progress section later.

[Cancel] [Remove]
```

For a task list with tasks:

```text
Remove Sprint Tasks?

( ) Keep its tasks recoverable in Archive
( ) Move its tasks to [Backlog v]

[Cancel] [Remove]
```

Exact wording can evolve, but the UI should make data consequences explicit only when meaningful data exists.

### 22.2 Undo surface

After a successful undoable mutation:

```text
Sprint Tasks removed.  [Undo]
```

The UI receives an `undoId` or equivalent receipt and does not need to reconstruct inverse state itself.

### 22.3 Archive page

The Archive page should render recovery-oriented entries rather than raw archived entities.

Useful metadata may include:

- recognizable title;
- source project/page;
- content count;
- archived time;
- content type;
- concise restore action.

Do not show disposable Progress/Timeline/Recent Activity removals.

---

## 23. Migration Plan

### Phase 1 - Decouple Archive UI from raw archived sections

**Objective:** Fix the product semantics without changing core storage.

- Introduce `ArchiveEntry` projection/service.
- Change Archive page/store to consume the projection.
- Filter entries based on meaningful recoverable content.
- Preserve existing tombstones and cascade markers.
- Add tests proving disposable archived implementation records do not appear in Archive.

**Result:** Archive becomes low-noise immediately, even before hard deletion is introduced.

### Phase 2 - Add explicit section capabilities and contextual recovery policy

- Replace implicit assumptions with `SECTION_CAPABILITIES`.
- Keep row ownership and recoverability as separate properties.
- Implement `recoveryPolicy.evaluate(...)` or equivalent domain logic.
- Add rich-text meaningful-content handling.
- Add task-list cascade vs reassignment behavior.

**Result:** domain logic explicitly decides whether a removal preserves content.

### Phase 3 - Hard-delete disposable sections

- Use the existing permanent section removal repository seam for `recovery: 'none'` cases.
- Delete empty/non-meaningful sections where safe.
- Verify activity history does not require deleted section records.
- Verify shortcuts and references are cleaned up or invalidated according to existing integrity rules.

**Result:** internal state becomes cleaner as well as the Archive UI.

### Phase 4 - Introduce UndoRecord / UndoRecorder

Start with section operations:

- add section;
- remove section;
- move/reorder section;
- update section settings.

Requirements:

- one UndoRecord per user operation;
- written in the same UnitOfWork;
- typed/versioned inverse operations;
- permission/scope checks on undo;
- bounded retention policy can be added later.

**Result:** disposable sections can be hard-deleted while still supporting immediate Undo.

### Phase 5 - Placement-aware Undo

- Add neighbor-aware `PlacementSnapshot`.
- Restore relative to surviving neighbors where possible.
- Define fallback behavior if page/neighbor no longer exists.
- Add conflict tests for intervening moves/inserts/deletes.

### Phase 6 - Optional Redo / richer operation history

- Allow inverse execution to produce a new inverse.
- Add redo stack behavior if product demand justifies it.
- Keep ActivityEvent independent from reversible operation history.

### Phase 7 - Optional first-class ArchiveItem aggregate

Only if needed for features such as:

- independent archive retention policies;
- permanent purge;
- richer previews;
- restore into a different project/page;
- archive export;
- archive lifecycle independent of original entity IDs.

Until then, keep Archive as a projection over canonical retained state.

---

## 24. Suggested Code Organization

A likely destination structure:

```text
packages/domain/src/
  section-capabilities.ts
  section-recovery-policy.ts
  section-service.ts
  archive-service.ts
  undo-service.ts
  undo-operations.ts

packages/contracts/src/
  archive.ts
  undo.ts

packages/repositories/src/
  interfaces.ts
  // add UndoRecordRepository if persisted independently

apps/prototype-host/api/
  // remove/restore/undo route integration

apps/web/.../projects/
  archive/
    archive-page.store.ts
  undo/
    project-undo.service.ts
  sections/
    section-removal-dialog.*
```

Exact file names should follow current repository naming conventions; the key requirement is the responsibility split, not this directory layout.

---

## 25. Testing Strategy

### Domain policy tests

- Progress removal never creates a recoverable Archive entry.
- Timeline removal never creates a recoverable Archive entry.
- Recent Activity removal never creates a recoverable Archive entry.
- Empty rich text is disposable.
- Non-empty rich text is recoverable.
- Task list cascade creates recoverable content.
- Task list reassign-all leaves no Archive entry for the source list.
- Reflections recovery follows meaningful-content rules.

### Atomicity tests

- If mutation persistence fails, neither mutation nor UndoRecord commits.
- If UndoRecord persistence fails, mutation rolls back.
- ActivityEvent and UndoRecord are consistent with the committed operation.

### Undo tests

- Undo removed disposable view recreates its section/config.
- Undo removed section restores its prior page.
- Undo restores ordering relative to surviving neighbors.
- Undo task-list cascade restores the list and exactly the rows affected by the operation.
- Undo task reassignment reverses the reassignment and restores the source list.
- Undo is rejected across workspace/user scope boundaries.
- Repeating the same Undo is idempotently rejected or explicitly modeled as already consumed.

### Archive tests

- Archive is a projection of recoverable content, not all tombstones.
- Restore revives only rows associated with the archived removal.
- Archive Restore uses a deterministic fallback placement.
- Old implementation tombstones that have no meaningful recoverable content do not appear.

### UI tests

- Disposable view removal shows Undo but no Archive item.
- Content-bearing removal explains data consequence.
- Successful remove surfaces the correct Undo label.
- Archive page contains only meaningful recovery entries.

---

## 26. Acceptance Criteria

The refactor is successful when all of the following are true:

1. Removing a Progress, Timeline, or Recent Activity section does not create a visible Archive entry.
2. Those removals can still be reversed through the Undo mechanism once Undo is enabled.
3. Removing a task list with cascaded tasks creates a durable recovery path.
4. Removing a task list after reassigning all tasks does not clutter Archive with an empty source section.
5. Non-empty rich text remains recoverable despite not owning rows in a separate collection.
6. Archive page data is supplied by a recovery projection rather than directly listing all archived sections.
7. Undo and ActivityEvent remain separate concepts and storage contracts.
8. A promised UndoRecord commits atomically with its mutation.
9. Undo reverses one user operation, even when that operation touched many rows.
10. Archive Restore is allowed to choose a sensible current placement, while Undo attempts to restore historical placement.
11. Existing row referential-integrity guarantees are preserved throughout migration.
12. The design leaves a clear path to Redo without requiring event sourcing.

---

## 27. Architectural Invariants

These invariants should be documented and protected with tests:

1. **Canonical state remains repository/document state.** Activity and undo history do not become the source of truth.
2. **Archive is a product-level recovery projection.** Internal tombstones are not automatically Archive items.
3. **Recoverability is independent from row ownership.** Rich text is the canonical example.
4. **Undo is operation-level.** One user action maps to one reversible operation record.
5. **Undo participates in UnitOfWork.** A mutation and its promised inverse metadata commit or roll back together.
6. **Archive Restore and Undo have different fidelity guarantees.** Restore recovers content; Undo reconstructs the prior operation state as faithfully as possible.
7. **The domain decides retention.** The Angular UI does not decide whether a removed section is hard-deleted, tombstoned, or projected into Archive.
8. **Disposable views are safe to recreate.** They may be permanently deleted after sufficient inverse state has been recorded for Undo.
9. **Recoverable content remains attributable to its original project/workspace scope.** Restore and undo must honor current authorization rules.

---

## 28. Key Design Decision Summary

The recommended architecture is:

```text
                         SECTION REMOVAL
                               |
                    +----------+----------+
                    |                     |
             recovery policy         UndoRecorder
                    |                     |
          +---------+---------+           |
          |                   |           |
   valuable content       disposable      |
          |                   |           |
      retain/archive         delete       |
          |                   |           |
          +----------+--------+           |
                     |                    |
                 canonical state <--------+
```

Where:

- **Remove** changes the active UI.
- **Recovery policy** decides whether meaningful content needs durable retention.
- **Archive** presents only durable recoverable content.
- **UndoRecorder** preserves enough inverse state to reverse the entire user operation.
- **UnitOfWork** keeps mutation, activity history, and undo metadata atomic.
- **Tombstones** may remain as internal persistence details without automatically appearing in Archive.

This provides a flexible UX without weakening storage durability, and it avoids forcing future Undo behavior to inherit the compromises of long-term Archive restoration.

---

## 29. Relevant Existing Architecture

This refactor should build on, rather than replace, the following existing seams:

- `packages/contracts/src/section.ts` - section ownership classification, page placement fields, archive markers.
- `packages/contracts/src/task.ts` - task ownership and `archivedWithSectionId` cascade provenance.
- `packages/contracts/src/project-page.ts` - canonical project/page/section chain and page capabilities.
- `packages/contracts/src/section-shortcut.ts` - source section references and independent shortcut placement.
- `packages/domain/src/activity-service.ts` - operation-attributable audit recording inside caller-owned units of work.
- `packages/domain/src/task-service.ts` and section-related domain services - mutation orchestration.
- `packages/repositories/src/interfaces.ts` - repository and `UnitOfWork` seam.
- `packages/repositories/src/data-store.ts` - atomic clone/validate/persist/commit behavior.
- `apps/prototype-host/events/hub.ts` - commit-aware live-event buffering.
- `docs/architecture/web/projects/what.md` - ProjectWorkspace, page-store, section-frame, Archive page, and removal-dialog UI boundaries.

The intended refactor is an evolution of these boundaries, not a replacement of the repository/document architecture.
