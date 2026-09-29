# Below 48rem the global sidebar is a modal drawer, and a chosen link hands focus to what it opened

**Question**

At 375 px the shell's columns did not collapse (`note-2026-09-06-008`): the 15rem sidebar took
two thirds of the screen, and a project's navigation column could stay open over the canvas it
had just opened. On a Task List the details drawer formed a second 22rem track that overflowed
over the rows, so a row's Delete was unreachable until the drawer was closed
(`note-2026-09-29-004`). Slice 46 finding 11 asked for a phone layout that keeps §23's single
sidebar, §23's labelled column collapse and §34's drawer usable, with correct focus, Escape and
route behaviour (§§23, 34, 68).

**Options tested**

Built in Slice 58 and exercised at 375 × 812 by touch and keyboard, in both themes, in
`apps/e2e/phone-layout.spec.ts`, and at desktop width after a resize.

- *A bottom tab bar or a second, phone-only sidebar*: rejected before building. Two
  navigations would drift, and the sidebar's expanded group and create-form draft would not
  survive a switch.
- *The same `app-sidebar` instance as a modal drawer below one breakpoint*: kept. `AppShell`
  owns a component signal for open/closed combined with a guarded `matchMedia` signal; the
  drawer has `role="dialog"`, `aria-modal`, a label, a CDK focus trap, Close and a backdrop
  button, and the top bar and `<main>` are `inert` while it is open.
- *Returning focus to Menu after a route choice*: rejected. The chosen destination is what the
  person asked for; focus now goes to `<main>` (`tabindex="-1"`), which keeps the next Tab in
  the content they opened.
- *Closing the drawer on `NavigationEnd`*: rejected. Choosing the route already current emits
  no navigation, so the drawer would stay open. A delegated listener for a plain primary
  activation of `a[href]` inside the drawer closes it on every link, including that one.
- *A media query for the details drawer*: rejected. A Grid-layout section can be narrow at
  desktop width. The section host is a named size container, `task-list`, and both
  `task-list-section.scss` and `task-detail-drawer.scss` query it.

**What we learned**

- **Focus has to follow the render, not the state change.** In the zoneless app the Menu, the
  `inert` attributes and a reopened create form exist only after the next render. Every
  programmatic focus move runs in `afterNextRender`; a synchronous `focus()` silently does
  nothing.
- **The browser applies a media query before `matchMedia` reports it.** Hiding the closed drawer
  with a rule of the media query alone blurred a focused sidebar link before `AppShell` could
  see where focus was, so narrowing lost it. The hiding class is now bound from the narrow
  signal, so the handler reads focus first.
- **A cross-route column link destroys the column inside its own click.** `/projects/:id` and
  `/projects/:id/pages/:kind` are two route configs. The router replaces the workspace shell
  synchronously within `RouterLink`'s click handler, which removes a bubbling listener on the
  column before the click reaches it. The column reports links from a capture-phase listener,
  and the pending focus request is a root-scoped `ProjectColumnFocusRequest`, not a shell
  field, so it survives the new shell instance.
- **The failed create lost focus at every width.** The sidebar closes its form optimistically,
  removing the focused Create button. It now reopens the form and puts focus in the name input,
  which also fixes the same lost focus on desktop.
- **Menu holds focus after every dismissal.** Real use widened the window right after Escape and
  lost focus to the page, because Menu does not exist at desktop width. Widening now treats Menu
  like Close.
- **A stacked details drawer can sit below the fold.** Stacking fixes the overlap without
  changing §34's quick-create flow, but after quick create on a long list the drawer may be
  off-screen. It is not scrolled into view.

**Current decision**

- **Breakpoint.** `(max-width: 48rem)`, the canvas's existing single-column breakpoint, so a
  768 px tablet keeps the inline sidebar. `SHELL_NARROW_QUERY` in `app-shell.ts` and the
  queries in `app-shell.scss` and `top-bar.scss` carry the same literal.
- **Drawer.** Below it the sidebar leaves the grid and a labelled **Menu** (`aria-expanded`,
  `aria-controls="shell-navigation"`) opens it as a labelled modal dialog. Closed, it is hidden
  and `inert`. Above it nothing changes: no Menu, no dialog attributes, no `inert`.
- **Dismissal.** Escape inside the drawer (not a `document` Escape, which belongs to the
  development panel), Close and the backdrop close it and return focus to Menu.
- **Route choice.** A plain activation of any link in the drawer closes it and focuses `<main>`.
  Modifier and middle clicks, the Projects toggle and New project do not close it. A successful
  create closes it and focuses `<main>`; a failed create keeps it open — or reopens it, if it was
  dismissed while the write was pending — with the error, the draft and focus in the name input.
- **Resize.** Any resize resets the drawer to closed. Widening keeps focus on a sidebar link and
  moves it from Menu, Close or the dialog container, none of which exist at desktop width, to the
  first navigation item. Narrowing moves focus from the sidebar to Menu.
- **Project column.** While ≤60rem, a chosen page tab, root, breadcrumb or work link collapses
  the column again and focuses its toggle once any reload has settled and the URL — compared
  exactly, since a column link never carries a fragment — is still the one chosen; a navigation
  that lands anywhere else ends the request. If the load ends without a column, focus goes to "Project unavailable" or
  "Creation undone". A §68 fallback redirect carries the request to its target. Any other
  navigation that wins keeps its own focus. At desktop width a choice changes nothing.
- **Task details.** In a Task List narrower than 42rem (the list's working minimum plus
  `--layout-drawer-width`), the details drawer stacks below the rows and is not sticky.

**Confidence**

Medium-high for the drawer semantics and focus rules: each is pinned by component specs and by
browser evidence in both themes. Medium for the 48rem and 42rem literals: they are reasonable
defaults, not measured preferences.

**Revisit when**

A tablet-specific layout is wanted, a phone surface needs a persistent drawer preference, or
real use shows the stacked details drawer is missed below the fold, which would argue for
scrolling it into view after quick create.
