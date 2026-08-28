/**
 * Calendar arithmetic without constructing a `Date`.
 *
 * §45's rule — enforced by `check-no-direct-date.mjs` — is that domain code may not build
 * a `Date`. Deriving "the day seven days after the clock's day" is exactly the kind of
 * work that tempts a `new Date(ms)` past it, so the arithmetic lives here instead, as
 * integer maths on the UTC calendar. Nothing in this file reads ambient time: every
 * function takes the instant it is given.
 */

export const DAY_MS = 86_400_000;

/** The UTC midnight at or before an instant, as epoch milliseconds. */
export const startOfUtcDay = (instantMs: number): number => Math.floor(instantMs / DAY_MS) * DAY_MS;

const pad = (value: number, width: number): string => String(value).padStart(width, '0');

/**
 * Epoch milliseconds → `YYYY-MM-DD`, UTC. Howard Hinnant's `civil_from_days`, which is
 * exact for every day the prototype could hold and needs no `Date` at all.
 */
export const isoDayOf = (instantMs: number): string => {
  // Shift the epoch to 0000-03-01 so leap days land at the end of a 400-year era.
  const z = Math.floor(instantMs / DAY_MS) + 719_468;
  const era = Math.floor(z / 146_097);
  const dayOfEra = z - era * 146_097;
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36_524) - Math.floor(dayOfEra / 146_096)) / 365,
  );
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthPrime = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthPrime + 2) / 5) + 1;
  const month = monthPrime + (monthPrime < 10 ? 3 : -9);
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
};

/**
 * The `YYYY-MM-DD` an ISO instant falls on. The contracts pin every timestamp to UTC
 * (`IsoDateTimeSchema`), so the day is the first ten characters and no parsing is needed.
 */
export const isoDayOfInstant = (instant: string): string => instant.slice(0, 10);
