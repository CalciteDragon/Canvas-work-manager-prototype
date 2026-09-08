/**
 * An ISO instant split so ordering stays lossless as text.
 *
 * `IsoDateTimeSchema` permits omitted seconds and fractions of arbitrary precision. `Date.parse`
 * would collapse distinct values to milliseconds, while raw string comparison treats equivalent
 * spellings as different. Derived projections use this small value object instead (§45).
 */
export interface Instant {
  prefix: string;
  fraction: string;
}

export const instantOf = (value: string): Instant => {
  const body = value.endsWith('Z') ? value.slice(0, -1) : value;
  const point = body.indexOf('.');
  const whole = point === -1 ? body : body.slice(0, point);
  return {
    prefix: whole.length === 16 ? `${whole}:00` : whole,
    fraction: point === -1 ? '' : body.slice(point + 1),
  };
};

/** Ordinal comparison, independent of the machine's locale. */
export const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export const compareInstants = (a: Instant, b: Instant): number => {
  const byPrefix = compareText(a.prefix, b.prefix);
  if (byPrefix !== 0) return byPrefix;
  const width = Math.max(a.fraction.length, b.fraction.length);
  return compareText(a.fraction.padEnd(width, '0'), b.fraction.padEnd(width, '0'));
};
