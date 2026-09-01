# The web app and the host start separately

**Question**

§75 asked for one command. `pnpm dev` ran `concurrently --kill-others "pnpm dev:web"
"pnpm dev:host"`, and the host stopped starting: `[host] $ tsx watch main.ts` printed, and
then nothing — no listening line, no error, no exit. The web app came up fine and every
call to it answered `ERR_CONNECTION_REFUSED`. What actually breaks, and where should the
fix go?

**Options tested**

The host process was alive throughout — 75 MB resident, 0.4 s of CPU, flat. Blocked, not
crashed and not spinning. That ruled out the port trap this repository already knows about
(`CWM_HOST_PORT`, four notes and a decision entry), and it ruled out a missing seed or a
missing environment variable: nothing was misconfigured, and `.prototype/data.json` was
present. Bisecting on stdin:

| Command | stdin | Result |
|---|---|---|
| `pnpm dev:host` in a terminal | TTY | listens |
| `pnpm dev:host` under `concurrently` | open pipe, no data | **hangs** |
| `pnpm dev:host < /dev/null` | EOF | listens |
| `tsx main.ts` (no `watch`) | open pipe, no data | listens |
| `tsx watch main.ts` | open pipe, no data | **hangs** |

- *`--clear-screen=false`.* Rejected as a diagnosis — the output was not being swallowed by
  the watcher's screen clearing, it was never produced. Feeding the pipe a newline gets
  `[tsx] Return key Restarting...` and still no server.
- *Downgrade `tsx`.* Not available: 4.20.6 does not load at all on Node 24.19.
- *Drop `watch` from `dev:host`.* Works under `concurrently`, and costs the host its
  auto-restart on every source edit.
- *Keep `watch`, redirect stdin inside the script* (`tsx watch main.ts < NUL`). Works, and
  keeps the watcher. Rejected: `< NUL` is cmd-only and `< /dev/null` is POSIX-only, so the
  script would be correct on exactly one platform and silently wrong on the other.
- *Stop starting them together.* Adopted.

**What we learned**

The same shape as the `PORT` entry, one turn of the screw further: the cost is not the
failure, it is that the failure is silent and lands in the *other* process's symptom. A
supervisor that starts two processes also decides what their stdin is, and that is an
input the child never declared and the developer never sees. `--kill-others` made it worse
rather than better — it only fires on *exit*, so a child that hangs leaves its sibling
running and the rig looks half-alive instead of dead.

Two processes that need two terminals are not a defect worth a supervisor. The supervisor
bought one saved keystroke and cost a whole diagnosis.

**Current decision**

- `pnpm dev:web` and `pnpm dev:host`, in two terminals. Each keeps its own TTY, so
  `tsx watch` works and the host restarts on source edits again.
- `concurrently` is removed from the root `devDependencies`. It has no other use here.
- `pnpm dev` still exists and starts nothing: it prints the two commands and exits 1.
  Deleting it would answer years of `pnpm dev` in the spec, the slice records and the
  walkthrough with npm's "command not found"; this way the stale instruction routes to the
  current one. It is a signpost, not a launcher.
- The startup race is unchanged and still handled where it always was — the web app retries
  the identity call until the host answers (`PrototypeIdentityProvider` memoizes only a
  *fulfilled* identity), so the two commands can be run in either order.
- One Ctrl+C per terminal now, rather than one for both. That is the price, and it is the
  whole price.

**Confidence**

High for the diagnosis: the bisection above reproduces on demand in both directions, and
the fix was verified by running the host under `concurrently` without `watch` (listens) and
in its own terminal with `watch` (listens, and restarts).

Lower for the upstream cause. This is `tsx` 4.23.12 on Node 24.19 on Windows, and the
mechanism inside `tsx watch` — why a piped stdin stops it from ever running the child it
already spawned — was not chased past the point where the behaviour was reliably
reproducible. No upstream issue was filed.

**Revisit when**

`tsx` is next upgraded — this may simply go away, and `dev:host` would then be free to run
under a supervisor again if anyone wants one. Also if a third process ever joins the rig
(§75's one-command goal is still the nicer ergonomics); the answer then is a supervisor
that gives its children real stdio, not `concurrently`.
