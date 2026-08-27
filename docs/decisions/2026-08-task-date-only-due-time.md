# A date-only task due date is stored at UTC end-of-day

**Question**

§34 calls the interaction a due date, while §33 and the shared contract represent `dueAt`
as an ISO datetime. What instant should the temporary task drawer write for a date-only
control?

**Options tested**

- *Use `datetime-local` and expose time*: rejected for Slice 7. It makes a simple due-date
  interaction ask for precision the product has not shown it needs.
- *Write UTC midnight*: rejected because the instant visually reads as the start of the
  chosen day and makes `dueBefore` semantics surprising.
- *Write UTC end-of-day*: chosen for the prototype. `2026-09-10` becomes
  `2026-09-10T23:59:59.999Z`, and clearing the control sends `null` through the existing
  update contract.

**What we learned**

The date-only control was fast to scan and edit in the real Slice 7 task drawer. The value
survived a host write and page reload, and the row could render the intended calendar date
directly from the contract value.

UTC end-of-day is deterministic, but not yet evidence that the model is correct for people
outside UTC. The prototype currently has no workspace timezone, and pretending the browser's
local timezone is authoritative would make the same stored task mean different things to
different clients.

**Current decision**

The Slice 7 drawer accepts a calendar date and stores UTC end-of-day. It displays the first
ten ISO characters as the task's due date. No new date-only field or timezone model is added.

**Confidence**

Medium for the prototype interaction; low for an MVP data model.

**Revisit when**

Slice 18 builds the calendar, or earlier if a persona/workspace timezone is introduced. Test
whether tasks need a true date-only contract before extending the end-of-day convention.
