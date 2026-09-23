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
 * How a browser writer tells the displayed project's history that it is writing and what it wrote.
 *
 * Declared in `core/` so every feature — `features/tasks` included — reports through one token
 * without importing the projects feature, and implemented by the project workspace's
 * `ProjectHistoryStore`. Writers call `begin()` before the request, the returned function in
 * `finally`, and `committed(...)` once the envelope arrives, before any follow-up read.
 */
export interface OperationHistoryReporter {
  /**
   * Marks one write in flight; the returned function ends it and is idempotent. Ending a write
   * whose `committed(...)` never ran (a transport error or a 5xx may still have committed) asks for
   * a fresh summary rather than assuming either outcome.
   */
  begin(): () => void;
  /** A committed write's receipt (or `null` for a no-op), with the project whose history it names. */
  committed(report: OperationWriteReport): void;
}

/**
 * A reporter that hears nothing: the root default, so every store stays usable outside a project
 * workspace — the dashboard, specs, Storybook, the dev panel — without an `if`. The workspace shell
 * overrides it; a spec there asserts the override reaches every writer, because this default would
 * otherwise hide a wiring mistake.
 */
export const inertOperationHistoryReporter = (): OperationHistoryReporter => ({
  begin: () => () => undefined,
  committed: () => undefined,
});

export const OPERATION_HISTORY_REPORTER = new InjectionToken<OperationHistoryReporter>('OPERATION_HISTORY_REPORTER', {
  providedIn: 'root',
  factory: inertOperationHistoryReporter,
});
