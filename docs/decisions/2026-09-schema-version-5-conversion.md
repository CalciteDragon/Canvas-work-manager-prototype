# Schema version 5 backfills durable Activity identity without changing history

**Question**

Slice 36 makes `ActivityEvent.context` required. Should version-4 files be accepted with a default,
reset, or pass through an explicit version-4 to version-5 conversion?

**Options tested**

- *Default a missing context while parsing*: rejected. There is no truthful default label or
  owning project, and the document would no longer reveal that it needs conversion.
- *Reset version-4 files*: rejected. They may contain meaningful operation histories that the new
  field does not invalidate.
- *Backfill from each still-canonical target*: adopted, with refusal when no truthful identity can
  be derived.

**What we learned**

An unconverted version-4 file fails the current schema as soon as context becomes required, so the
version-4 decision's suggestion that Stage B could avoid another converter does not hold. Existing
version-4 events were written while their targets were required to exist, which makes a bounded
backfill possible. A missing target or cross-workspace project is evidence of corrupt hand-edited
data, not permission to invent an audit identity.

**Current decision**

`SCHEMA_VERSION` is 5. `upgradeActivityIdentity` reads version 4, derives every event's target label,
owning project and root from canonical records, validates the complete result and writes version 5.
It refuses a missing target, invalid scope or false project association and leaves the source file
untouched.

The CLI now chains the frozen 2 → 3 and 3 → 4 steps before 4 → 5 as needed. Version-4 operation
histories and actions — ids, states, order, cursor, revision, expiry and payloads — pass through
unchanged. A valid version-5 file is a validated no-op; successful conversion still backs up the
untouched original and replaces atomically.

**Confidence**

High. Committed v2, v3 and v4 fixtures exercise the full CLI chain and reopen under the current
store; corrupt v4 events prove the no-write failure paths.

**Revisit when**

Another required persisted field needs a fourth named conversion, or retained real-world files
show a legacy event target that version 4 legitimately allowed to be absent.
