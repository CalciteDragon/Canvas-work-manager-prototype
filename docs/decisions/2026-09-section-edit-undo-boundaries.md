# Explicit section edits reverse only their operation's changes

**Question**

Slice 32 extends removal Undo to add, move and settings (Refactor §§10–13, 17, 23 phase 4;
main §§27, 31–32). Which gestures count, what may an inverse change, and how does the
existing browser notice identify the newest committed action?

**Options tested**

Planning inspection of `SectionService`, `UndoService`, `UndoRecorder`, placement helpers,
the canvas handlers, Reflections-page container creation and MCP registry. No runtime
implementation or usability evidence is claimed.

- Record every internal add versus only explicit public adds. Internal container resolution
  belongs to the row operation and must keep its minimal row-write grant.
- Include duplicate versus the actions currently visible. Slice 27 removed Duplicate from
  the canvas, so its existing API behavior remains outside this extension.
- Restore whole section snapshots versus changed fields. Whole snapshots would overwrite
  unrelated work. Config is already a whole-replacement field, so per-key merging would
  invent semantics the domain does not own.
- Pick notices by response arrival/time versus committed sequence. Responses can reorder
  and the prototype clock can repeat or move backwards; the recorder already has a sequence.

**What we learned**

Rename and Rich Text already commit on blur, and resize previews have explicit commit/cancel
boundaries. Public add and private `addWithin` separate explicit creation from row container
resolution. The Reflections page's Add container button is also explicit and needs a local
receipt surface. MCP has create/update tools but no section-move tool. Removal's result always
contains a restored section, which cannot honestly describe Undo of an add.

**Current decision**

**Planning choice, 2026-09-14 — pending implementation.** The
[Slice 32 plan](../roadmap/active/32-section-edit-undo.md) defines the executable details:

- One record per changed explicit add, completed move, title/config save, collapse toggle or
  committed width change. No record for preview, cancellation, no-op, duplicate, shortcut
  action or automatic container resolution. Include explicit Reflections-page container add.
- Safe add Undo removes only the original created section, including its initial config.
  Any later substantive section change or canonical row/cascade/shortcut reference refuses;
  never cascade later authored work. Settings restore only changed fields; config remains one
  whole-replacement field. Move restores by combined section/shortcut neighbors while keeping
  all other placements in their current relative order.
- New settings/move inverses reject newer overlapping operation records even when values or
  timestamps repeat, and preserve unrelated field edits. Removal retains its conservative
  existing guarantees. New families refuse missing/archived subjects or changed/missing pages;
  disabled existing pages remain undoable. Missing-page fallback remains removal-specific.
- Keep version-3 persistence, typed version-1 inverses, exact actor, 24 hours, 50 workspace
  records and `projects.write`. Add returns a receipt; update/move return null for a no-op.
  Discriminate Undo results by operation so add Undo reports deletion without a fictional
  restored section. Add only the missing `move_section` MCP tool.
- Reuse page-local notices and the gateway executor. Receipt sequence chooses the newest
  committed action despite response reordering. Hold receipts before refresh; clear local
  state on navigation/reload; preserve removal-specific retry behavior. New writes have no
  automatic replay or generic receipt-recovery promise. Do not present Archive as an inverse
  for edits. Guard Undo during pending writes, including blur saves triggered by clicking it.

These choices do not claim any new operation is implemented. Existing removal decisions and
the main specification will receive implementation amendments only when the behavior lands.

**Confidence**

Medium. Boundaries are grounded in current code and independent plan review. Safety and
atomicity have concrete tests planned; the single-notice interaction still needs real use.

**Revisit when**

Implementation or use reveals that people need a history stack, duplicate Undo, cross-page
movement, per-key config editing, different authorization or recovery of lost create receipts.
Those are scope changes to review, not implicit additions to Slice 32.
