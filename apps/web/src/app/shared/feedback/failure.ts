/**
 * A failure as the product says it (Slice 78, §24, §63): a sentence in product words, and the
 * raw host reason kept apart for a collapsed Details. View state, not a contract.
 *
 * This is the only translation from an error to words. It reads `code` and `message`
 * **structurally**, so `shared/` imports nothing from `core/`; each caller chooses its own
 * recovery (Try again, Go to Home, Retry refresh, Reload page).
 */
export interface Failure {
  /** What the user reads: no record id, enum, path or status. */
  readonly sentence: string;
  /** The error's message, for Details only; `null` when there is nothing to show. */
  readonly reason: string | null;
}

const field = (error: unknown, name: 'code' | 'message'): string | null => {
  if (typeof error !== 'object' || error === null || !(name in error)) return null;
  const value = (error as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : null;
};

const reasonOf = (error: unknown): string => field(error, 'message') ?? String(error);

const capitalized = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * A failed read of `subject`, a noun phrase as it reads mid-sentence ("this task list",
 * "your projects"). Every subject that can answer `not_found` is singular.
 */
export const readFailure = (error: unknown, subject: string): Failure => {
  const code = field(error, 'code');
  const sentence =
    code === 'not_found' ? `${capitalized(subject)} isn’t available.`
    : code === 'unreachable' ? `Couldn’t reach your workspace, so ${subject} didn’t load.`
    : `Couldn’t load ${subject}.`;
  return { sentence, reason: reasonOf(error) };
};

/** A failed write: the caller's slice-75 sentence ("Couldn’t <verb> “X”. Try again."), its reason apart. */
export const writeFailure = (error: unknown, sentence: string): Failure => ({ sentence, reason: reasonOf(error) });
