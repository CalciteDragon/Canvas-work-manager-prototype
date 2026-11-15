# Titles name the place most specific first, the h1 names the current page, and a skip link leads into main

**Question**

Every route's title was "Canvas Work Manager" (L7-019); keyboard users tabbed through the top bar
and the whole tree before reaching content (L5-014, W3-001); the dashboard drew a second `main`
inside the shell's (L5-011); and a root's Todos, Archive and Reflections were named only by the
highlighted navigation item, under an `h1` that said the project's name, with Todos adding "What is
coming up" and Archive a nested "Archive" region (L7-018, L5-015). §26 said the header "describes
the project, not the page". (Slice 81, Q6; §23, §26.)

**Options tested**

- *Title (a) "Todos · Home renovation · Canvas Work Manager"*, most specific first: chosen (user
  decision, 2026-11-10). *(b) "Home renovation – Todos | Canvas Work Manager"*: rejected; the tab's
  first words would be the same on every page of a root.
- *Heading (i): the `h1` names the current item*: chosen. *(ii) the `h1` stays the project and the
  page name becomes an `h2`*: rejected; the heading would not agree with the current item.

**What we learned**

The project names arrive after the async load, so a router `TitleStrategy` alone cannot title a
project route: it would title the URL, not the project. The strategy keeps the route's words and
an effect rebuilds a project route's title whenever the navigation context publishes a ready place
for that project, which also follows a live rename. A `TitleStrategy` that injected the context
eagerly is a dependency cycle (the context injects `Router`, which injects the strategy), so it
reads the context lazily. Once the header's `h1` names the page, the pages' own headings and the
Archive list's region were duplicates and went; Reflections' compose, picker and journal headings
became `h2`s so the outline does not skip a level.

**Current decision**

- `core/shell/document-title.ts` (`DocumentTitle`, provided as `TitleStrategy` in `app.config.ts`).
  Static routes carry `title` in `app.routes.ts` ("Home", "Calendar", "Search", "Settings",
  "AI & Agents · Settings", "Archived projects · Settings", "Design Lab", "Prototype state",
  "Page not found"), each followed by " · Canvas Work Manager". A project route: a root's first page
  is "<root>", its other pages "<page> · <root>", a workstream "<workstream> · <root>", a failed or
  not-found load "Project not available". While a project loads the previous title stays.
- `AppShell`'s first focusable element is "Skip to content" (`data-skip-link`), visually hidden
  until focused; it focuses `main#main-content` without the fragment reaching the router.
- The dashboard is a `section` labelled by its `h1`; the shell's workspace is the one `main`.
- `ProjectHeader`'s `h1` (`data-page-heading`, always the route's landing) shows `heading` when the
  shell passes one: the page's label on a root's non-first page; otherwise the project's name, and
  only then does it carry `data-project-name`. Todos, Archive and Reflections draw no heading of
  their own; the Archive list is not a region. §26 is corrected.

**Confidence**

High for the format and the headings (user decision; `document-title.spec.ts`, the header and
shell specs). Medium for keeping the previous title while a project loads, which has not met real
use.

**Revisit when**

A screen-reader pass finds the page-name `h1` without the project's name too terse, or a page needs
a heading of its own below the header.
