import type { LiveEvent } from '@cwm/contracts';

/**
 * The frames that say a **project record** changed — its fields, status or parent — rather than
 * something on its canvas: the ordinary create, update and archive, and since Slice 39 the Undo
 * and Redo of an update, an archive or a reactivation.
 */
const PROJECT_RECORD_EVENT = /^project\.(created|updated|archived|(update|archive|reactivation)_(undone|redone))$/;

/**
 * Whether `event` is about a project record, anywhere in the workspace (Slice 39,
 * docs/decisions/2026-09-project-update-operation-history.md).
 *
 * A cross-root reparent — forward, Undo or Redo — publishes **one** frame, and it names the root the
 * sub-project is under *now*. The root it left is not in that frame at all, yet its tree, Todos and
 * Archive all lose a sub-project. So an open root aggregate re-reads on any record frame rather than
 * only its own root's; content frames from other roots still leave it alone. The stream is already
 * filtered to the persona's workspace on the host, and only stores that are open fetch.
 */
export const isProjectRecordEvent = (event: LiveEvent): boolean =>
  event.entityType === 'project' && PROJECT_RECORD_EVENT.test(event.type);
