import type { LiveEvent, WorkspaceId } from '@cwm/contracts';

/**
 * One §62 frame, addressed to a workspace.
 *
 * The workspace rides *beside* the event rather than inside it because it is routing
 * information the browser must never receive: the host filters a stream by persona so a tab
 * is not handed another workspace's ids. `LiveEvent` is what goes on the wire; this is what
 * the host needs in order to decide who gets it.
 */
export interface LivePublication {
  workspaceId: WorkspaceId;
  event: LiveEvent;
}

/**
 * §62's stream as the domain sees it: a port, in the same spirit as `Clock`.
 *
 * Deliberately fire-and-forget and synchronous. A domain service must not wait on — or
 * fail because of — a browser that is listening, and `publish` is called inside an open
 * unit of work, where an `await` on a transport would be a way to hold the write lock open.
 * Whoever implements this decides when a buffered frame is actually delivered; the domain's
 * only claim is that it published one.
 */
export interface LiveEventPublisher {
  publish(publication: LivePublication): void;
}
