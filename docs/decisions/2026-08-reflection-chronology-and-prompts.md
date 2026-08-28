# Reflections use reverse chronology and optional prompts

**Question**

What is the smallest §36 reflection interaction that feels useful without becoming a form?

**Options tested**

- Required title and prompt: rejected as too much ceremony for a journal entry.
- Freeform body only: fast, but gives no support when a person does not know what to write.
- Required prompt: rejected because not every reflection fits the supplied questions.

**What we learned**

The seeded history and real-app entry flow remain scannable with body-only entries, optional
titles, and an optional prompt. Newest-first order makes the section feel current; preserving
created time while showing an updated time keeps edits honest.

**Current decision**

Body is required. Title and prompt are optional. The four §36 prompts are suggestions, not
categories. Entries list newest first; editing preserves `createdAt`, advances `updatedAt`
through the injected clock, and records normal activity.

**Confidence**

Medium-high for the first milestone.

**Revisit when**

User testing asks for prompt customization, filtering, or a different chronology.
