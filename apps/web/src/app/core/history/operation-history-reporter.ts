import { InjectionToken } from '@angular/core';
import type { OperationReceipt, ProjectId } from '@cwm/contracts';

/**
 * One committed browser write, as the header's history needs to hear about it (Slice 41, §31).
 *
 * `projectId` and `projectName` come from the write's **response** — the task's, section's or
 * page's `projectId`, the updated project, the destination root of a shortcut — never from the page
 * the writer sits on. They only word cross-owner feedback ("recorded in Kitchen's history") and its
 * link; which history the write joined is decided by `receipt.historyId`, never by this guess.
 */
export interface OperationWriteReport {
  projectId: ProjectId;
  projectName?: string;
  /** The write's receipt, or `null` for a no-op that recorded nothing. */
  receipt: OperationReceipt | null;
}

/**
 * One write in flight, handed out by `begin()`. Tying the commit to the write that began it is what
 * lets the history ignore a write from before a navigation, and tell a write that failed without a
 * commit from one that committed while another write was also in flight.
 */
export interface OperationWriteHandle {
  /** This write committed, with the receipt its response carried (or `null` for a no-op). */
  committed(report: OperationWriteReport): void;
  /**
   * This write is over. Idempotent. A write that ends without having committed — a transport error
   * or a 5xx may still have committed on the host — makes the history read afresh rather than
   * assume either outcome.
   */
  end(): void;
}

/**
 * How a browser writer tells the displayed project's history that it is writing and what it wrote.
 *
 * Declared in `core/` so every feature — `features/tasks` included — reports through one token
 * without importing the projects feature, and implemented by the project workspace's
 * `ProjectHistoryStore`. Writers call `begin()` before the request, `committed(...)` on the handle
 * once the envelope arrives (before any follow-up read), and `end()` in `finally` —
 * `reportedWrite` does all three.
 */
export interface OperationHistoryReporter {
  begin(): OperationWriteHandle;
}

/**
 * A reporter that hears nothing: the root default, so every store stays usable outside a project
 * workspace — the dashboard, specs, Storybook, the dev panel — without an `if`. The workspace shell
 * overrides it; a spec there asserts the override reaches every writer, because this default would
 * otherwise hide a wiring mistake.
 */
export const inertOperationHistoryReporter = (): OperationHistoryReporter => ({
  begin: () => ({ committed: () => undefined, end: () => undefined }),
});

export const OPERATION_HISTORY_REPORTER = new InjectionToken<OperationHistoryReporter>('OPERATION_HISTORY_REPORTER', {
  providedIn: 'root',
  factory: inertOperationHistoryReporter,
});

/**
 * Runs one browser write under `reporter`: `begin()` before the request, `committed(...)` with the
 * report built from the **response** once it arrives, and `end()` in `finally`. Anything the write
 * throws is rethrown untouched, so the caller's own failure handling is unchanged.
 */
export const reportedWrite = async <T>(
  reporter: OperationHistoryReporter,
  write: () => Promise<T>,
  report: (result: T) => OperationWriteReport,
): Promise<T> => {
  const handle = reporter.begin();
  try {
    const result = await write();
    handle.committed(report(result));
    return result;
  } finally {
    handle.end();
  }
};
