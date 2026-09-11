# active/

The plan being executed right now — normally exactly one file. It arrives here through
`node scripts/roadmap.mjs start docs/roadmap/planned/<file>` and leaves through
`node scripts/roadmap.mjs complete docs/roadmap/active/<file> --summary "…"` once its
`## Outcome` is written.

While a plan is here it is the only planning document that changes: the full plan per
[AGENTS.md](../../../AGENTS.md) step 1, each review round under **Revisions**, and the
**Outcome** at the end. See [the roadmap README](../README.md).

This README is the only file that stays here between phases.
