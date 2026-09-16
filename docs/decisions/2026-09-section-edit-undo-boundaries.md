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
[Slice 32 plan](../roadmap/completed/32-section-edit-undo.md) defines the executable details:

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

**Amended, 2026-09-14 — landed in Slice 32.** The four explicit families are now implemented
without broadening removal: `section.add`, `section.move` and `section.update` use strict
version-1 operations, while automatic row-container creation remains receipt-free. Add Undo
removes only the created section after a reference/content audit; update Undo restores only its
recorded fields; move Undo resolves the current combined section/shortcut order from its saved
neighbours. True no-ops return `undo: null`, and the public receipt adds a workspace sequence so
the browser can retain the newest committed response even when requests arrive out of order.
The same result envelopes cross HTTP, MCP and the gateway, and `move_section` is the registry's
35th tool. The canvas and Reflections page share an operation-neutral notice; Archive is offered
only for removal receipts, and pending writes block Undo. Missing or archived subjects/pages and
overlapping newer edits refuse without mutation; disjoint field edits survive. Evidence is in
the domain, host/MCP, gateway, web and Playwright suites.

**Amended, 2026-09-15 — review and browser acceptance.** Three choices the plan left open:

- *Edit refusals never name Archive.* Archive holds nothing an add, move or settings write
  changed, so edit conflicts use a new `use-later-receipt` next step ("use the later receipt,
  or make the change again by hand"), and a missing subject is `nothing-to-undo`. Removal keeps
  `use-later-receipt-or-archive`. **Narrowed, 2026-09-15:** a `superseded` conflict uses those
  two steps only when the later change is the caller's own; otherwise the receipt is another
  connection's and the step is `redo-by-hand` or `redo-by-hand-or-archive`
  ([decision](2026-09-recovery-routes-name-what-is-actually-there.md)).
- *The notice floats instead of sitting above the canvas.* With a receipt after every add, move,
  resize and blur save, the in-flow notice pushed the whole canvas down 96 px after an insert,
  which broke the existing geometry journeys and moved content under the pointer. It is now
  fixed at the viewport's end corner, below the dialogs. Rejected: keeping it in flow (the
  canvas shifts on every write), and reserving permanent space above the canvas (a gap on every
  page). Accepted cost: it can cover an end-edge resize handle or content until dismissed; the
  resize journeys dismiss it first. Revisit if real use shows people fighting it.
- *Commit order beats arrival order for Undo too.* An Undo response that lands after a newer
  write's receipt was captured reconciles the canvas but leaves the newer notice alone, and a
  committed add or move whose follow-up read fails keeps its receipt and offers Retry refresh.

**Amended, 2026-09-15 — a receipt refused for good cannot be sent again.** After a refusal, the
notice used to keep an active Undo button even when no repair could change the answer. The
browser can only know a request will be refused from a refusal it has already received, so the
rule is computed from that: a `superseded` conflict rests on a newer record that is never removed
(consumed records still count), and Undo never recreates something `missing`. For those, the
notice keeps the button visible but `aria-disabled`, says why, and both page stores refuse to send
the receipt; the server's refusal remains the authority. Every other refusal (a reference to
remove, an item to move back, an archived project, no compatible page) stays retryable.
Rejected: hiding the button (focus would drop from the control just pressed) and predicting a
refusal before the first attempt — live frames name only the project, so the browser cannot tell
that an agent touched the same section, and expiry depends on the host's simulated clock.
