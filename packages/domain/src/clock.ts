export interface Clock {
  now(): Date;
}

const cloneValidDate = (value: Date): Date => {
  if (Number.isNaN(value.getTime())) {
    throw new TypeError('PrototypeClock requires a valid date');
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
