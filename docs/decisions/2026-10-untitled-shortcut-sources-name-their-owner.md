# Untitled shortcut sources name their owner

**Question**

How does an untitled shortcut differ from a canvas's own untitled section? On Kitchen's Work
canvas, Garden's brief and Kitchen's local brief both read `Markdown`, including the shortcut's
Undo label (`note-2026-10-03-001`). The breadcrumb alone was too easy to miss.

**Options tested**

- *Possessive owner (`Garden's Markdown`)*: rejected because names ending in `s` require grammar.
- *Middle dot (`Markdown · Garden`)*: rejected because it reads awkwardly in history labels and
  a screen reader may skip the separator.
- *`Markdown from Garden`*: rejected because a prose description becomes a sentence fragment
  inside `Added the … shortcut`.
- *Qualify titled sources too*: rejected because a chosen title already supplies the name.
- *Qualify only collisions on the destination canvas*: rejected because adding an unrelated
  section would change the name, and write labels would need destination-canvas state.
- *Parenthesised owner (`Markdown (Garden)`)*: chosen for headings, controls and recorded labels.

**What we learned**

The owner is already available as `ResolvedSectionShortcut.sourceProjectName`. One pure contracts
helper can serve the frame, canvas and domain without a new shape or dependency. The owner is the
source's owning project, including a same-project source on another page: the seeded Home has
`Reflections (Kitchen)` beside `Reflections (Home renovation)`.

**Current decision**

Slice 69 adds `shortcutNameOf(source, ownerName)` beside section naming in contracts. A normalized
non-blank title keeps `nameOf(source)` alone. Otherwise the derived type name gains the trimmed
owner in parentheses; a null or blank owner falls back to the section name. Local sections and
picker options keep their existing names.

Frame headings and controls, canvas resize/insertion labels and move announcements use this name.
New history labels and the add's Activity summary capture it at write time. Already stored labels
and summaries remain historical. Update, move and remove Activity summaries stay generic.
Removal naming reads the source and owner with plain repository `find` calls, so archived or hidden
sources remain removable; an unreadable source retains the `a shortcut` history fallback.

An owner rename changes the frame on the next resolved read and changes labels on subsequent
placement writes. The owner-rename regression pins this consequence: one placement can have
`Added the Task List (Kitchen) shortcut` followed by `Collapsed the Task List (Prep kitchen) shortcut`,
while its original add Activity summary keeps `Kitchen`. Each captured label was true when written.
No stored name, source title, receipt shape or inverse payload changes. Spec §§27 and 54 now state
this rule.

**Confidence**

High for one shared rule and historical capture; contracts and service regressions pin title,
owner fallback, unavailable-source removal and rename behavior. The parenthesised form remains
subject to further use of the prototype.

**Revisit when**

Two untitled sections owned by the same project need distinguishing by page, a chosen title
collides with another chosen or local title, or real use finds the parenthesised owner too noisy.
The breadcrumb already identifies the page; this slice adds no page qualifier.
