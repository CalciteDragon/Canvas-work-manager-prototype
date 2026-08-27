import type { Identity, Project, ProjectId, Task, TaskId } from '@cwm/contracts';
import { GatewayError } from '../gateway-error';
import type { ProjectGateway, TaskGateway, WorkManagerGateway } from '../work-manager-gateway';

/**
 * The gateway every component and store spec runs against. Its existence is what makes
 * §8's boundary structural rather than aspirational: no spec has any reason to reach for
 * `PrototypeWorkManagerGateway`, so none of them do, so nothing outside `app.config.ts`
 * ever names the concrete adapter.
 */
export interface FakeGatewayOptions {
  projects?: Project[];
  tasks?: Task[];
  /** Rejects every call with this instead of answering — the failure path a shell needs. */
  failWith?: GatewayError;
}

export class FakeWorkManagerGateway implements WorkManagerGateway {
  constructor(private readonly options: FakeGatewayOptions = {}) {}

  /** Every call the spec made, in order, so a test can assert the query that was sent. */
  readonly calls: Array<{ method: string; argument: unknown }> = [];

  readonly projects: ProjectGateway = {
    list: (query) => this.answer('projects.list', query, this.options.projects ?? []),
    get: (id: ProjectId) => this.answer('projects.get', id, this.find(this.options.projects, id, 'project')),
  };

  readonly tasks: TaskGateway = {
    list: (query) => this.answer('tasks.list', query, this.options.tasks ?? []),
    get: (id: TaskId) => this.answer('tasks.get', id, this.find(this.options.tasks, id, 'task')),
    create: (input) => this.answer('tasks.create', input, this.firstTask()),
    update: (id, input) => this.answer('tasks.update', { id, input }, this.firstTask()),
    complete: (id) => this.answer('tasks.complete', id, this.firstTask()),
    archive: (id) => this.answer('tasks.archive', id, undefined),
  };

  private answer<T>(method: string, argument: unknown, value: T): Promise<T> {
    this.calls.push({ method, argument });
    return this.options.failWith === undefined ? Promise.resolve(value) : Promise.reject(this.options.failWith);
  }

  private find<T extends { id: string }>(items: T[] | undefined, id: string, kind: string): T {
    const found = items?.find((item) => item.id === id);
    if (found === undefined) throw new GatewayError('not_found', 404, `no such ${kind} "${id}"`);
    return found;
  }

  private firstTask(): Task {
    const [task] = this.options.tasks ?? [];
    if (task === undefined) throw new Error('the fake gateway was given no tasks to answer with');
    return task;
  }

  argumentTo(method: string): unknown {
    return this.calls.find((call) => call.method === method)?.argument;
  }
}

/** An `IdentityProvider` that answers whatever the spec hands it. */
export const fakeIdentityProvider = (identity: Identity | GatewayError) => ({
  getCurrentIdentity: () =>
    identity instanceof GatewayError ? Promise.reject(identity) : Promise.resolve(identity),
});
