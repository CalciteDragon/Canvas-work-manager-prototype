# More is a menu with a single-commit details dialog

**Question**

How can More stay short and offer a clear commit model?

**Options tested**

Inline per-field commits, every edit in a dialog, or immediate status radios plus a details
dialog. The user approved the last option on 2026-10-16.

**What we learned**

The old panel mixed Rename, Set and immediate status actions and grew the header. The domain
already records one multi-field PATCH as one `Edited "X"` action; single-field labels stay specific.

**Current decision**

More contains Edit details, four status radios, a separator, Open archive, a separator and Archive
project/workstream. The current status emits nothing. Name, Description and Target/Due date
are one draft with one Save, sending only changed fields through the existing store and gateway.
Clean fields follow live refreshes; dirty fields retain their opening base. Blank names are
refused, unchanged Save closes without a write, and dirty dismissal asks Discard changes.
Failure retains the draft and owns one dialog error; discarding clears it. Archive uses a danger
confirm and retains header Undo. Closing returns to More; Open archive owns its landing.

**Confidence**

Approved choice, with unit/browser commit and focus checks.

**Revisit when**

Real use finds that immediate status and details Save still cause commit ambiguity.
