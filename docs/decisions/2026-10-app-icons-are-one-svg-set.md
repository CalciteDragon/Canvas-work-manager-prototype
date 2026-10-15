# App-owned icons are one monochrome SVG set; user emoji stay content

**Question**

The app mixes three icon families: colour emoji in the registries (page kinds, section types,
dashboard widgets, activity actors), the monochrome SVG marks in `Icon`, and text glyphs
(`+ ⋯ ✓ × ↗`). The Archive page and a user's Cabinets workstream show the same emoji, and the Task
List type icon looks like a completed checkbox. These are findings L2-013, W1-012 and W4-009 in
the UI/UX overhaul ([themes](../roadmap/70-ui-ux/themes.json), TH04).

**Options tested**

- *One monochrome SVG set for everything the app owns*, with user-chosen project and workstream
  emoji kept as content. This closes all three findings and removes platform-dependent colour from
  chrome. **Kept.**
- *Keep the emoji and fix only the three collisions.* This leaves L2-013 open, and colour emoji
  that ignore the theme stay in chrome.

**What we learned**

The page marks are already `aria-hidden` spans, so swapping them for SVG changes no accessible
name. The `'📁'` and `'🧩'` fallbacks in the project header, project navigation, project work
items and four dashboard widgets stand in for a missing *user* icon. They fill the content slot,
not a chrome slot.

**Current decision**

The page, section and widget registries and the activity actors name an `IconName`. `Icon`
renders every mark as a decorative SVG, and the owning control supplies the accessible name. The
text glyphs `+ ⋯ ✓ × ↗` become marks. `Project.icon` stays a string in the contract. User emoji,
and the `📁`/`🧩` fallbacks in their slot, stay as they are. The user chose this at slice 72
planning (2026-10-14).

**Confidence**

Medium. It was chosen from the findings. The marks themselves, including the three removal marks,
are reviewed at slice 72's checkpoint, and this entry is amended if they change.

**Revisit when**

Users can pick icons from the app's own set, or the content emoji are themselves found to clash
in a fresh comb.

**Amendment (2026-10-15, slice 72 checkpoint).** The user reviewed the Lab Controls panel in both
themes at 1440 and at 375 on touch, and kept the three removal marks as shown: removing a section
is a danger tool with the remove-section mark, deleting a task a quiet trash tool, and removing a
shortcut a neutral unlink tool. No mark changed. Confidence in the marks is now high.
