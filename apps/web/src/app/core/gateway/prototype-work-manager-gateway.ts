import { Injectable, inject } from '@angular/core';
import {
  ProjectSchema,
  TaskSchema,
  type CreateTaskInput,
  type ProjectId,
  type ProjectQuery,
  type TaskId,
  type TaskQuery,
  type UpdateTaskInput,
} from '@cwm/contracts';
import { z } from 'zod';
import { PROTOTYPE_API_BASE_URL } from '../config/prototype-config';
import { IDENTITY_PROVIDER } from '../identity/identity-provider';
import { GatewayError, toGatewayError, toUnreachableError } from './gateway-error';
import type { ProjectGateway, TaskGateway, WorkManagerGateway } from './work-manager-gateway';

/**
 * The §10 adapter: Angular → `localhost:4310`. Everything transport-shaped lives here —
 * `fetch`, URLs, status codes, headers — so that components see only the gateway
 * interfaces and `GatewayError` (§8). Swapping in an `HttpWorkManagerGateway` against a
 * production API replaces this file and nothing else.
 */
@Injectable()
export class PrototypeWorkManagerGateway implements WorkManagerGateway {
  private readonly baseUrl = inject(PROTOTYPE_API_BASE_URL);
  private readonly identity = inject(IDENTITY_PROVIDER);

  readonly projects: ProjectGateway = {
    list: (query) =>
      matchesNothing(query)
        ? Promise.resolve([])
        : this.send('GET', `/api/projects${queryString(projectQueryParams(query))}`, ProjectSchema.array()),
    get: (id: ProjectId) => this.send('GET', `/api/projects/${encodeURIComponent(id)}`, ProjectSchema),
  };

  readonly tasks: TaskGateway = {
    list: (query) =>
      matchesNothing(query)
        ? Promise.resolve([])
        : this.send('GET', `/api/tasks${queryString(taskQueryParams(query))}`, TaskSchema.array()),
    get: (id: TaskId) => this.send('GET', `/api/tasks/${encodeURIComponent(id)}`, TaskSchema),
    create: (input: CreateTaskInput) => this.send('POST', '/api/tasks', TaskSchema, input),
    update: (id: TaskId, input: UpdateTaskInput) =>
      this.send('PATCH', `/api/tasks/${encodeURIComponent(id)}`, TaskSchema, input),
    complete: (id: TaskId) => this.send('POST', `/api/tasks/${encodeURIComponent(id)}/complete`, TaskSchema),
    // §9 says `Promise<void>`; the host returns the archived task. Validate it anyway —
    // an unchecked body is not something this adapter passes on, even to discard.
    archive: async (id: TaskId) => {
      await this.send('POST', `/api/tasks/${encodeURIComponent(id)}/archive`, TaskSchema);
    },
  };

  private async send<T>(method: string, path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
    // The persona comes from the resolved identity, never from storage: the provider heals
    // a stale one, and reading the key here would let the two drift apart.
    const { user } = await this.identity.getCurrentIdentity();

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'x-prototype-user': user.id,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      throw toUnreachableError(error);
    }

    if (!response.ok) throw await toGatewayError(response, `${method} ${path}`);

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new GatewayError('invalid_response', 0, `${method} ${path} did not answer JSON`);
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new GatewayError('invalid_response', 0, `${method} ${path} answered a body that is not its contract`);
    }
    return parsed.data;
  }

}

/**
 * An empty array filter means "match none of these", and a query carrying one can be
 * answered without asking the host at all.
 *
 * It has to be answered *here*, because an empty array serializes to no parameter, the
 * host then parses `status: undefined`, and the repository reads that as "no filter" — so
 * `list({ status: [] })` would come back with **every** project, the exact inverse of the
 * request, and the opposite of what the same query returns in-process.
 */
const matchesNothing = (query: { status?: unknown[]; priority?: unknown[] }): boolean =>
  query.status?.length === 0 || query.priority?.length === 0;

const queryString = (params: URLSearchParams): string => {
  const serialized = params.toString();
  return serialized === '' ? '' : `?${serialized}`;
};

/**
 * Array filters go out as repeated params and everything else as one — the shape
 * `queryObject` on the host actually parses. Undefined members are simply absent.
 */
const append = (params: URLSearchParams, key: string, value: unknown): void => {
  if (value === undefined) return;
  if (Array.isArray(value)) for (const item of value) params.append(key, String(item));
  else params.append(key, String(value));
};

const projectQueryParams = (query: ProjectQuery): URLSearchParams => {
  const params = new URLSearchParams();
  append(params, 'workspaceId', query.workspaceId);
  append(params, 'parentProjectId', query.parentProjectId);
  append(params, 'status', query.status);
  append(params, 'search', query.search);
  return params;
};

const taskQueryParams = (query: TaskQuery): URLSearchParams => {
  const params = new URLSearchParams();
  append(params, 'projectId', query.projectId);
  append(params, 'parentTaskId', query.parentTaskId);
  append(params, 'status', query.status);
  append(params, 'priority', query.priority);
  append(params, 'dueBefore', query.dueBefore);
  append(params, 'dueAfter', query.dueAfter);
  append(params, 'search', query.search);
  append(params, 'includeArchived', query.includeArchived);
  return params;
};
