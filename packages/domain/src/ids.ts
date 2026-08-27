/**
 * Ids come from here rather than from the entities themselves, so tests can pin them the
 * way `Clock` pins time (§45).
 */
export interface IdGenerator {
  next(prefix: string): string;
}

/**
 * Readable-ish ids: `task-4f2a91c8`. §14 chose JSON partly so a data file can be read and
 * copied by hand, and a bare UUID makes that materially worse. `crypto` is the global —
 * importing `node:crypto` would put a runtime dependency on Node in domain code.
 */
export class PrototypeIdGenerator implements IdGenerator {
  next(prefix: string): string {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
}
