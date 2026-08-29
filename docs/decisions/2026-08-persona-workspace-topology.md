# Persona workspace topology in seeds

**Question**

When a developer switches among Demo User, Alex, and Sam (§17), do those personas
share one workspace or own isolated workspaces, and which seeds contain them?

**Options tested**

- One shared workspace with three users: smallest fixture, but cannot expose accidental
  cross-user workspace reads and makes `ownerUserId` arbitrary.
- Only the scenario's active persona/workspace: makes each seed smaller, but persona
  switching would also have to replace the entire seed and could not test isolation.
- All three personas in every seed, each owning a separate workspace: chosen. The named
  scenario primarily populates Demo User's workspace; Alex and Sam remain valid isolated
  comparison contexts with different preferences.

**What we learned**

The existing document integrity rules already require an owner to belong to the owned
workspace, and §17 explicitly names user isolation and different preferences as reasons
for fake personas. Three separate workspaces make those behaviors observable without
adding authentication or a second persona data model. Keeping the personas present even
in `empty` also means “empty” can mean no work rather than no usable identity.

**Current decision**

Every Slice 4 seed contains Demo User, Alex, and Sam with stable ids, avatars, distinct
preferences, and separately owned workspaces. Scenario entities belong to Demo User's
workspace unless a later observed use case earns multi-persona fixture content.

**Confidence**

Medium-high. Slice 12 made switching tangible and the structure held unchanged.

**Revisit when**

*Trigger fired — Slice 12 implemented Switch Persona, and the topology needed no change.*
Switching to Alex reloaded the app, repainted the whole shell as Alex, and flipped the
theme to light from Alex's own `preferences.theme` — the isolation this entry describes,
demonstrated rather than asserted. Two properties of the topology turned out to matter more
than expected once switching was real:

- **Every seed carries all three personas.** That is what makes the persona and the seed
  independent controls — you can switch persona on any seed without the stored id going
  stale, so the panel never has to reason about which personas a seed happens to contain.
- **Scenario content living only in Demo User's workspace** is what makes Alex and Sam
  useful as *empty-account* cases at zero fixture cost. Alex's dashboard is the empty state,
  for free.

Revisit if a vertical-slice test needs realistic work in Alex's or Sam's workspace — still
unbuilt, and still not yet earned.
