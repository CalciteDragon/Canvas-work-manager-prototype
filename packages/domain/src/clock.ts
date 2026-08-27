export interface Clock {
  now(): Date;
}

const cloneValidDate = (value: Date): Date => {
  if (Number.isNaN(value.getTime())) {
    throw new TypeError('a clock requires a valid date');
  }
  return new Date(value.getTime());
};

export class PrototypeClock implements Clock {
  private current: Date;

  constructor(now: Date) {
    this.current = cloneValidDate(now);
  }

  now(): Date {
    return cloneValidDate(this.current);
  }

  setNow(now: Date): void {
    this.current = cloneValidDate(now);
  }
}

/**
 * The clock a running host uses: real time, shifted by an offset.
 *
 * `PrototypeClock` is frozen by design — it is what a test wants. As a *host* clock it is
 * wrong in a way that only shows up once you use the thing: every timestamp in a session
 * is identical, so a task's `createdAt`, `completedAt` and `archivedAt` all match and
 * §57's newest-first feed is one undifferentiated tie.
 *
 * `setNow` simulates §45's "Friday afternoon" or "deadline tomorrow" and then lets time
 * run on from there, which is what makes the simulated moment usable rather than static.
 */
export class SimulatedClock implements Clock {
  private offsetMilliseconds = 0;

  now(): Date {
    return new Date(Date.now() + this.offsetMilliseconds);
  }

  /** Jump to a moment; time continues to flow from it. */
  setNow(now: Date): void {
    this.offsetMilliseconds = cloneValidDate(now).getTime() - Date.now();
  }

  /** How far this clock is from real time, in milliseconds. */
  get offset(): number {
    return this.offsetMilliseconds;
  }

  /** Back to real time. */
  reset(): void {
    this.offsetMilliseconds = 0;
  }
}
