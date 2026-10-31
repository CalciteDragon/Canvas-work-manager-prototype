# A failure speaks product words, keeps its reason under Details, and offers Try again for a read

**Question**

TH10 found failures that showed the host's raw message (`no such project "project-…"`, a status
code, an enum), reads that failed with no way to try again, a sidebar that said "No projects yet"
while it was still loading, two alerts on Home for one outage, and a digest whose provider failure
took the whole dashboard with it (§23, §24, §63, §67; L4-001, L4-002, L4-022, L6-003). What does a
failure say, where does its reason go, and what does it offer?

**Options tested**

- *The host's message as the sentence* (slice 75's sentences ended with it): rejected. The
  message is written for developers, and it can carry record ids, paths and status codes.
- *Drop the reason entirely*: rejected for the prototype. It is what someone diagnosing a
  failure needs. It moves under a collapsed native Details beside the sentence instead.
- *A `retryable` flag on the failure*: rejected. Each caller knows its recovery (Try again, Go to
  Home, Retry refresh, Reload page), so the shape carries none.
- *Clear the failure and show the loading line while Try again runs*: rejected. The control the
  person pressed vanishes and focus falls to the document. The failure stays, busy, with its
  Try again `aria-disabled`, until the read answers.
- *Carry the digest provider's reason in the dashboard contract*: rejected. The host
  deliberately answers unhandled errors without their message, because a real provider's
  exception can carry endpoint or key details. The digest is `null` and its reason stays on the
  host's console.

**What we learned**

Moving the sidebar and Home first showed the shape is enough: one `Failure { sentence, reason }`,
built by `readFailure(error, subject)` from the error's `code`, rendered by one `FailureMessage`.
A sidebar failure that is an alert makes Home's outage two alerts; a polite status region that is
mounted before the failure arrives says it once, and Home's own failure is the page's one alert.

**Current decision**

- **One failure shape.** `Failure { sentence, reason }` in `shared/feedback/failure.ts` is the
  only translation from an error to words. A read's sentence comes from the error's code:
  `not_found` → "{Subject} isn’t available.", `unreachable` → "Couldn’t reach your workspace, so
  {subject} didn’t load.", anything else → "Couldn’t load {subject}." A write keeps slice 75's
  "Couldn’t <verb> “X”. Try again." No sentence carries a record id, enum, path or status.
- **The reason is under Details**, a closed native `<details>` beside the sentence, never named by
  a control's `aria-describedby`.
- **Try again repeats only the read that failed.** The label rule: a read that failed, or a stale
  refresh, says Try again. While it runs the failure stays on screen, busy, its Try again
  `aria-disabled` so it keeps focus.
- **Read and write failures are separate state**, so a write failure never replaces a read's and a
  failed read never clears a write's. Writes stay enabled under a read failure.
- **No false empty.** Nothing says it is empty until a read has answered with nothing: the sidebar
  says "Loading projects…" until then, and a failure suppresses the empty sentence.
- **Stale content is said politely**; a page or region that failed outright is an alert. The
  sidebar's failure is polite, so Home has one alert per outage.
- **The digest fails alone.** A `null` digest renders "Couldn’t write today’s digest." in the
  widget's place, with Try again and no Details; the other widgets stay. Its Try again is a quiet
  re-read. The provider's reason stays on the host's console.

Slice 78 applies this surface by surface; its plan records which have moved.

**Confidence**

Medium-high. The sentences and the Details placement were settled with the user on 2026-10-29;
the polite sidebar and the busy-not-cleared retry come from building it and are worth watching in
real use.

**Revisit when**

The MVP is specified: **Details should be hidden in production** (the user's note, 2026-10-29).
The prototype keeps it for diagnosis, and nothing changes now. Also revisit if a surface needs a
recovery `Failure` cannot express without a flag.

Related: [the dashboard splits layout from content](2026-08-dashboard-layout-and-content-split.md)
(the single read is why any other failure still fails Home whole) and
[feedback stays on the object](2026-10-feedback-stays-on-the-object.md) (whose write sentences
this keeps, with the reason moved under Details).

**Amended, 2026-10-30 — Slice 78 (user decisions).** Three answers from the acceptance sheet:
- A project that fails to load, other than `not_found`, has a visible h1, "Couldn’t load this
  project", that route focus lands on. The sentence beneath says only what the heading does not
  ("Something went wrong while it was loading.", or "Couldn’t reach your workspace.").
- On touch the toast's height cap rises from 12rem to 16rem, so a failed write's "Try again." is
  not clipped under its 44 px actions and Details row.
- A field a failure describes has a visible label in the control-label style, never an
  `aria-label` alone: the Reflections composer's body is labelled "Reflection".

**Amended, 2026-10-30 — Slice 78 review.** `failure.ts` stays the only place an error is read:
`failureCode` hands a code to a caller that words its own sentence by it (Archive's and Settings'
refused restore, "Couldn’t reach your workspace, so “X” may not have been restored."). The spec
is corrected in place to match this entry: §21, §23, §24, §34, §44, §63 and §68 each carry a
*Slice 78* paragraph.
