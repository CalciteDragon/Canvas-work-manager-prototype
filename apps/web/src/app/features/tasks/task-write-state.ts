import type { Failure } from '../../shared/feedback/failure';

/**
 * Slice 75's browser-side view of the writes a Task List has in flight. None of these is a
 * contract type: they describe what the page is waiting for, never what the server holds.
 */

/** A quick-added title before the server has answered. Not a `Task`: it has no id yet. */
export interface PendingTaskCreate {
  readonly key: number;
  readonly title: string;
}

/**
 * How a quick-add ended. `failed` means the owed read found no such task, so the title can go
 * back to the field; `unconfirmed` means that read failed too, so it must not. `stale` means the
 * list moved to another section while the request was out.
 */
export type TaskCreateOutcome = 'added' | 'refused' | 'failed' | 'unconfirmed' | 'stale';

/** The drawer fields that save on their own. */
export type TaskDrawerField = 'title' | 'priority' | 'dueAt' | 'estimate';

export type TaskFieldSave =
  | { readonly state: 'saving' }
  | { readonly state: 'saved' }
  | { readonly state: 'failed'; readonly failure: Failure };

export type TaskFieldSaves = Partial<Record<TaskDrawerField, TaskFieldSave>>;
