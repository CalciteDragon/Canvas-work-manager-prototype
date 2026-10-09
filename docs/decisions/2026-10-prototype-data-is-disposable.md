# Prototype data is disposable until further notice; working seeds are what must survive

**Question**

Slices 25.1, 35, 36 and 63 each carried old `.prototype/data.json` files forward with a named,
frozen converter (`pnpm prototype:upgrade`). Planning Slice 66 (retiring the Sub-Projects section)
showed the cost: about half of that plan existed only to convert history that would never run
again. Every schema change also has to freeze the previous step. Is local prototype data worth
that? (§3, §14, §71, §84.)

**Options tested**

- *Keep converting every stored shape forward*: rejected (user, 2026-10-09). Each conversion adds
  logic that later work has to read around, to save data that is all for development and not
  sensitive.
- *Convert, but delete rather than retire unreachable history*: rejected. It removes one integrity
  exception but keeps the converter, which is the larger cost.
- *Treat local data as disposable and keep the seeds working*: adopted (user, 2026-10-09).

**What we learned**

What matters for exploring the product is a few realistic seeds that load and can be played with.
Nothing in a developer's data file has needed to survive a change. `.prototype/data.json` held no
Sub-Projects section at all when this was decided.

**Current decision**

Until the user says otherwise:

- A change to a stored shape or a section type updates the seed builders and regenerates
  `prototype/seeds/*.json`. It writes **no** converter, upgrade step, migration flag or
  compatibility path for existing local files.
- A local file the new build cannot read is refused with a message telling the developer to run
  `pnpm prototype:reset` or seed again. Losing that file is expected.
- Logic that exists only to preserve old local data is a candidate for deletion, not extension.
- What must keep working: every committed seed loads, passes integrity, and is usable in the app
  and over MCP.

The existing upgrade pipeline (versions 2–6) is still in the code when this entry is written.
[Slice 66](../roadmap/active/66-retire-sub-projects-section.md) plans its removal.

**Confidence**

High for the prototype: this is a statement of what the user values, and it matches §3's "time to
change an idea" and §71's disposable infrastructure.

**Revisit when**

Real or long-lived data appears, such as a user-testing round on persisted workspaces, or the user
asks for data to be kept. The MVP specification will need its own migration policy either way.

**Amended, 2026-10-09 (Slice 66).** The planned pipeline removal has landed: all old-version conversion steps, the legacy prose encoder, fixtures and conversion command are removed. Seed Activity capture survives in a seed-owned module. Unreadable local files are refused with reset/reseed guidance.
See [the retirement decision](2026-10-retiring-the-sub-projects-section.md).
