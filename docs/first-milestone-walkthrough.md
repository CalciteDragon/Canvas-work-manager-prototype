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

```bash
pnpm dev
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

4. **Create project.** Switch to the `empty` seed. The sidebar reads **No projects yet**. Wait
   for the persona's name to appear in the top bar, then click the **+** beside *Projects*,
   type `Prototype review`, and press **Create**. You land on the new project's page, its name
   in the header, and it appears in the sidebar. It has status *planning*, no sections, and no
   target date — everything but the name took a contract default.
5. **Open project.** Switch to `nested-projects`. Click any project in the sidebar. The centre
   column becomes that project's page: icon, name, status, progress, target date, and its
   section canvas below.
6. **Nested project.** Still on `nested-projects`: *Home renovation* has *Kitchen* and *Garden*
   under it, and *Cabinets* under *Kitchen* — three levels, expanded inline in the sidebar. Open
   *Home renovation* and its **Sub-Projects** section lists the same children with their
   progress.
7. **Edit project.** On any project page, click **⋯** in the header. The menu offers Name,
   Status, Target date and Archive.
   - Type a new name and press **Rename**. The header changes immediately; reload the page and
     it is still there.
   - Open **⋯** again and click a different **Status**. The header's Status fact updates.
   - Open **⋯**, pick a date, press **Set** — the header shows it. Open **⋯** once more and
     press **Clear**: the header reads **No target date**.
8. **Archive project.** On the project you just created (or any leaf project), open **⋯** and
   click **Archive project**. A confirmation appears. Press **Cancel** — nothing happens and you
   stay put. Open it again and press **Archive it**: the project leaves the sidebar and you land
   on the dashboard. On `nested-projects`, try archiving *Home renovation* while its children
   are active: it refuses, and the header shows the domain's own reason naming the active
   sub-projects.

---

## 3. Project Canvas

*Seed: `personal-workspace`. Open any project.*

9. **Edit Layout Mode.** Below the header, press **Edit layout**. The button becomes *Finish
   editing layout*, and each section grows a drag handle and its layout controls.
10. **Add section.** Press **Quick add** and choose a type — *Rich Text*, say. It appears at
    the bottom of the canvas.
11. **Reorder section.** Drag a section by its **⠿** handle above another. The order persists —
    reload and it is unchanged.
12. **Collapse section.** Click a section's collapse control. Its body hides and its header
    stays. This works outside Edit Layout Mode too.
13. **Change section size.** In Edit Layout Mode, use a section's size control to pick 6. It
    becomes half the canvas width.
14. **Remove section.** In Edit Layout Mode, press a section's remove control. It disappears
    and the remaining sections close the gap.
15. **Switch Flow/Grid mode.** The layout is per project. Open the development panel and use the
    **project layout** control (it appears while a project page is open), or set it at
    `/prototype/state`. In *Grid*, the sections lay out on a 12-column grid and a half-width
    section sits beside its neighbour rather than under it.

---

## 4. Sections

*Seed: `personal-workspace` for the first five; `agent-heavy` for the sixth.*

16. **Tasks.** Open a project with a **Task List** section. It lists the project's tasks with a
    quick-add field above them.
17. **Rich text.** A **Rich Text** section shows its stored text and, in Edit Layout Mode, lets
    you edit and save it.
18. **Sub-projects.** On `nested-projects`, *Home renovation*'s **Sub-Projects** section lists
    its children with their own progress. Clicking one navigates to it.
19. **Progress.** A **Progress** section shows the project's percentage and the sentence
    explaining it. In Edit Layout Mode, its settings offer §39's three formulas — switch between
    *count*, *weighted* and *manual* and watch both the section and the header's Progress fact
    change together.
20. **Reflections.** A **Reflections** section lists entries and lets you add one.
21. **Timeline.** A **Timeline** section shows the project's dated items in order.

---

## 5. Tasks

*Seed: `busy-week`. Open a project with a Task List section.*

22. **Create.** Type a title in the quick-add field and press **Add task**. The row appears at
    the bottom of the list.
23. **Complete.** Click a task's checkbox. It ticks and strikes through immediately, and the
    project's progress moves.
24. **Edit.** Click a task's title, change the text, and press Enter. The new title is there
    after a reload. An empty title is refused with a message rather than silently ignored.
25. **Due date.** Click **Details** on a task to open the drawer, then set **Due date**. The row
    shows the date; if it is in the past the row turns overdue.
26. **Priority.** In the same drawer, change **Priority** to *high*. The row's priority label
    updates.

---

## 6. Dashboard

*Seed: `overdue-chaos`, then `busy-week`. Click **Home**.*

27. **Today.** The **Today** widget groups overdue, due-today and in-progress tasks, each naming
    its project. On `overdue-chaos` it is full — five rows under **Overdue**. Switch to the
    `empty` seed and it says nothing is due and nothing is running; switch back before
    continuing.
28. **Upcoming.** The **Upcoming** widget lists tasks due within its horizon, which its config
    sets in days.
29. **Projects.** The **Active Projects** widget lists projects with their progress. Clicking one
    opens it.
30. **AI digest.** The **Daily Digest** widget shows the generated lines and says which provider
    produced them. Switch **AI provider** in the development panel and reload: the source
    changes.
31. **Fun fact.** The **Fun Fact** widget shows one fact. Move the date in the development panel
    and reload — the fact changes with the day, because it is keyed to the clock.
32. **The date arithmetic is real.** With `overdue-chaos`, set the development panel's date
    *backwards* to `2026-08-18`. Overdue tasks become due-today and upcoming, and the digest and
    the header date follow.

---

## 7. MCP

*Seed: `agent-heavy`. `pnpm dev` still running. Full setup in
[docs/mcp-setup.md](mcp-setup.md).*

33. **Real MCP endpoint.** Connect a real client to `http://127.0.0.1:4310/mcp` with the header
    `Authorization: Bearer prototype-user-a-readwrite`. Cursor reads `.cursor/mcp.json`; any
    client that takes JSON MCP configuration uses the same entry. The client connects and
    negotiates protocol `2026-07-28`.
34. **Tool discovery.** Ask the client to list tools. Fourteen come back, each with a
    description and an input schema, and each advertising the permission it needs under
    `_meta["local.canvas-work-manager/requiredPermission"]`.
35. **Project search.** Call `search_projects` (or ask the agent to find projects). It answers
    the seed's projects.
36. **Task search.** Call `search_tasks` for a project. It answers that project's tasks.
37. **Task creation — and §62's live update.** Open `project-work-manager` in the browser and
    leave it visible. Ask the agent to create a task in it. The row appears in the open page
    **without a reload**, and the **Recent Activity** section's newest line attributes it to
    *Claude*.
38. **Task update.** Ask the agent to change that task's priority or due date. The row updates in
    place, again with no reload.
39. **Task completion.** Ask the agent to complete it. The row ticks, the project's progress
    moves, and the activity line says *Claude — Completed …*.
40. **Agent permissions.** Go to **Settings → AI & Agents**. Each connection lists its grants as
    checkboxes. Uncheck a write permission for Claude and ask the agent to create another task:
    it is refused, and the refusal **names the missing permission**. Restore it.
41. **Agent activity history.** The same page shows each connection's recent activity, and the
    dashboard's **Recent Agent Activity** widget shows it across the workspace. Revoke a
    connection and its token stops working; the seed's `prototype-user-a-revoked` token is
    always refused.

---

## 8. Prototype tools

*Any seed. Open the panel with **Ctrl/Cmd+Shift+D**, or go to `/prototype/state`.*

42. **Seeds.** The **Seed** control lists all six. Picking one replaces the host document and
    reloads the app; other open tabs refresh themselves.
43. **Fake date.** The **Date** control sets the simulated clock. Everything date-derived —
    Today, Upcoming, overdue rows, the digest, the Fun Fact — re-derives from it. **Real time**
    puts it back. §79 notes are stamped with real time regardless, deliberately.
44. **Fake latency.** The **Delay** control adds latency to every gateway call. Set it high and
    watch loading states you would otherwise never see. The **Failure rate** control beside it
    makes calls fail, which is how §63's optimistic writes and their revert-on-failure become
    visible.
45. **Persona switcher.** The **Persona** control changes who you are. The sidebar, dashboard
    widgets and theme all change with it, because they come from the persona's own record.
46. **Feature flags.** The **Flags** control lists §47's flags. Turn **nestedProjects** off on
    the `nested-projects` seed: the sidebar flattens to a single level, with **no reload**, and
    turning it back on restores the tree. Turn **gridProjectLayout** off and a grid project
    renders as flow without its stored choice being touched.
47. **Notes (§79).** The panel's note field writes to `.prototype/notes.json`. Use it while
    doing this walkthrough — that is what it is for.

---

## 9. The tools that make the next change cheap

Not §81, but this is the slice that added them.

48. **Design Lab.** Go to `/prototype/design`. Move **Radius**, **Spacing density** and
    **Elevation** and watch the catalogue *and the surrounding shell* change together. Move
    **Accent** and navigate to `/app` — the change follows you. **Surface contrast** reduces
    only, and says so. **Reset** returns every token to the stylesheet's value; a full page
    reload does the same, because the values are session-only like the theme. Switch the theme
    after a reset and the rail shows that theme's own accent.
49. **Storybook.** With `pnpm dev` stopped or on its own:

    ```bash
    pnpm storybook
    ```

    `TaskRow` has six variants and `ProjectSectionFrame` six; the toolbar switches dark and
    light; the controls panel changes a story live; and *Completing*'s interaction test reports
    PASS.
50. **The end-to-end tests.** Stop `pnpm dev` first — the suite starts its own servers and
    refuses a port already in use.

    ```bash
    pnpm exec playwright install chromium
    ```

    ```bash
    pnpm e2e
    ```

    Two tests, both green, and `git status` clean afterwards.
