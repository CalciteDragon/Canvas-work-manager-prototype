import { AsyncLocalStorage } from 'node:async_hooks';
import type { LiveEvent, WorkspaceId } from '@cwm/contracts';
import type { LiveEventPublisher, LivePublication } from '@cwm/domain';
import type { UnitOfWork } from '@cwm/repositories';

export type LiveEventListener = (event: LiveEvent) => void;

interface Subscription {
  listener: LiveEventListener;
  /** `undefined` means "everything" — a `curl` debugging the stream. */
  workspaceId?: WorkspaceId;
}

/**
 * §62's fan-out, and the domain's `LiveEventPublisher`.
 *
 * Deliberately disposable (§71): an array of listeners, no ids, no replay, no backpressure.
 * The one piece of real machinery is the commit deferral, which exists because getting it
 * wrong is invisible in a test and maddening in a browser.
 *
 * **Why a frame waits for the commit.** `ActivityService.record` publishes from inside an
 * open unit of work, and `runUnitOfWork` only makes the new document visible to other
 * readers once it commits. Broadcasting from inside would let a browser refetch first, read
 * the *old* value, and — having already refreshed — never ask again. So `wrapUnitOfWork`
 * parks publications in an `AsyncLocalStorage` for the life of the unit and flushes them
 * after `run` resolves. A unit that rejects, for any reason including a commit-time
 * integrity failure, drops its buffer: a write that never landed must never be announced.
 */
export class LiveEventHub implements LiveEventPublisher {
  private readonly subscriptions = new Set<Subscription>();
  private readonly buffers = new AsyncLocalStorage<LivePublication[]>();

  /** `workspaceId` scopes the stream to one persona; omit it to receive everything. */
  subscribe(listener: LiveEventListener, workspaceId?: WorkspaceId): () => void {
    const subscription: Subscription = { listener, workspaceId };
    this.subscriptions.add(subscription);
    return () => void this.subscriptions.delete(subscription);
  }

  publish(publication: LivePublication): void {
    const buffer = this.buffers.getStore();
    if (buffer === undefined) {
      this.deliver(publication);
      return;
    }
    buffer.push(publication);
  }

  /**
   * A frame that belongs to no workspace and must reach every listener — §46's host-state
   * changes, which replace the whole document rather than mutating one workspace.
   */
  broadcastToAll(event: LiveEvent): void {
    for (const { listener } of [...this.subscriptions]) this.notify(listener, event);
  }

  /**
   * The unit of work the domain services are given: the real one, with a buffer around it.
   *
   * The nesting rule is expressed as "a buffer already exists", **not** as "a unit is already
   * open". `unitOfWorkFor` joins a nested call by returning `fn()` without opening a unit at
   * all, so a wrapper that started a fresh buffer for it would flush the inner events before
   * the outer commit — reintroducing exactly the pre-commit broadcast this class prevents.
   * Two *queued* units are unaffected: each establishes its own store around `uow.run`, and
   * the queued callback inherits the context of the caller that queued it.
   */
  wrapUnitOfWork(unitOfWork: UnitOfWork): UnitOfWork {
    return {
      run: async <T>(fn: () => T | Promise<T>): Promise<T> => {
        if (this.buffers.getStore() !== undefined) return unitOfWork.run(fn);

        const buffer: LivePublication[] = [];
        const result = await this.buffers.run(buffer, () => unitOfWork.run(fn));
        for (const publication of buffer) this.deliver(publication);
        return result;
      },
    };
  }

  private deliver(publication: LivePublication): void {
    // A copy, because a listener may unsubscribe itself as it runs — a browser tab that
    // disconnected while a flush was in progress does exactly that.
    for (const { listener, workspaceId } of [...this.subscriptions]) {
      if (workspaceId !== undefined && workspaceId !== publication.workspaceId) continue;
      this.notify(listener, publication.event);
    }
  }

  /**
   * One listener's failure is its own. Without this a throw from any subscriber would abort
   * delivery to every subscriber behind it in the set — and, worse, propagate out of the
   * flush and reject `wrapUnitOfWork.run`, so a write that **already committed** would be
   * answered as a 500. Nothing about a browser tab going away may reach back into the
   * mutation that told it something happened.
   */
  private notify(listener: LiveEventListener, event: LiveEvent): void {
    try {
      listener(event);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`live event listener failed — ${reason}`);
    }
  }
}
