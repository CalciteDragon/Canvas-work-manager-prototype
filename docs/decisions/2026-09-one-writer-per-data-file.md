# One writer per data file: an advisory owner record, held by the host for life and by stdio per call

**Question**

The HTTP host, a stdio MCP process, and the seed, reset, upgrade and e2e-preparation commands
can all write the same canonical JSON file. Each holds its own copy of the document, so a
stdio write made while the host runs is overwritten by the host's next write (Slice 46 finding
7; the lost update the [stdio token decision](2026-08-stdio-token-and-live-auth.md) reproduced).
Until now the only protection was a sentence in the setup guide. How do the processes take turns
without production locking?

**Options tested**

- *Keep the documented rule only.* Rejected: it was the finding. A rule that depends on the
  operator remembering to stop the host fails silently, and the loss surfaces later in the file.
- *Stdio owns the file for its process lifetime.* Rejected: a long-lived client such as Claude
  Desktop would block `pnpm dev:host` whenever it is open, and `mcp-acceptance` and Slice 33's
  foreign-actor journey legitimately run two stdio processes on one file with sequential calls.
- *Stdio owns the file per call.* Adopted. Each call already reloads the document (§53), so a
  turn that owns the file from before its load until after its call sees every earlier write.
- *OS or pipe locks (`flock`, a named pipe, an exclusive handle).* Rejected: they behave
  differently on Windows and POSIX, a held handle interferes with the temp-and-rename write,
  and none says *who* holds the file, which is what an operator needs.
- *Reclaim a dead owner's record by unlinking it outright.* Rejected: two acquirers that both
  saw the same dead record could each unlink, and the slower one would delete the record the
  faster one had just published. Reclaim is guarded by a second linked file and a nonce re-check.

**What we learned**

`link()` publishes a whole record atomically, so an owner file is never partial: an unreadable
one is foreign or corrupt and is left alone. Windows reports `EPERM` or `EBUSY` for a file that
is pending deletion, so those count as "occupied". Windows also reuses pids quickly and
`child.kill()` there runs no handler, so a hard-killed owner routinely leaves a record behind.
Pid liveness decides reclaim, and the escape for a reused pid is manual: every refusal names the
file to delete.

Host shutdown has to drain the write queue before releasing. `closeAllConnections()` does not
cancel a unit of work that is mid-persist, and a release before the rename lands would hand the
file to a writer that reloads a stale document.

The MCP SDK client probes a stdio server on a disposable sibling process before starting the real
one. Stdio start-up therefore must not take ownership for its lifetime, or the sibling and the
session child would contend with each other. It only reads, unless the file is missing and has to
be seeded.

**Current decision**

- Every entrypoint that writes a canonical JSON file first publishes `<data file>.owner`
  (`pid`, `nonce`, `kind`, `acquiredAt`, `dataPath`) through `acquireDataFileOwnership` in
  `packages/repositories`. The library functions (`loadPersistence`, `writeSeedFile`,
  `upgradeDataFile`) do not acquire.
- The **HTTP host** owns its file from before the load until after a drained shutdown, and waits
  up to 5 s for another owner at start-up.
- A **stdio** call owns the file for its turn and waits up to 5 s behind another stdio call. It
  is refused at once, reads included, while a live host owns the file. Start-up only reads,
  unless it must seed a missing file.
- The **seed, reset, upgrade and e2e-preparation** commands are refused at once while anything
  else owns the file.
- A refusal starts `data_file_in_use:` and names the owner kind, pid, `acquiredAt`, a remedy and
  the owner file to delete if the pid is not a Canvas Work Manager process.
- A dead owner is reclaimed under `<owner>.reclaim`, only while the owner file still holds the
  dead record's nonce. Nothing is ever taken from a live pid, and a reclaim file left by a dead
  pid is refused, not removed.
- Stdio beside a running UI still means HTTP MCP. The owner record makes the two transports take
  turns; it does not make stdio writes appear live (§62).

**Confidence**

High. Spawned-process tests prove each refusal, the hand-over after a stop, a host waiting for a
stdio turn, two stdio processes taking turns, hard-kill reclaim, start-up failure release and the
seeding race. A unit test drives the dangerous reclaim interleaving deterministically.

**Revisit when**

A pid reused by an unrelated process becomes a real nuisance rather than a rare manual delete, or
a workflow needs stdio and the UI to mutate one file at the same time. The honest answer to the
second is still the proxy named in the [live updates decision](2026-08-live-updates-are-http-only.md),
not a lease or a lock service (§71, §80).
