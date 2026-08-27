# Persona contract fields

**Question**

Should §17 personas use the conceptual `userId` and nested `workspace` field names, or
the canonical `User` contract's `id` and `workspaceId` fields?

**Options tested**

- Add a second persona-only shape with `userId` and `workspace`: rejected because it
  duplicates the user/workspace contracts and would need translation at every seed and
  identity boundary.
- Rename the canonical `User.id` and `User.workspaceId` fields: rejected because those
  fields already align with every other entity contract and the separate §14 workspace
  collection.
- Correct §17 to name `id` and `workspaceId`: chosen.

**What we learned**

The field list in §17 described a concept before the §11/§14 contracts were concrete.
Slice 4 made the mismatch executable: fake personas are ordinary `User` records, and
their workspaces are ordinary separately stored `Workspace` records. A persona-only
alias would violate the one-contract boundary without adding prototype behavior.

**Current decision**

Demo User, Alex, and Sam use `User.id` and `User.workspaceId`. The specification now
names those canonical fields and explains that the workspace is referenced rather than
nested.

**Confidence**

High. This removes a duplicate shape and follows the document model already validated
by seeds, repositories, and contracts.

**Revisit when**

Only if the canonical `User`/`Workspace` contract itself changes.
