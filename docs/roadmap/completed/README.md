# completed/

Frozen records of finished work, one per slice or phase. A record is what the phase
delivered and learned, kept as evidence; it is never edited into agreement with later
changes. The current state of every system lives in
[`docs/architecture/`](../../architecture/overview.md), and the board that lists these
records by closing date is [`progress.md`](../progress.md).

Each file starts with a `<!-- completed-record id="…" closed="…" summary="…" -->` marker,
then:

- **Outcome** — what now exists and works, the deliberate choices, the deviations, what
  was deferred, what was learned. For the records assembled from the old build order on
  2026-09-10 this is the status narrative `development.md` carried for the slice.
- **Slice definition** — the goal, spec sections, build list, done-when and do-not the
  slice was started with (where the build order had one).
- **Implementation plan** — the plan as executed, headings demoted one level, links
  repointed to this folder's neighbours.

If a record now misleads a reader, add a dated note directly under its banner saying what
changed and where the current truth is. Do not rewrite the record.
