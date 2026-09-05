import { ProjectSchema, type
  ActivityFeedEntry,
  ActivityQuery,
  AgentConnection,
  AgentConnectionId,
  AgentPermission,
  DashboardQuery,
  DashboardResult,
  Identity,
  ProgressResult,
  Project,
  ProjectId,
  ProjectPage,
  ProjectPageId,
  ProjectSection,
  Reflection,
  ReflectionId,
  SectionId,
  SetProjectPageEnabledInput,
  Task,
  TaskId,
  TimelineResult,
  UpdateProjectInput,
  UpdateSectionInput,
} from '@cwm/contracts';
import { GatewayError } from '../gateway-error';
import type {
  ActivityGateway,
  AgentGateway,
  ProjectGateway,
  ProjectPageGateway,
  SectionGateway,
  TaskGateway,
  WorkManagerGateway,
} from '../work-manager-gateway';

/**
 * The gateway every component and store spec runs against. Its existence is what makes
 * §8's boundary structural rather than aspirational: no spec has any reason to reach for
 * `PrototypeWorkManagerGateway`, so none of them do, so nothing outside `app.config.ts`
 * ever names the concrete adapter.
 */
export interface FakeGatewayOptions {
  projects?: Project[];
  /** §26's pages. Absent, every project answers with the canonical page it must have. */
  pages?: ProjectPage[];
  sections?: ProjectSection[];
  tasks?: Task[];
  progress?: ProgressResult;
  timeline?: TimelineResult;
  reflections?: Reflection[];
  dashboard?: DashboardResult;
  agentConnections?: AgentConnection[];
  activity?: ActivityFeedEntry[];
  /** Rejects every call with this instead of answering — the failure path a shell needs. */
  failWith?: GatewayError;
  /** Reject only named calls after an otherwise successful load (for write failure UI). */
  failOn?: Readonly<Record<string, GatewayError>>;
}

const COMPLETED_AT = '2026-08-27T16:00:00.000Z';

export class FakeWorkManagerGateway implements WorkManagerGateway {
  /**
   * Public so a spec can move the world underneath a component — the region re-reads on the
   * page's data revision, and a test of that has to change what the next read answers.
   */
  constructor(readonly options: FakeGatewayOptions = {}) {}

  /** Every call the spec made, in order, so a test can assert the query that was sent. */
  readonly calls: Array<{ method: string; argument: unknown }> = [];

  /**
   * A project's pages: the seeded ones, or the canonical page every project has from the
   * moment it exists (§26). Derived rather than required in every fixture, for the same
   * reason the domain creates it in the same unit of work as its owner — a project with no
   * page is not a state anything should have to represent.
   */
  private pagesOf(projectId: ProjectId): ProjectPage[] {
    const seeded = (this.options.pages ?? []).filter((page) => page.projectId === projectId);
    if (seeded.length > 0) return seeded;
    const kind = (this.options.projects ?? []).find(({ id }) => id === projectId)?.kind ?? 'root';
    return [
      {
        id: `page-${projectId}` as ProjectPageId,
        projectId,
        kind: kind === 'root' ? 'home' : 'work',
        enabled: true,
        createdAt: COMPLETED_AT,
        updatedAt: COMPLETED_AT,
      },
    ];
  }

  readonly projects: ProjectGateway = {
    list: (query) => this.answer('projects.list', query, this.options.projects ?? []),
    get: (id: ProjectId) =>
      this.answer('projects.get', id, this.find(this.options.projects, id, 'project')),
    // A sub-project echoes its parent's record; a **root** has no record to echo, so it gets
    // the shape the host would build from the contract's own defaults. Without this branch a
    // root create threw out of `find` before `answer` ever recorded the call, which is the
    // one thing §81's sidebar create needs to assert.
    //
    // Branching on `kind` rather than on whether a parent happened to be supplied: the two
    // agreed before §26 made the distinction explicit, and only one of them is the rule.
    create: (input) =>
      this.answer('projects.create', input, ProjectSchema.parse({
        ...(input.kind === 'root'
          ? { status: 'planning', projectLayoutMode: 'flow', createdAt: COMPLETED_AT, updatedAt: COMPLETED_AT }
          : this.find(this.options.projects, input.parentProjectId, 'project')),
        ...input,
        id: 'project-created' as ProjectId,
        targetDate: input.targetDate ?? undefined,
      })),
    update: (id, input) => {
      const answer = this.answer(
        'projects.update',
        { id, input },
        applyProjectUpdate(this.find(this.options.projects, id, 'project'), input),
      );
      return answer.then((updated) => {
        if (input.progressFormula !== undefined && this.options.progress !== undefined) {
          this.options.progress = fakeProgress(updated.id, input.progressFormula, input.manualProgress ?? undefined, this.options.tasks ?? []);
        }
        return updated;
      });
    },
  };

  readonly dashboard = {
    get: (query: Partial<DashboardQuery>) =>
      this.answer('dashboard.get', query, this.options.dashboard ?? emptyDashboard()),
  };

  readonly agents: AgentGateway = {
    list: () => this.answer('agents.list', undefined, this.options.agentConnections ?? []),
    // The whole permission array is the assertion the §53 spec cares about, so it is what
    // `calls` records — and the answer echoes it, the way the host's does.
    setPermissions: (id: AgentConnectionId, permissions: AgentPermission[]) =>
      this.answer('agents.setPermissions', { id, permissions }, {
        ...this.find(this.options.agentConnections, id, 'agent connection'),
        permissions,
      }),
    revoke: (id: AgentConnectionId) =>
      this.answer('agents.revoke', id, {
        ...this.find(this.options.agentConnections, id, 'agent connection'),
        revoked: true,
      }),
  };

  readonly activity: ActivityGateway = {
    list: (query: ActivityQuery) =>
      this.answer(
        'activity.list',
        query,
        (this.options.activity ?? []).filter(
          (entry) => query.projectId === undefined || entry.projectId === query.projectId,
        ),
      ),
  };

  readonly progress = {
    get: (projectId: ProjectId) => this.answer('progress.get', projectId, this.options.progress ?? {
      projectId, formula: 'count' as const, percentage: null, completed: 0, total: 0, explanation: 'No tasks to measure',
    }),
  };

  readonly timeline = {
    get: (projectId: ProjectId) => this.answer('timeline.get', projectId, this.options.timeline ?? { projectId, items: [] }),
  };

  readonly reflections = {
    // Archive filtering is faithful, not ignored: a store that forgot `includeArchived`
    // would otherwise pass here and show archived rows in a live section.
    list: (projectId: ProjectId, query: { sectionId?: SectionId; includeArchived?: boolean } = {}) =>
      this.answer(
        'reflections.list',
        Object.keys(query).length === 0 ? projectId : { projectId, ...query },
        (this.options.reflections ?? []).filter(
          (item) =>
            item.projectId === projectId &&
            (query.sectionId === undefined || item.sectionId === query.sectionId) &&
            (query.includeArchived === true || item.archivedAt === undefined),
        ),
      ),
    create: (input: Parameters<WorkManagerGateway['reflections']['create']>[0]) => this.answer('reflections.create', input, {
      // The real service resolves a container when the caller names none; the fake stands
      // in for that rather than leaving the row unowned.
      id: 'reflection-created' as ReflectionId, sectionId: 'section-resolved' as SectionId, ...input, createdAt: COMPLETED_AT, updatedAt: COMPLETED_AT,
    }),
    update: (id: ReflectionId, input: Parameters<WorkManagerGateway['reflections']['update']>[1]) => this.answer('reflections.update', { id, input }, { ...this.find(this.options.reflections, id, 'reflection'), ...input, title: input.title === null ? undefined : input.title ?? this.find(this.options.reflections, id, 'reflection').title }),
    archive: (id: ReflectionId) =>
      this.answer('reflections.archive', id, {
        ...this.find(this.options.reflections, id, 'reflection'),
        archivedAt: COMPLETED_AT,
      }),
    restore: (id: ReflectionId) => this.answer('reflections.restore', id, restored(this.find(this.options.reflections, id, 'reflection'))),
  };

  readonly pages: ProjectPageGateway = {
    list: (projectId: ProjectId) =>
      this.answer('pages.list', projectId, this.pagesOf(projectId)),
    // The toggle, echoed: enabling a kind the project does not have yet answers with a new
    // record, matching the service's upsert, so a store spec sees the same two shapes it
    // would over HTTP.
    setEnabled: (projectId: ProjectId, input: SetProjectPageEnabledInput) =>
      this.answer('pages.setEnabled', { projectId, input }, {
        ...(this.pagesOf(projectId).find(({ kind }) => kind === input.kind) ?? {
          id: `page-${projectId}-${input.kind}` as ProjectPageId,
          projectId,
          kind: input.kind,
          createdAt: COMPLETED_AT,
          updatedAt: COMPLETED_AT,
        }),
        enabled: input.enabled,
      }),
  };

  readonly sections: SectionGateway = {
    // Live-only unless asked, like the repository: a canvas store that forgot the default
    // would otherwise paint archived sections and pass its spec. `pageId` is honoured for the
    // same reason — a store that read a page and got the whole project would pass its spec
    // and paint another canvas's sections.
    list: (projectId: ProjectId, query: { pageId?: ProjectPageId; includeArchived?: boolean } = {}) =>
      this.answer(
        'sections.list',
        query.includeArchived === undefined && query.pageId === undefined ? projectId : { projectId, ...query },
        (this.options.sections ?? []).filter(
          (section) =>
            section.projectId === projectId &&
            (query.pageId === undefined || section.pageId === query.pageId) &&
            (query.includeArchived === true || section.archivedAt === undefined),
        ),
      ),
    // The write answers echo the request over the first seeded section, which is enough for
    // a store spec: what matters is the argument that reached the boundary, not the body.
    create: (projectId, input) =>
      this.answer(
        'sections.create',
        { projectId, input },
        { ...this.firstSection(), ...input, projectId },
      ),
    update: (id, input) =>
      this.answer('sections.update', { id, input }, applyUpdate(this.sectionFor(id), input)),
    move: (id, input) =>
      this.answer(
        'sections.move',
        { id, input },
        { ...this.sectionFor(id), position: input.position },
      ),
    duplicate: (id) =>
      this.answer('sections.duplicate', id, {
        ...this.sectionFor(id),
        id: `${id}-copy` as SectionId,
      }),
    // The policy is recorded too: a removal that swallowed it would look identical here.
    remove: (id, input) => this.answer('sections.remove', { id, input: input ?? {} }, undefined),
    restore: (id) => this.answer('sections.restore', id, restored(this.sectionFor(id))),
  };

  readonly tasks: TaskGateway = {
    // Honours `sectionId`, because a Task List section now renders only what its own
    // container owns — a fake that ignored it would let a broken scope pass. It honours
    // `projectId` and `includeArchived` for the same reason: the Archived region reads by
    // project and asks for archived rows, and a fake that answered everything regardless
    // would let a store that forgot either one look correct.
    list: (query) =>
      this.answer(
        'tasks.list',
        query,
        (this.options.tasks ?? []).filter(
          (task) =>
            (query.sectionId === undefined || task.sectionId === query.sectionId) &&
            (query.projectId === undefined || task.projectId === query.projectId) &&
            (query.includeArchived === true || task.archivedAt === undefined),
        ),
      ),
    get: (id: TaskId) => this.answer('tasks.get', id, this.find(this.options.tasks, id, 'task')),
    create: (input) => this.answer('tasks.create', input, this.firstTask()),
    update: (id, input) => this.answer('tasks.update', { id, input }, this.firstTask()),
    // Answers the task as completed, the way the host does. Echoing it back unchanged would
    // make every optimistic completion appear to revert, which is a different test.
    complete: (id) => {
      const current = this.find(this.options.tasks, id, 'task');
      if (current.status !== 'done' && this.options.progress?.formula === 'count' && this.options.progress.total > 0) {
        const completed = this.options.progress.completed + 1;
        this.options.progress = { ...this.options.progress, completed, percentage: Math.round(completed / this.options.progress.total * 100), explanation: `${completed} of ${this.options.progress.total} tasks complete` };
      }
      return this.answer('tasks.complete', id, {
        ...this.find(this.options.tasks, id, 'task'),
        status: 'done',
        completedAt: COMPLETED_AT,
      });
    },
    archive: (id) => this.answer('tasks.archive', id, undefined),
    restore: (id) => this.answer('tasks.restore', id, restored(this.find(this.options.tasks, id, 'task'))),
  };

  private answer<T>(method: string, argument: unknown, value: T): Promise<T> {
    this.calls.push({ method, argument });
    const failure = this.options.failWith ?? this.options.failOn?.[method];
    return failure === undefined ? Promise.resolve(value) : Promise.reject(failure);
  }

  private find<T extends { id: string }>(items: T[] | undefined, id: string, kind: string): T {
    const found = items?.find((item) => item.id === id);
    if (found === undefined) throw new GatewayError('not_found', 404, `no such ${kind} "${id}"`);
    return found;
  }

  private firstSection(): ProjectSection {
    const [section] = this.options.sections ?? [];
    if (section === undefined)
      throw new Error('the fake gateway was given no sections to answer with');
    return section;
  }

  private sectionFor(id: SectionId): ProjectSection {
    return this.find(this.options.sections, id, 'section');
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

/**
 * What the host answers a restore with: both archive fields gone. Written here rather than
 * spread inline, because a fake that cleared only `archivedAt` would let a store that never
 * re-read the row look correct.
 */
const restored = <T extends { archivedAt?: string; archivedWithSectionId?: string; archivedWithTaskId?: string }>(
  row: T,
): T => {
  const next = { ...row };
  delete next.archivedAt;
  delete next.archivedWithSectionId;
  delete next.archivedWithTaskId;
  return next;
};

/**
 * The host's `null` clears / `undefined` leaves alone rule, so a spec that clears a frame
 * title override sees what the real adapter would answer rather than a `null` the contract
 * forbids.
 */
const applyUpdate = (section: ProjectSection, input: UpdateSectionInput): ProjectSection => {
  const next = { ...section };
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (value === null) delete next[key as keyof ProjectSection];
    else Object.assign(next, { [key]: value });
  }
  return next;
};

/**
 * A second implementation of `ProjectService.update`'s field application, and knowingly so:
 * this fake answers component specs without a host, and a generic patch is what most of them
 * need. It only has to agree with the real service where a spec could otherwise assert
 * something the host would never do.
 *
 * Two such places, both from §26's owner kinds:
 *
 * - **`kind` is immutable.** A root cannot be given a parent and a sub-project cannot lose
 *   one; the real service refuses both with a `DomainRuleError`, so the fake refuses too
 *   rather than answering a project that changed kind — a shape no test should be able to
 *   build a passing expectation on.
 * - **`completedAt` is derived, never supplied.** The service stamps it from the `Clock` when
 *   the status becomes `completed` and clears it when it leaves, so this does the same from
 *   the fixture's own timestamps rather than letting an input set it.
 */
const applyProjectUpdate = (project: Project, input: UpdateProjectInput): Project => {
  if (input.parentProjectId !== undefined && project.kind !== 'subproject') {
    throw new GatewayError('conflict', 409, 'a root project cannot be given a parent');
  }

  const next = { ...project };
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (value === null) delete next[key as keyof Project];
    else Object.assign(next, { [key]: value });
  }

  if (next.status === 'completed' && project.status !== 'completed') next.completedAt = COMPLETED_AT;
  else if (next.status !== 'completed') delete next.completedAt;
  return next;
};

const fakeProgress = (projectId: ProjectId, formula: ProgressResult['formula'], manualProgress: number | undefined, tasks: Task[]): ProgressResult => {
  if (formula === 'manual') {
    const percentage = manualProgress ?? 0;
    return { projectId, formula, percentage, completed: percentage, total: 100, explanation: `${percentage}% entered manually` };
  }
  const included = tasks.filter((task) => task.projectId === projectId && task.archivedAt === undefined);
  const weight = (task: Task) => formula === 'weighted' ? task.estimate ?? 1 : 1;
  const total = included.reduce((sum, task) => sum + weight(task), 0);
  const completed = included.filter(({ status }) => status === 'done').reduce((sum, task) => sum + weight(task), 0);
  const label = formula === 'weighted' ? 'estimate points' : 'tasks';
  return { projectId, formula, percentage: total === 0 ? null : Math.round(completed / total * 100), completed, total, explanation: total === 0 ? 'No tasks to measure' : `${completed} of ${total} ${label} complete` };
};

/**
 * What the host answers for a workspace with nothing in it. A spec that only cares about
 * widget layout should not have to write out a whole `DashboardResult`.
 *
 * It deliberately ignores the query. An earlier version echoed the requested `days` back
 * beside hardcoded `throughDate`/`sinceDate` values — a body the real host could never
 * produce, and exactly the kind of fake that lets a wrong implementation look right. The
 * range a request carried is asserted through `argumentTo('dashboard.get')` instead.
 */
export const emptyDashboard = (): DashboardResult => ({
  generatedAt: COMPLETED_AT,
  today: { date: '2026-08-27', overdue: [], dueToday: [], inProgress: [] },
  upcoming: { days: 7, throughDate: '2026-09-03', tasks: [] },
  activeProjects: [],
  recentProgress: { days: 7, sinceDate: '2026-08-21', tasks: [] },
  dailyDigest: {
    lines: ['Nothing is scheduled for today.'],
    source: 'prototype',
    generatedAt: COMPLETED_AT,
  },
  funFact: 'Writing a task down makes you roughly twice as likely to finish it.',
  recentAgentActivity: [],
});

/** An `IdentityProvider` that answers whatever the spec hands it. */
export const fakeIdentityProvider = (identity: Identity | GatewayError) => ({
  getCurrentIdentity: () =>
    identity instanceof GatewayError ? Promise.reject(identity) : Promise.resolve(identity),
});
