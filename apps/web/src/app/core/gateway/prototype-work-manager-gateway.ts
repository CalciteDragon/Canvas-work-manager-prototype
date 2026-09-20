import { Injectable, inject } from '@angular/core';
import {
  ActivityFeedEntrySchema,
  AgentConnectionSchema,
  DashboardResultSchema,
  ProjectPageSchema,
  ProjectArchiveResultSchema,
  ProjectCompletedWorkResultSchema,
  ProjectJournalResultSchema,
  ProjectSchema,
  ProjectSectionSchema,
  ResolvedSectionShortcutSchema,
  ProgressResultSchema,
  ProjectTodosResultSchema,
  ReflectionSchema,
  SectionRemovalResultSchema,
  SectionAddResultSchema,
  SectionWriteResultSchema,
  TaskSchema,
  TimelineResultSchema,
  OperationHistorySummarySchema,
  OperationHistoryTransitionResultSchema,
  ReflectionAddResultSchema,
  ReflectionWriteResultSchema,
  TaskAddResultSchema,
  TaskWriteResultSchema,
  ShortcutSourceSchema,
  type ActivityQuery,
  type AgentConnectionId,
  type AgentPermission,
  type CreateProjectInput,
  type DashboardQuery,
  type CreateReflectionInput,
  type CreateSectionInput,
  type CreateTaskInput,
  type ProjectId,
  type ProjectQuery,
  type ReflectionId,
  type ReflectionQuery,
  type RemoveSectionInput,
  type CreateSectionShortcutInput,
  type UpdateProjectInput,
  type UpdateReflectionInput,
  type MoveSectionInput,
  type SectionId,
  type TaskId,
  type SectionQuery,
  type SectionShortcutId,
  type SectionShortcutQuery,
  type ShortcutSourceQuery,
  type UpdateSectionShortcutInput,
  type MoveSectionShortcutInput,
  type SetProjectPageEnabledInput,
  type TaskQuery,
  type UpdateSectionInput,
  type UpdateTaskInput,
  type OperationHistoryId,
  type OperationHistoryTransitionInput,
} from '@cwm/contracts';
import { z } from 'zod';
import { PROTOTYPE_API_BASE_URL } from '../config/prototype-config';
import { PrototypeSettings } from '../config/prototype-settings';
import { IDENTITY_PROVIDER } from '../identity/identity-provider';
import { GatewayError, toGatewayError, toUnreachableError } from './gateway-error';
import type { ActivityGateway, AgentGateway, ArchiveGateway, DashboardGateway, JournalGateway, OperationHistoryGateway, ProgressGateway, ProjectGateway, ProjectPageGateway, ReflectionGateway, SectionGateway, SectionShortcutGateway, TaskGateway, TimelineGateway, TodosGateway, WorkManagerGateway } from './work-manager-gateway';

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
  private readonly settings = inject(PrototypeSettings);

  readonly projects: ProjectGateway = {
    list: (query) =>
      matchesNothing(query)
        ? Promise.resolve([])
        : this.send('GET', `/api/projects${queryString(projectQueryParams(query))}`, ProjectSchema.array()),
    get: (id: ProjectId) => this.send('GET', `/api/projects/${encodeURIComponent(id)}`, ProjectSchema),
    create: (input: CreateProjectInput) => this.send('POST', '/api/projects', ProjectSchema, input),
    update: (id: ProjectId, input: UpdateProjectInput) =>
      this.send('PATCH', `/api/projects/${encodeURIComponent(id)}`, ProjectSchema, input),
  };

  readonly dashboard: DashboardGateway = {
    get: (query: Partial<DashboardQuery>) =>
      this.send('GET', `/api/dashboard${queryString(dashboardQueryParams(query))}`, DashboardResultSchema),
  };

  readonly progress: ProgressGateway = {
    get: (projectId) => this.send('GET', `/api/projects/${encodeURIComponent(projectId)}/progress`, ProgressResultSchema),
  };

  readonly timeline: TimelineGateway = {
    get: (projectId) => this.send('GET', `/api/projects/${encodeURIComponent(projectId)}/timeline`, TimelineResultSchema),
  };

  readonly todos: TodosGateway = {
    get: (projectId) => this.send('GET', `/api/projects/${encodeURIComponent(projectId)}/todos`, ProjectTodosResultSchema),
  };

  readonly archive: ArchiveGateway = {
    get: (projectId) => this.send('GET', `/api/projects/${encodeURIComponent(projectId)}/archive`, ProjectArchiveResultSchema),
  };

  readonly journal: JournalGateway = {
    get: (projectId) => this.send('GET', `/api/projects/${encodeURIComponent(projectId)}/journal`, ProjectJournalResultSchema),
    completedWork: (projectId) => this.send('GET', `/api/projects/${encodeURIComponent(projectId)}/completed-work`, ProjectCompletedWorkResultSchema),
  };

  readonly reflections: ReflectionGateway = {
    // The project scope is written **last**, so a filter object cannot override it.
    list: (projectId, query = {}) =>
      this.send(
        'GET',
        `/api/reflections${queryString(reflectionQueryParams({ ...query, projectId }))}`,
        ReflectionSchema.array(),
      ),
    create: (input: CreateReflectionInput) => this.send('POST', '/api/reflections', ReflectionAddResultSchema, input),
    update: (id: ReflectionId, input: UpdateReflectionInput) => this.send('PATCH', `/api/reflections/${encodeURIComponent(id)}`, ReflectionWriteResultSchema, input),
    archive: (id: ReflectionId) =>
      this.send('POST', `/api/reflections/${encodeURIComponent(id)}/archive`, ReflectionWriteResultSchema),
    restore: (id: ReflectionId) =>
      this.send('POST', `/api/reflections/${encodeURIComponent(id)}/restore`, ReflectionWriteResultSchema),
  };

  readonly pages: ProjectPageGateway = {
    list: (projectId: ProjectId) =>
      this.send('GET', `/api/projects/${encodeURIComponent(projectId)}/pages`, ProjectPageSchema.array()),
    // Addressed by kind rather than by page id: the first enable is what creates the record,
    // so there is no id yet to name. The host route reads the kind out of the path.
    setEnabled: (projectId: ProjectId, input: SetProjectPageEnabledInput) =>
      this.send(
        'PATCH',
        `/api/projects/${encodeURIComponent(projectId)}/pages/${encodeURIComponent(input.kind)}`,
        ProjectPageSchema,
        { enabled: input.enabled },
      ),
  };

  readonly sections: SectionGateway = {
    list: (projectId: ProjectId, query = {}) =>
      this.send(
        'GET',
        `/api/projects/${encodeURIComponent(projectId)}/sections${queryString(sectionQueryParams(query))}`,
        ProjectSectionSchema.array(),
      ),
    create: (projectId: ProjectId, input: CreateSectionInput) =>
      this.send('POST', `/api/projects/${encodeURIComponent(projectId)}/sections`, SectionAddResultSchema, input),
    update: (id: SectionId, input: UpdateSectionInput) =>
      this.send('PATCH', `/api/sections/${encodeURIComponent(id)}`, SectionWriteResultSchema, input),
    move: (id: SectionId, input: MoveSectionInput) =>
      this.send('POST', `/api/sections/${encodeURIComponent(id)}/move`, SectionWriteResultSchema, input),
    duplicate: (id: SectionId) =>
      this.send('POST', `/api/sections/${encodeURIComponent(id)}/duplicate`, ProjectSectionSchema),
    // The policy rides on the query string, matching the host route. The result carries only
    // the public receipt; the inverse remains on the server.
    remove: (id: SectionId, input: RemoveSectionInput = {}) =>
      this.send(
        'DELETE',
        `/api/sections/${encodeURIComponent(id)}${queryString(removeSectionParams(input))}`,
        SectionRemovalResultSchema,
      ),
    restore: (id: SectionId) =>
      this.send('POST', `/api/sections/${encodeURIComponent(id)}/restore`, ProjectSectionSchema),
  };

  readonly shortcuts: SectionShortcutGateway = {
    list: (projectId: ProjectId, query: SectionShortcutQuery = {}) =>
      this.send(
        'GET',
        `/api/projects/${encodeURIComponent(projectId)}/shortcuts${queryString(shortcutQueryParams(query))}`,
        ResolvedSectionShortcutSchema.array(),
      ),
    sources: (projectId: ProjectId, query: ShortcutSourceQuery) =>
      this.send(
        'GET',
        `/api/projects/${encodeURIComponent(projectId)}/shortcut-sources${queryString(shortcutSourceQueryParams(query))}`,
        ShortcutSourceSchema.array(),
      ),
    create: (projectId: ProjectId, input: CreateSectionShortcutInput) =>
      this.send('POST', `/api/projects/${encodeURIComponent(projectId)}/shortcuts`, ResolvedSectionShortcutSchema, input),
    update: (id: SectionShortcutId, input: UpdateSectionShortcutInput) =>
      this.send('PATCH', `/api/shortcuts/${encodeURIComponent(id)}`, ResolvedSectionShortcutSchema, input),
    move: (id: SectionShortcutId, input: MoveSectionShortcutInput) =>
      this.send('POST', `/api/shortcuts/${encodeURIComponent(id)}/move`, ResolvedSectionShortcutSchema, input),
    remove: (id: SectionShortcutId) =>
      this.sendWithoutBody('DELETE', `/api/shortcuts/${encodeURIComponent(id)}`),
  };

  readonly tasks: TaskGateway = {
    list: (query) =>
      matchesNothing(query)
        ? Promise.resolve([])
        : this.send('GET', `/api/tasks${queryString(taskQueryParams(query))}`, TaskSchema.array()),
    get: (id: TaskId) => this.send('GET', `/api/tasks/${encodeURIComponent(id)}`, TaskSchema),
    create: (input: CreateTaskInput) => this.send('POST', '/api/tasks', TaskAddResultSchema, input),
    update: (id: TaskId, input: UpdateTaskInput) =>
      this.send('PATCH', `/api/tasks/${encodeURIComponent(id)}`, TaskWriteResultSchema, input),
    complete: (id: TaskId) => this.send('POST', `/api/tasks/${encodeURIComponent(id)}/complete`, TaskWriteResultSchema),
    archive: (id: TaskId) => this.send('POST', `/api/tasks/${encodeURIComponent(id)}/archive`, TaskWriteResultSchema),
    restore: (id: TaskId) => this.send('POST', `/api/tasks/${encodeURIComponent(id)}/restore`, TaskWriteResultSchema),
  };

  readonly agents: AgentGateway = {
    list: () => this.send('GET', '/api/agent-connections', AgentConnectionSchema.array()),
    setPermissions: (id: AgentConnectionId, permissions: AgentPermission[]) =>
      this.send('PATCH', `/api/agent-connections/${encodeURIComponent(id)}`, AgentConnectionSchema, { permissions }),
    revoke: (id: AgentConnectionId) =>
      this.send('POST', `/api/agent-connections/${encodeURIComponent(id)}/revoke`, AgentConnectionSchema),
  };

  readonly activity: ActivityGateway = {
    list: (query: ActivityQuery) =>
      this.send('GET', `/api/activity${queryString(activityQueryParams(query))}`, ActivityFeedEntrySchema.array()),
  };

  readonly history: OperationHistoryGateway = {
    summary: (projectId) =>
      this.send('GET', `/api/projects/${encodeURIComponent(projectId)}/history`, OperationHistorySummarySchema),
    transition: (historyId: OperationHistoryId, input: OperationHistoryTransitionInput) =>
      this.send('POST', `/api/history/${encodeURIComponent(historyId)}/transition`, OperationHistoryTransitionResultSchema, input),
  };

  private async send<T>(method: string, path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
    const response = await this.request(method, path, body);
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

  /**
   * For routes whose body the caller does not use: a 204 (reading `.json()` off an empty body
   * would throw) or, for section removal, a 200 body this adapter deliberately ignores.
   */
  private async sendWithoutBody(method: string, path: string): Promise<void> {
    await this.request(method, path);
  }

  private async request(method: string, path: string, body?: unknown): Promise<Response> {
    // §63's injection, *first* — before the identity await, so a slow or failing identity
    // cannot pre-empt the delay the development panel asked for. The settings service
    // decides whether to wait and whether to fail; constructing the error is this
    // adapter's job, because §8 says a transport boundary is the only thing allowed to
    // produce a `GatewayError`.
    await this.settings.delay();
    if (this.settings.shouldFail()) {
      throw toUnreachableError(new Error('prototype failure injection (§46 Failure Rate)'));
    }

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
    return response;
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

const dashboardQueryParams = (query: Partial<DashboardQuery>): URLSearchParams => {
  const params = new URLSearchParams();
  append(params, 'upcomingDays', query.upcomingDays);
  append(params, 'recentDays', query.recentDays);
  return params;
};

const activityQueryParams = (query: ActivityQuery): URLSearchParams => {
  const params = new URLSearchParams();
  append(params, 'projectId', query.projectId);
  append(params, 'limit', query.limit);
  return params;
};

const projectQueryParams = (query: ProjectQuery): URLSearchParams => {
  const params = new URLSearchParams();
  append(params, 'workspaceId', query.workspaceId);
  append(params, 'parentProjectId', query.parentProjectId);
  append(params, 'status', query.status);
  append(params, 'search', query.search);
  return params;
};

const reflectionQueryParams = (query: ReflectionQuery): URLSearchParams => {
  const params = new URLSearchParams();
  append(params, 'projectId', query.projectId);
  append(params, 'sectionId', query.sectionId);
  append(params, 'includeArchived', query.includeArchived);
  return params;
};

/**
 * `pageId` and `includeArchived` only: the path already carries the project, and a query
 * `projectId` would be a second, contradictable answer to the same question.
 *
 * The host's route parses its own allowlist and forwards the same two. A filter added to one
 * side and not the other is accepted and silently ignored — a 200 with the wrong rows — so the
 * two lists are meant to be read together.
 */
const sectionQueryParams = (query: Omit<SectionQuery, 'projectId'>): URLSearchParams => {
  const params = new URLSearchParams();
  append(params, 'pageId', query.pageId);
  append(params, 'includeArchived', query.includeArchived);
  return params;
};

const shortcutQueryParams = (query: SectionShortcutQuery): URLSearchParams => {
  const params = new URLSearchParams();
  append(params, 'pageId', query.pageId);
  return params;
};

const shortcutSourceQueryParams = (query: ShortcutSourceQuery): URLSearchParams => {
  const params = new URLSearchParams();
  append(params, 'pageId', query.pageId);
  return params;
};

const removeSectionParams = (input: RemoveSectionInput): URLSearchParams => {
  const params = new URLSearchParams();
  append(params, 'policy', input.policy);
  append(params, 'reassignToSectionId', input.reassignToSectionId);
  return params;
};

const taskQueryParams = (query: TaskQuery): URLSearchParams => {
  const params = new URLSearchParams();
  append(params, 'projectId', query.projectId);
  append(params, 'sectionId', query.sectionId);
  append(params, 'parentTaskId', query.parentTaskId);
  append(params, 'status', query.status);
  append(params, 'priority', query.priority);
  append(params, 'dueBefore', query.dueBefore);
  append(params, 'dueAfter', query.dueAfter);
  append(params, 'search', query.search);
  append(params, 'includeArchived', query.includeArchived);
  return params;
};
