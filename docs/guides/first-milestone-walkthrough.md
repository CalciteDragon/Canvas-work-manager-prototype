# First Prototype Milestone — walkthrough

This is what "demonstrable" means for §81. Every bullet in all eight of its groups has at
least one numbered step here, each naming the seed it needs and the result you should see.

It is written for someone who has never opened this application. If a step needs you to guess,
that is a defect in the step — record it in the development panel's note field (§79) and say
so.

Friction you notice while doing this goes in the same place. That is the point of running it.

## Before you start

```bash
pnpm install
```

Then, in two terminals:

```bash
pnpm dev:web
```

```bash
pnpm dev:host
```

The web app is at <http://localhost:4200> and the prototype host at
<http://127.0.0.1:4310>. Leave both running for everything below except
[MCP](#7-mcp), which needs a second terminal.

**Swapping seeds.** Open the development panel with **Ctrl/Cmd+Shift+D** (§46) and pick from
the **Seed** control, or go to `/prototype/state` for the same controls on a full page. A seed
swap reloads the app — deliberately, because it changes what every derived read means at once.

Seeds used below: `empty`, `personal-workspace`, `nested-projects`, `busy-week`,
`overdue-chaos`, `agent-heavy`.

---

## 1. Workspace

*Seed: `personal-workspace`.*

1. **Fake account / persona.** The top bar's right-hand side shows an avatar and **Demo
   User** — no sign-in screen ever appeared. Open the development panel and switch **Persona**
   to *Alex*: the name changes, and so does the theme, because Alex's stored preference is
   light. Switch back to Demo User.
2. **Sidebar.** The left column lists Home, Projects, Calendar, Search and Settings, with the
   workspace's projects nested under Projects. Click **Projects** — the group collapses and
   expands; it is a group header, not a link, because there is no `/projects` page.
3. **Dashboard.** Click **Home**. The centre column is the dashboard: today's date, then the
   persona's widgets. Its detail is section 6.

---

## 2. Projects

*Seeds: `empty`, then `nested-projects`.*

4. **Create a root workspace.** Switch to the `empty` seed. The sidebar reads **No projects
   yet**. Click the **+** beside *Projects*, type `Prototype review`, and press **Create**. The
   new root opens with exactly one page: required **Home**. The other page kinds are not merely
   empty tabs — they have not been enabled yet.
5. **Open the showcase.** Switch to `nested-projects` and open **Home renovation**. Its project
   column shows Home, Todos, Archive and Reflections, followed by a three-level work tree:
   **Kitchen → Cabinets**, plus **Garden**. Home contains the seven registered section kinds and
   four seeded shortcut frames, so this is the useful starting point for the rest of the pass.
6. **Manage pages.** Open **Manage pages** in the project column. Home is checked and disabled;
   Todos, Archive and Reflections are ordinary persisted toggles. Disable Todos, visit its old
   URL, and use **Enable Todos** in the Home fallback; the tab and route return only after the
   setting has been saved and fresh page context has arrived. Reload to confirm the setting.
7. **Root context on a work unit.** Open **Kitchen**, then **Cabinets**. The root's project
   column and manager remain visible, but there is no Work toggle and no `/pages/work` tab. The
   main area is the work unit's one canvas, and its breadcrumbs lead back through Home renovation
   and Kitchen.
8. **Edit work metadata.** Open **⋯** in a root or work-unit header. Set a name, description,
   status or target/due date, reload, and confirm the stored value. Archive is a deliberate
   action with confirmation; archiving Home renovation while live children remain is refused.
9. **Recover archived work.** On the showcase's **Archive** page, inspect the independently
   archived permit task and notes section, then the archived **Legacy attic**. Its live
   **Legacy shelving** descendant is listed as hidden by the archived project and cannot be
   restored first. Restore the direct rows, then restore Legacy attic with an explicit status;
   the child returns, while independently archived rows remain archived.

---

## 3. Project Canvas

*Seed: `nested-projects`; open Home renovation, then Kitchen.*

10. **Direct canvas controls.** There is no separate editing mode. Hover or keyboard-focus a
    section to reveal its move grip, resize handles and archive control; the collapse control
    and title stay available. On a touch screen, the controls remain visible without hover.
11. **Add, reorder, resize and archive.** Choose an insertion plus between sections, select a
    type and optionally name it, then create. Drag from the grip or use its arrow keys to move
    a placement. Drag a side handle to resize it, or use its keyboard controls. The archive icon
    removes a section through the existing archive flow; reload to confirm position and width.
12. **Collapse and rename.** Click the collapse control to hide a section's body while leaving
    its heading visible. Click the title to rename it; Enter or blur saves, and Escape restores
    the previous name. Following a Todos owner link can open a collapsed target for that visit,
    but it does not persist the expansion.
13. **Switch Flow/Grid mode.** Use the development panel's **project layout** control, or
    `/prototype/state`. The choice is per project: Home renovation and Kitchen can be inspected
    independently in Flow and Grid. In Grid, a half-width section sits beside its neighbour.
14. **Seven section kinds.** On both the root Home and Kitchen's work canvas, inspect Rich Text,
    Task List, Sub-Projects, Progress, Reflections, Timeline and Recent Activity. Home may also
    contain shortcuts; Todos and Archive are derived pages and hold no sections.
15. **Shortcuts are placements.** On Home, choose an insertion plus, then **Add shortcut** in
    the creation popup to choose an eligible nested Task List or a section on another root page.
    The frame identifies its source and has **Open source**; its embedded content is read-only.
    Remove the placement and confirm the source section and its rows remain unchanged.

---

## 4. Sections and aggregate pages

*Seed: `nested-projects`.*

16. **Tasks.** A **Task List** owns the task rows and quick-add field. The root Home and Kitchen
    work canvas each have their own canonical list; a shortcut never copies either list.
17. **Rich text and progress.** Rich Text shows stored prose and grows with its wrapped content.
    Progress shows the percentage and its formula explanation; its settings control exposes
    count, weighted and manual settings without changing modes.
18. **Sub-projects and timeline.** The Sub-Projects frame mirrors the work hierarchy and links
    into it. Timeline shows the project's dated records in order.
19. **Todos.** Open the root's Todos tab. It is one chronological projection across root tasks,
    nested work units and their tasks: due dates first, equal instants by kind then ID, completed
    and cancelled rows retained, and undated work last. Follow **Choose appliance finishes** to
    its canonical Kitchen Task List; the link opens the owning container rather than copying it.
20. **Reflections.** Open the root's Reflections tab. The journal combines general entries with
    entries about the completed Garden subproject and lighting task. Complete **Confirm
    renovation budget**, choose it in the completed-work picker, and add a reflection. Reopen the
    task; the reflection stays in the journal and shows its current Todo state.
21. **Archive.** The root Archive page is the recovery projection for sections, tasks,
    reflections and subprojects across the tree, including content whose page is disabled. Each
    row names its origin and says whether to restore it directly or restore an ancestor first.
22. **Reflections sections.** A Reflections section on an ordinary canvas shows its own entries;
    the Reflections page owns its dedicated container and composer. The page feed is read-only and
    links back to canonical owners.

---

## 5. Tasks

*Seed: `busy-week` for editing practice; `nested-projects` for aggregate behavior.*

23. **Create.** Type a title in a Task List quick-add field and press **Add task**. The row
    appears in its owning section.
24. **Complete.** Click a task's checkbox. It ticks and strikes through immediately, and the
    owning project's progress moves. Completing a subproject does not complete its children.
25. **Edit.** Open a task's title or **Details**, change the text, and press Enter. The new title
    survives reload; an empty title is refused with a message.
26. **Due date and priority.** In the drawer set **Due date** and then **Priority** to *high*.
    The row shows the date and priority; a past due date reads overdue.
27. **Failure path.** Set the development panel's failure rate to 100%, try a completion, and
    verify the row rolls back with the host message. Restore the rate to 0% before continuing.

---

## 6. Dashboard

*Seed: `overdue-chaos`, then `busy-week`. Click **Home**.*

28. **Today.** The **Today** widget groups overdue, due-today and in-progress tasks, each naming
    its project. On `overdue-chaos` it is full — five rows under **Overdue**. Switch to the
    `empty` seed and it says nothing is due and nothing is running; switch back before
    continuing.
29. **Upcoming.** The **Upcoming** widget lists tasks due within its horizon, which its config
    sets in days.
30. **Projects.** The **Active Projects** widget lists projects with their progress. Clicking one
    opens it.
31. **AI digest.** The **Daily Digest** widget shows the generated lines and says which provider
    produced them. Switch **AI provider** in the development panel and reload: the source
    changes.
32. **Fun fact.** The **Fun Fact** widget shows one fact. Move the date in the development panel
    and reload — the fact changes with the day, because it is keyed to the clock.
33. **The date arithmetic is real.** With `overdue-chaos`, set the development panel's date
    *backwards* to `2026-08-18`. Overdue tasks become due-today and upcoming, and the digest and
    the header date follow.

---

## 7. MCP

*Seed: `nested-projects` for the integrated browser/MCP pass, then `agent-heavy` for the
standalone connection matrix. Both processes still running. Full setup in
[docs/mcp-setup.md](mcp-setup.md).*

34. **Real MCP endpoint.** Connect a real client to `http://127.0.0.1:4310/mcp` with the header
    `Authorization: Bearer prototype-user-a-readwrite`. Cursor reads `.cursor/mcp.json`; any
    client that takes JSON MCP configuration uses the same entry. The client connects and
    negotiates protocol `2026-07-28`.
35. **Tool discovery.** Ask the client to list tools. Thirty-four come back, each with a
    description and an input schema, and each advertising the permission it needs under
    `_meta["local.canvas-work-manager/requiredPermission"]` — plus the complete list under
    `_meta["local.canvas-work-manager/requiredPermissions"]`, which differs only for a derived
    page such as `get_project_todos` (§54).
36. **Project search.** Call `search_projects` (or ask the agent to find projects). It answers
    the seed's projects.
37. **Task search.** Call `search_tasks` for a project. It answers that project's tasks.
38. **Nested task live update.** Keep the root Home or a nested work canvas open. Ask the agent
    to create a task in the canonical section, then move its due date and complete it. The row and
    progress update **without a reload**, and the newest **Recent Activity** line attributes each
    write to *Claude*.
39. **Cross-page writes.** Ask the agent to add and remove a Home shortcut, create a subject-linked
    reflection and toggle an optional page. Each write is visible through its canonical page/read;
    removing the shortcut leaves the source section and rows unchanged. Then ask it to remove a
    Home section: `remove_section` returns an Undo receipt, and `undo_operation` with its `undoId`
    puts the section back between the same neighbours; asking again is refused with a message
    starting `undo_consumed:`.
40. **Aggregate pages.** Call `get_project_todos`, `get_project_archive` and
    `get_project_journal`; the responses retain canonical project/page/container origins. Archive
    remains queryable even when its navigation page is disabled.
41. **Agent permissions.** Go to **Settings → AI & Agents**. Each connection lists its grants as
    checkboxes. Uncheck a write permission for Claude and ask the agent to create another task:
    it is refused, and the refusal **names the missing permission**. For a derived read, the
    missing grant returns an MCP error with no partial structured content. Restore it.
42. **Agent activity history.** The same page shows each connection's recent activity, and the
    dashboard's **Recent Agent Activity** widget shows it across the workspace. Revoke a
    connection and its token stops working; the seed's `prototype-user-a-revoked` token is
    always refused.

---

## 8. Prototype tools

*Any seed. Open the panel with **Ctrl/Cmd+Shift+D**, or go to `/prototype/state`.*

43. **Seeds.** The **Seed** control lists all six. Picking one replaces the host document and
    reloads the app; other open tabs refresh themselves.
44. **Fake date.** The **Date** control sets the simulated clock. Everything date-derived —
    Today, Upcoming, overdue rows, the digest, the Fun Fact — re-derives from it. **Real time**
    puts it back. §79 notes are stamped with real time regardless, deliberately.
45. **Fake latency.** The **Delay** control adds latency to every gateway call. Set it high and
    watch loading states you would otherwise never see. The **Failure rate** control beside it
    makes calls fail, which is how §63's optimistic writes and their revert-on-failure become
    visible.
46. **Persona switcher.** The **Persona** control changes who you are. The sidebar, dashboard
    widgets and theme all change with it, because they come from the persona's own record.
47. **Feature flags.** The **Flags** control lists §47's flags. Turn **nestedProjects** off on
    the `nested-projects` seed: the sidebar flattens to a single level, with **no reload**, and
    turning it back on restores the tree. Turn **gridProjectLayout** off and a grid project
    renders as flow without its stored choice being touched.
48. **Notes (§79).** The panel's note field writes to `.prototype/notes.json`. Use it while
    doing this walkthrough — that is what it is for.

---

## 9. The tools that make the next change cheap

Not §81, but this is the slice that added them.

49. **Design Lab.** Go to `/prototype/design`. Move **Radius**, **Spacing density** and
    **Elevation** and watch the catalogue *and the surrounding shell* change together. Move
    **Accent** and navigate to `/app` — the change follows you. **Surface contrast** reduces
    only, and says so. **Reset** returns every token to the stylesheet's value; a full page
    reload does the same, because the values are session-only like the theme. Switch the theme
    after a reset and the rail shows that theme's own accent.
50. **Storybook.** With the web and host processes stopped, or on its own:

    ```bash
    pnpm storybook
    ```

    `TaskRow` has six variants and `ProjectSectionFrame` six; the toolbar switches dark and
    light; the controls panel changes a story live; and *Completing*'s interaction test reports
    PASS.
51. **The end-to-end tests.** Stop the web and host processes first — the suite starts its own servers and
    refuses a port already in use.

    ```bash
    pnpm exec playwright install chromium
    ```

    ```bash
    pnpm e2e
    ```

    The integrated browser/MCP journeys and the focused aggregate journeys should be green; the
    command does not promise a clean worktree because this walkthrough and the prototype notes are
    living documentation.
