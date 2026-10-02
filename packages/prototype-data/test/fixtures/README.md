# Upgrade fixtures

Frozen documents the schema converters are tested against. Never regenerate or edit one: each is the
file an operator actually had at that version, and the point of the test is that the converter still
reads it.

| Fixture | Version | Read by |
|---|---|---|
| `nested-projects-v2.json` | 2 | `upgrade-project-pages.test.ts`, `upgrade-cli.test.ts` |
| `nested-projects-v3.json` | 3 | `version-3-undo-compatibility.test.ts`, `upgrade-cli.test.ts` |
| `history-v4.json` | 4 | `upgrade-activity-identity.test.ts`, `upgrade-cli.test.ts` |
| `history-v5-rich-text.json` | 5 | `upgrade-markdown-sections.test.ts`, `upgrade-cli.test.ts` |

## `history-v5-rich-text.json` (Slice 63)

Produced once at commit `630e4ba` (schema version 5, Rich Text still registered) by a one-off script
that was not committed. It built the pre-slice `nested-projects` seed and drove the real domain
through the domain test harness, with the person `user-demo` as actor A and the agent
`agent-claude` (`projects.read`, `projects.write`) as actor B, in this order:

1. A edits `section-project-renovation-brief` to Markdown-looking prose with CRLF line endings, a
   heading, list markers, a table row, `<b>`, `&amp;` and a trailing backslash.
2. A edits `section-project-kitchen-brief` to prose with a 4-space indent, a run of blank lines, a
   quote marker, trailing spaces, a setext underline and tabs.
3. A adds the Rich Text section *Scratch* (`"Temporary\r\nnote"`), which stays live.
4. A adds an untitled whitespace-only (`"   "`) section and removes it: disposition `deleted`, so it
   survives only in the `section.add` and `section.remove` snapshots.
5. A removes *Scratch* (disposition `retained`) and restores it (`section.restore`).
6. **The orphan.** A adds *Orphan* in Garden; B edits its prose and undoes the edit; A undoes the
   add, which deletes the section; A then edits `section-project-garden-brief` to
   `{ text, extra: 'kept' }`, which discards A's undone add. B's undone `section.update` on
   `section-3` now names a section that no section, snapshot or container records.
7. A adds three Cabinets sections: *Empty* (`{}`), *Numeric* (`{ text: 5 }`) and *Blank*
   (`{ text: "  \t" }`).
8. A adds an untitled section (`"# Looks like a heading\n1. x"`) and undoes it, leaving the
   `section.add` undone on A's redo stack — a snapshot-only section.

Every config, including the malformed ones, was written through the domain; no plain-JSON edits were
made. The archived seed section `section-project-renovation-archived-notes` supplies the archived
case. See docs/decisions/2026-10-schema-version-6-markdown-conversion.md.
