# planned/

Candidate slices that have not started. Each is the short form of
[the plan template](../../templates/implementation-plan.md) — goal, spec sections, a sketch
of the build, done-when, do-not — and nothing more. They are **candidates, not
commitments**: §82 says to build them only when observed use justifies them, and
[`goals.md`](../goals.md) says which signals would.

A candidate starts with `node scripts/roadmap.mjs start docs/roadmap/planned/<file>`,
which moves it to `active/` where the full plan is written. Create a new one with
`node scripts/roadmap.mjs new <id> <slug> --title "…" --summary "…"`.

The seven files here are §82's candidate list as the original build order staged it
(Slices 18–24). Their numbers are reserved; their order on the board is numeric and says
nothing about priority.
