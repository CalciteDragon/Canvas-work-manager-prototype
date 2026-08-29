# The host's port variable is `CWM_HOST_PORT`, not `PORT`

**Question**

`pnpm dev` starts Angular and the prototype host as two children of one environment (§75).
Both honoured `PORT`. Which process does `PORT` mean?

**Options tested**

- *`PORT` means the host* (what the code did). It cost time on **four** separate occasions —
  `.prototype/notes.json` has an entry for each, from Slice 12 through Slice 13's own browser
  verification. Anything that exported `PORT=4200` for `ng serve` — an editor launch config,
  a preview harness, a shell profile — handed the *host* the web port. `concurrently` starts
  both, the host wins the bind, Angular quietly moves elsewhere, and every page load answers
  `{"error":"not_found"}` **in the host's own words**, which reads like a routing bug in the
  Angular app. Both processes report success the whole time.
- *Remove the override entirely.* Rejected: the acceptance scripts genuinely need a second
  host on a different port beside a live `pnpm dev`.
- *Keep `PORT` but have `dev:host` pass its own value.* Rejected: it fixes `pnpm dev` and
  leaves every other invocation — a bare `pnpm --filter @cwm/prototype-host start`, a script,
  a debugger — still holding the loaded gun.
- *Give the host its own variable and ignore `PORT`.* Adopted.

**What we learned**

A variable name shared by two processes started together is not a knob, it is a trap — and
the diagnosis cost is what makes it expensive rather than the failure itself. The symptom
appears in the *other* process's URL, in the *wrong* process's vocabulary, with no error
anywhere. Four separate people-hours went into rediscovering the same thing, which is three
more than the fix.

The second, quieter half: `configuredPort` used to fall back to 4310 for **any**
unparseable value. That is the same failure shape — the host comes up somewhere you did not
ask for and says nothing about it — so a typo in the new variable now fails the start.

**Current decision**

- The host reads **`CWM_HOST_PORT`** and **ignores `PORT` entirely**. Ignoring it is the
  point; honouring it as a fallback would preserve the bug.
- The name matches the existing `CWM_DATA_FILE`, so the host's two environment inputs are
  spelled the same way.
- An explicitly-set but unusable value (`''`, `not-a-port`, `70000`, `-1`, `43.5`) **throws**
  with a message naming the variable, rather than silently defaulting. Unset still defaults
  to 4310.
- Both acceptance scripts set `CWM_HOST_PORT`. `main.ts` resolves the port once, before its
  `try`, because the failure message used to call `configuredPort()` a second time — which
  would now throw inside its own catch and swallow the explanation.
- Five tests pin it, including the one that matters: *"ignores PORT completely, even when it
  is the only thing set"*.

**Confidence**

High. The trap is removed rather than documented around, and `pnpm dev` was re-verified in
the browser with `PORT=4200` still set in the environment.

**Revisit when**

Slice 15 adds the MCP endpoint on the same host. If a client ever needs the host somewhere
other than 4310, this is the variable it will use — and `docs/mcp-setup.md` should name it
rather than `PORT`.
