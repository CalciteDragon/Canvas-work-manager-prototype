# CORS on the host, not a dev-server proxy

**Question**

§10 has Angular on `:4200` calling the prototype host on `:4310`. That is cross-origin.
Angular's dev server can proxy `/api` to `:4310` and make the problem disappear. Should it?

**Options tested**

- *An Angular dev-server proxy*: rejected. It makes the browser's request same-origin, so
  the preflight, the allowed headers and the origin check are all things the prototype
  never exercises. The first time `HttpWorkManagerGateway` points at a real API, every one
  of them appears at once — and §10's whole purpose is that this swap changes an adapter
  and nothing else.
- *`Access-Control-Allow-Origin: *`*: rejected. It is one line shorter and it makes the
  host usable from any page a browser has open, which §7's "insecure local shortcut" does
  not stretch to cover.
- *A reflected allowlist of the two localhost origins*: chosen.

**What we learned**

The preflight was not a formality. `x-prototype-user` is a non-simple header, so **every**
gateway call preflights — and the host's router matches on method, with no `OPTIONS`
pattern, so `OPTIONS /api/projects` fell through to 404. Left alone, no gateway call would
have worked in a browser at all, while every unit test passed. A plan reviewer caught it
before it was written; a proxy would have hidden it until the migration.

Two consequences shaped the implementation:

- The headers are written in `createRequestHandler`'s single `writeHead`, so a 404 or 409
  carries them too. Without that, the browser hides the body of every failure and the
  gateway reports a real domain error as `unreachable`.
- The preflight is answered *before* `readBody` and `resolveRoute`, not as a route-table
  entry — the alternative is an `OPTIONS` twin for all eleven routes. It means an unknown
  path also preflights 204, which is fine for a host §71 calls disposable.

**Current decision**

CORS in `apps/prototype-host/router.ts`: origins `http://localhost:4200` and
`http://127.0.0.1:4200`, reflected only on match, with `Vary: Origin`;
methods `GET, POST, PATCH, OPTIONS`; headers `content-type, x-prototype-user`; a `Max-Age`
so the browser stops preflighting every call. No credentials, no configurability.

**Confidence**

High. `main.test.ts` covers the preflight, a disallowed origin, and the headers on both a
success and an error response, against a real server.

**Revisit when**

Slice 15 adds the MCP HTTP endpoint — a real MCP client is not a browser and needs none of
this, but it will add methods and headers, and the allowlist is where that shows up.
