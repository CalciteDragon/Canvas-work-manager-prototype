# Section removal is one cascade gesture, and task Delete is reversible

**Question**

Should removing a task or reflection container ask the person to choose what happens to live
rows, or should the existing cascade happen in one action? How should task archiving read in the
canvas and the root Todos projection? The former prompt was exposed on every non-empty removal,
and §34 describes a reversible archive operation rather than a hard-delete action.

**Options tested**

- *Keep the policy and destination prompt*: preserve a removal-time reassign branch for new
  requests. Rejected because it duplicates task movement and turns a routine remove into a second
  decision; callers must also reason about independently archived descendants and destinations.
- *Use one cascade for live owned rows*: remove the section and archive its live rows with it in a
  single receipt. Kept; tasks can still move independently through their own update operation.
- *Make task Delete a hard purge*: remove task records. Rejected because Archive Restore and Undo
  already provide the reversible behavior §34 expects.

**What we learned**

The cascade's `archivedWithSectionId` marker already makes the section and its live rows one
reversible operation. Rows archived before section removal need to keep their existing markers and
separate restore step. New task moves already have a typed `task.update` receipt and do not need a
removal-specific move variant. The stored version-1 removal union has real schema-v5 histories
using `reassign`, so retiring the request shape does not justify rewriting data or bumping schema.

**Current decision**

`remove_section` accepts only `sectionId`; HTTP rejects any query fields, and the shared MCP
contract rejects `policy` and `reassignToSectionId`. One successful removal archives every live
task or reflection still owned by its section, stamps the rows with that section id, and leaves
independently archived rows untouched. Undo, Redo and Archive Restore keep their current exact
footprints. Ordinary task movement uses `update_task`/`TaskService.update` and remains independently
undoable.

Task List and Todos task rows label their icon-only soft-archive action **Delete**, including for
finished tasks. Delete uses the existing task archive write and keeps its task and descendant
recovery behavior; there is no hard-delete task action. New requests no longer produce reassign
actions, but stored version-1 reassign actions remain parseable and executable. Schema version 5
does not change.

**Confidence**

High on the recovery semantics: the existing cascade marker and history executor define the exact
footprint, and contract, domain and transport tests cover the boundary. Medium on the Delete label's
fit in both row surfaces; revisit after using it in the integrated prototype.

**Revisit when**

Real use shows that moving a task as part of removing its container is a common, distinct intention
that ordinary task movement cannot make clear, or people mistake reversible **Delete** for a
permanent purge. Any reconsideration must preserve exact-actor history and Archive recovery.
