# Where the project navigation column lives, and what moved with it

## Question

§23 draws a second navigation column between the global sidebar and the workspace, and §26 lists
a Project Header above it. Both are shell-shaped, and the shell already has a store. Does the
column — and the header, and Quick Add — belong to `AppShell`, or to the routed project feature?

## Options tested

Evaluated from the code during Slice 25.3, not in a browser experiment: three arrangements were
written out against `app-shell.ts`, `shell-store.ts` and the §20 rule before one was built.

1. **Column and its state in `AppShell`/`ShellStore`.** Matches §23's picture directly.
   `ShellStore` is provided by `AppShell`, so it is alive on `/app`, `/calendar`, `/search` and
   `/settings` too — teaching it to list a root's pages, resolve a sub-project's root and walk its
   ancestors makes every route pay for one route's state, and drags page contracts into
   `core/shell`. That is the mega-store §20 exists to prevent.
2. **Column in the feature, inside the workspace region's existing gutter.** No shell change at
   all, but the column is then inset from the sidebar by `--space-5` and — the part that actually
   matters — it lives inside the region that scrolls, so a long canvas takes the navigation with
   it. §23 asks for a column that *collapses* at narrow widths rather than disappearing;
   disappearing on scroll is the same failure by another route.
3. **Column in the feature, placement fixed by one shell CSS rule.** The routed component
   declares `data-flush-workspace`; `app-shell.scss` drops the region's padding when a child
   carries it, and the component pads its own tracks. No shell state, and §23's picture holds.

## What we learned

Placement and state are separable, and conflating them is what made option 1 look necessary.
`AppShell` already hands its children inputs and injects nothing into them; the only thing §23's
geometry actually needs from the shell is a gutter it does not own.

Two things followed from putting the column in the feature rather than from the choice itself:

- **The header is a property of the project, not of Home.** A root has several canvases and one
  identity. Rendering the header inside the Home renderer would have made it vanish the moment
  25.5's Todos page mounted, and would have had Slices 25.5–25.7 each re-implement it. It is
  rendered once by `ProjectWorkspaceShell`, above the column and the page alike.
- **Quick Add is a canvas control.** §26 listed it in the header while a project had one canvas.
  "Add a section" acts on *a canvas*, so it moved to the Controls row beside Edit Layout, still
  behind §32's Edit Layout Mode. §26 is amended in the same change.

The sticky column needed `min-height` rather than `height` on the shell: a container fixed to the
scrollport's height gives `position: sticky` nothing to travel through, so the rule appears to be
ignored. That cost a browser session to find and is recorded in `.prototype/notes.json`.

## Current decision

The column, the header and the project context live in `features/projects`, owned by
`ProjectWorkspaceShell` and `ProjectWorkspaceStore`. `AppShell`, `ShellStore` and `sidebar/` are
unchanged except for one `:has()` rule in `app-shell.scss` keyed on a declared attribute rather
than on a component selector, so a rename cannot silently stop matching.

§23's diagram holds: sidebar, project column, workspace, with the column flush and sticky.
§26's "Project Header / Project Navigation / Controls / Section Canvas" is read as the page's
parts rather than a strict vertical stack — the header sits at the top of the workspace track,
beside the full-height column.

## Confidence

Medium-high on the state boundary: §20 is explicit, and the alternative was measured against the
routes that would have paid for it. Medium on the geometry — the `:has()` rule is one special
case, and the cleaner arrangement (no gutter on the region at all, every routed page padding
itself) becomes worth its seven-file change the moment a second full-bleed route appears.

## Revisit when

A second route wants the full bleed; or the column needs state that outlives one project's page,
which is the first honest reason to reopen where it lives.
