# What an `Identity` is, and where it comes from

**Question**

§18 requires `IdentityProvider { getCurrentIdentity(): Promise<Identity> }`. It names no
shape for `Identity`, `packages/contracts` has no such type, and §61's route list has no
endpoint that would serve one. So what is it, and who provides it?

**Options tested**

- *`Identity = User`*: rejected. `CreateProjectInputSchema` requires a `workspaceId`, so
  the UI needs the workspace too, and deriving it by a second call would let the two drift.
- *An `Identity` type local to `apps/web`*: rejected outright — §11 and AGENTS §1 allow one
  definition of any shape, in `packages/contracts`.
- *A tenth `identities` collection in §14's document*: rejected. An identity is not stored;
  it is the answer to "who is this request", computed per request.
- *`Identity = { user, workspace }` in contracts, served by a new `GET /api/me`*: chosen.

**What we learned**

The workspace being part of the identity is not a convenience, it is the security-shaped
part of the design surviving into the UI: `resolveActor` on the host derives the workspace
from the *resolved user*, never from the request, so a caller cannot address another
persona's workspace by asking for it. Serving `{ user, workspace }` together keeps that
property visible instead of letting the client assemble a workspace id from somewhere else.

Making it a route also gave the persona header a single source. The gateway takes
`x-prototype-user` from `(await getCurrentIdentity()).user.id` rather than reading
`localStorage` itself, so when the provider heals a stale persona (see below) every later
call heals with it.

**Current decision**

`IdentitySchema = { user: User, workspace: Workspace }` in `packages/contracts/src/user.ts`,
documented as a response composite. `GET /api/me` on the host serves it, reusing
`resolveUser` — the same lookup and the same unknown-persona 404 as every other route.
A test asserts `PrototypeDocumentSchema` has no `identities` key, so the "never stored"
half is enforced rather than asserted in prose.

**Confidence**

High. It is two existing schemas composed; nothing here is a new idea.

**Revisit when**

*Half the trigger fired — Slice 12's panel added persona switching, and the contract needed
no change.* The panel writes the storage key the provider already read and reloads; the
`{ user, workspace }` composite was enough, and `GET /api/me` gained nothing. One thing the
switcher did expose: the provider **memoizes a fulfilled identity for the page's lifetime**,
so a persona change is only visible after a reload. That is a property of the provider, not
of this contract, and it is why the panel reloads
([entry](2026-08-development-panel-surface.md)).

The other half is still ahead: Slice 13 gives an *agent* an identity — a workspace and no
`User` — which remains the first thing that will genuinely push on this shape.
