<!-- plan id="18" status="planned" summary="Month and agenda views derived from existing task, milestone and project dates — no duplicated event rows" -->
# Slice 18 — Calendar

## Goal

A calendar that is a *view* over dates the workspace already holds, so nothing is entered
twice.

## Spec sections

§37 (calendar), §30 (the Calendar section type), §68 (the `/calendar` route).

## Build

- Month and agenda views derived from task start dates, task due dates, milestones and
  project deadlines. Week view optional.
- The Calendar section type, the Calendar dashboard widget, and the `/calendar` route that
  today is a placeholder (`apps/web/src/app/features/calendar/calendar-page.ts`).
- A domain read that derives the calendar the way `TimelineService` derives the timeline
  (§38) — the same rule: **no duplicated event rows**.

## Done when

The `busy-week` seed renders a month whose entries agree exactly with the task list and
the timeline, and changing a task's due date on the canvas moves it on the calendar
without a second write.

## Do not

- Invent a calendar-event entity; §37 forbids duplicated rows.
- Build scheduling, drag-to-reschedule or recurring events.
- Start before observed use shows a date-oriented question the dashboard does not answer
  (§82).
