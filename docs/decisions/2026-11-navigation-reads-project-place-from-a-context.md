# The navigation tree reads project place from a context the project route publishes

**Question**

Slice 81's one navigation tree lives in the shell, on every route, but a root's pages, the current
page and the path to the current workstream are the project route's state, which the
[column decision](2026-09-where-the-project-navigation-column-lives.md) kept out of `ShellStore` on
§20 grounds. Where does the tree get them, and how do its triggers reach the project route's
lifts? (Slice 81, R2; §20, §23.)

**Options tested**

- *Move a root's pages and ancestry into `ShellStore`*: rejected. Every route would pay for one
  route's state, the reason the column decision gave, and the store would start reading pages.
- *A root-provided context of plain view data, published by the project route*: chosen.
- *Signals for the commands (an "open page settings" counter the feature watches)*: rejected. A
  re-created route shell would replay a command it never received.

**What we learned**

`/projects/:id` and `/projects/:id/pages/:kind` are two route configs, so moving between them
destroys and re-creates `ProjectWorkspaceShell`. A context the shell cleared on destroy would draw
an empty tree for a frame on every such move. So the place is **keyed, not cleared**: the new shell
replaces it, and only a `NavigationEnd` outside `/projects/` clears it. While a project loads the
context keeps the previous rows, and the tree decides from the projects read whether the loading
project is in the same root (keep them) or another (its root's row alone until its pages arrive).

The domain drops live work under an archived ancestor from the projects read, so only the place can
draw such work, or an archived current project, while it is current (Q11 (a)): the place carries the
current project and its ancestors, and the tree draws them under their real path.

With one tree, `nestedProjects` off no longer lifts workstreams to top-level rows; it hides the work
hierarchy below a root (a §77 behaviour change, Slice 81 step 4).

**Current decision**

`core/shell/navigation-context.ts` (`NavigationContext`, root-provided) holds `ProjectPlace`: the
routed project id, `loading | ready | missing`, the root, its ancestors, the current project, the
root's enabled and renderable pages without its first page (Q5 (d): the root's row opens it), the
current page kind and Add workstream's blocked reason. `ProjectWorkspaceShell` publishes it from its
store; `AppShell` passes it to the presentational `Sidebar` as an input. A failed or not-found load
publishes `missing`, which marks nothing. Commands are handlers: the feature registers
`{ openPageSettings, openAddWorkstream }` with `register()`, which returns a disposer that removes
only its own handlers (a re-created shell registers before the old one is destroyed); a trigger
calls the current handler with `{ source, returnFocus }`; with no handler the triggers are not
drawn. `core/` imports nothing from features. A default taken in Slice 81 step 4, from the accepted
plan's R2.

**Confidence**

High for keying and for handlers over signals (`navigation-context.spec.ts`,
`project-workspace-shell.spec.ts`, `sidebar.spec.ts`). Medium for the loading rule, which has met
the e2e journeys but not real use.

**Revisit when**

A second feature needs to publish place into the tree, or a production API gives the shell a way to
read a root's pages without the route.
