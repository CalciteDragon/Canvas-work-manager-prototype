# Focus after a successful Try again goes to the recovered region's heading

**Question**

Real use of Slice 78 (S6USE, 2026-11-01) found that a keyboard user who pressed Try again on
Home's failure, or the sidebar's, lost focus when the read succeeded. The failure message and its
button left the page, focus fell to `<body>`, and the next Tab started again from the top. The plan
settled focus while the failure stays (Try again keeps focus, busy) but not after recovery
(Slice 78, Open question 11; §21, §24).

**Options tested**

- *Leave it*: focus falls to the top of the page after every recovered read. Rejected.
- *The recovered region's heading, or its container with `tabindex="-1"`*: chosen.
- *The region's first interactive item*: rejected. It differs per region, and it skips the
  heading that names what came back.

**What we learned**

The failure messages sit in about twenty places, and most have a heading just before them: the
page heading, a section's or a widget's title. One rule in `FailureMessage` covers them all. Each
region only marks its heading. Settings › Archived projects already hands focus on to the next
row's status, so it marks nothing and keeps its own rule.

**Current decision**

The user chose the heading on 2026-11-01. When a `FailureMessage` leaves while its pressed Try
again (or Retry refresh) still held focus, and focus is now lost, focus moves to the nearest
`data-recovery-focus` element before the message in its landmark (`main`, `nav` or a dialog). If
none precedes it, focus moves to the first one the landmark shows after recovery, such as a
recovered project's name. Marked headings carry `tabindex="-1"`. The sidebar marks its Projects
button, which is the group's heading. Focus the person moved elsewhere during the read stays there.
Nothing visual changes.

**Confidence**

High for Home, the sidebar, sections and widgets: unit specs and `states.spec.ts` cover them.
Medium for the rarer regions (Reflections' three reads, the shortcut picker), which follow the same
rule but have no journey of their own.

**Revisit when**

A region recovers into content with no heading before it, or a screen-reader pass finds that
landing on the heading repeats what the recovery already announced.
