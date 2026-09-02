import { PrototypeDocumentSchema, type Reflection, type Task } from '@cwm/contracts';
import { PERSONAS, SEED_NOW } from '@cwm/prototype-data';
import { beforeEach, describe, expect, it } from 'vitest';
import { PermissionDeniedError } from './errors';
import { WorkspaceService } from './workspace-service';
import { DAY_MS } from './calendar';
import { agentActorFor, buildHarness, MINE, THEIRS } from '../test/test-support';

const at = (offsetDays: number): string => new Date(Date.parse(SEED_NOW) + offsetDays * DAY_MS).toISOString();

const task = (id: string, projectId: string, title: string, extra: Partial<Task> = {}): Task =>
  PrototypeDocumentSchema.shape.tasks.element.parse({
    id,
    projectId,
    sectionId: `section-${projectId}-tasks`,
    title,
    status: 'todo',
    priority: 'medium',
    createdAt: '2026-08-01T16:00:00.000Z',
    updatedAt: '2026-08-01T16:00:00.000Z',
    ...extra,
  });

const reflection = (id: string, projectId: string, body: string, extra: Partial<Reflection> = {}): Reflection =>
  PrototypeDocumentSchema.shape.reflections.element.parse({
    id,
    projectId,
    sectionId: `section-${projectId}-reflections`,
    body,
    createdAt: '2026-08-01T16:00:00.000Z',
    updatedAt: '2026-08-01T16:00:00.000Z',
    ...extra,
  });

/**
 * `workspace.read` and nothing else — the grant §53's grid offers on its own, and the whole
 * reason this service exists rather than the tools composing the checked services.
 */
const reader = agentActorFor(0, ['workspace.read']);
const stranger = agentActorFor(0, ['projects.read', 'tasks.read', 'reflections.read']);

describe('WorkspaceService', () => {
  let harness: ReturnType<typeof buildHarness>;
  let service: WorkspaceService;

  beforeEach(async () => {
    harness = buildHarness();
    service = harness.workspaceService;

    // Both workspaces get matching content, so every scoping assertion has a real foreign
    // row to fail against rather than an empty one.
    await harness.tasks.insert(task('task-retry-budget', MINE, 'Add retry budget to the sync job', { dueAt: at(1) }));
    await harness.tasks.insert(task('task-retry-docs', MINE, 'Write it up', { description: 'Covers the RETRY path', dueAt: at(3) }));
    await harness.tasks.insert(task('task-overdue', MINE, 'Triage the overnight errors', { dueAt: at(-2) }));
    await harness.tasks.insert(task('task-far', MINE, 'Something later', { dueAt: at(30) }));
    await harness.tasks.insert(task('task-done', MINE, 'Retry the finished thing', { status: 'done', completedAt: at(-1), dueAt: at(1) }));
    await harness.tasks.insert(task('task-archived', MINE, 'Retry the archived thing', { archivedAt: at(-1), dueAt: at(1) }));
    await harness.tasks.insert(task('task-theirs', THEIRS, 'Their retry work', { dueAt: at(1) }));

    await harness.reflections.insert(reflection('reflection-mine', MINE, 'The retry budget was the wrong shape.', { title: 'Grants drift' }));
    await harness.reflections.insert(reflection('reflection-untitled', MINE, 'A retry note with no title at all.'));
    await harness.reflections.insert(reflection('reflection-theirs', THEIRS, 'Their retry reflection.'));
  });

  const ids = (hits: { id: string }[]): string[] => hits.map(({ id }) => id);

  describe('search', () => {
    it('matches projects by name, tasks by title, and reflections by body', async () => {
      const projects = await service.search(reader, { query: 'project-mine', limit: 20 });
      expect(ids(projects.hits)).toContain(MINE);

      const { hits } = await service.search(reader, { query: 'retry', limit: 20 });
      expect(hits.some(({ kind }) => kind === 'task')).toBe(true);
      expect(hits.some(({ kind }) => kind === 'reflection')).toBe(true);
    });

    it('is case-insensitive and matches description substrings', async () => {
      const { hits } = await service.search(reader, { query: 'retry path', limit: 20 });
      expect(ids(hits)).toEqual(['task-retry-docs']);
    });

    it('returns an untitled reflection as a hit with no title', async () => {
      const { hits } = await service.search(reader, { query: 'no title at all', limit: 20 });
      expect(hits).toEqual([
        { kind: 'reflection', id: 'reflection-untitled', projectId: MINE, projectName: 'Project project-mine' },
      ]);
    });

    it('omits projectId and projectName on a project hit, which would only repeat itself', async () => {
      const { hits } = await service.search(reader, { query: 'project-mine', limit: 20 });
      expect(hits[0]).toEqual({ kind: 'project', id: MINE, title: 'Project project-mine', status: 'active' });
    });

    it('excludes an archived task from a live project', async () => {
      // Split from the archived-*project* case deliberately: archiving the project removes
      // every fixture row at once, so one test asserting `[]` cannot tell the two rules
      // apart. `task-archived` matches "retry" and its project is untouched.
      const { hits } = await service.search(reader, { query: 'retry', limit: 20 });

      expect(ids(hits)).not.toContain('task-archived');
      expect(ids(hits)).toContain('task-retry-budget');
    });

    it('excludes everything inside an archived project', async () => {
      await harness.projectService.archive(harness.actor, MINE);

      const { hits } = await service.search(reader, { query: 'retry', limit: 20 });
      expect(ids(hits)).toEqual([]);
    });

    it('omits a blank reflection title rather than emitting an empty one', async () => {
      // `ReflectionSchema.title` has no `min(1)`, so `''` is storable and `add_reflection`
      // can create it. A hit carrying `title: ""` would be noise; a hit schema stricter
      // than the record it projects would fail the *whole* result.
      await harness.reflections.insert(reflection('reflection-blank', MINE, 'A retry with a blank title.', { title: '' }));

      const { hits } = await service.search(reader, { query: 'blank title', limit: 20 });

      expect(hits).toEqual([
        { kind: 'reflection', id: 'reflection-blank', projectId: MINE, projectName: 'Project project-mine' },
      ]);
    });

    it('never returns another workspace’s project, task or reflection', async () => {
      const { hits } = await service.search(reader, { query: 'retry', limit: 20 });

      expect(ids(hits)).not.toContain('task-theirs');
      expect(ids(hits)).not.toContain('reflection-theirs');
      expect(hits.every(({ projectId }) => projectId === undefined || projectId === MINE)).toBe(true);
    });

    it('orders by kind, then title — asserted as a sequence, not as “the same twice”', async () => {
      // Two identical calls agreeing proves only determinism, which an unsorted
      // implementation also has. The exact sequence is what pins the comparator.
      const { hits } = await service.search(reader, { query: 'retry', limit: 20 });

      expect(ids(hits)).toEqual([
        // Tasks by title: "Add retry budget…", "Retry the finished thing", "Write it up".
        'task-retry-budget',
        'task-done',
        'task-retry-docs',
        // Then reflections, the untitled one first — an absent title sorts as empty.
        'reflection-untitled',
        'reflection-mine',
      ]);
    });

    it('shares a small limit across kinds instead of letting one starve the rest', async () => {
      // The reason this matters: §40 justifies one combined search precisely because the
      // caller does not know which kind holds the answer. Slicing a kind-ordered list would
      // return three tasks and no reflections here.
      const { hits } = await service.search(reader, { query: 'retry', limit: 2 });

      expect(hits).toHaveLength(2);
      expect(new Set(hits.map(({ kind }) => kind))).toEqual(new Set(['task', 'reflection']));
    });

    it('succeeds for an agent holding workspace.read and nothing else', async () => {
      await expect(service.search(reader, { query: 'retry', limit: 20 })).resolves.toBeDefined();
    });

    it('denies an agent without workspace.read, however much else it holds', async () => {
      await expect(service.search(stranger, { query: 'retry', limit: 20 })).rejects.toThrow(PermissionDeniedError);
    });
  });

  describe('upcomingWork', () => {
    it('splits overdue from upcoming against the injected clock', async () => {
      const { overdue, upcoming } = await service.upcomingWork(reader, { days: 7, limit: 50 });

      expect(ids(overdue)).toEqual(['task-overdue']);
      expect(ids(upcoming)).toEqual(['task-retry-budget', 'task-retry-docs']);
    });

    it('moves the split when the clock moves', async () => {
      harness.clock.setNow(new Date(Date.parse(SEED_NOW) + 2 * DAY_MS));

      const { overdue } = await service.upcomingWork(reader, { days: 7, limit: 50 });

      expect(ids(overdue)).toEqual(['task-overdue', 'task-retry-budget']);
    });

    it('includes a task due today and excludes one past the window’s last day', async () => {
      await harness.tasks.insert(task('task-today', MINE, 'Due later today', { dueAt: at(0.2) }));

      const { upcoming, throughDate } = await service.upcomingWork(reader, { days: 3, limit: 50 });

      expect(ids(upcoming)).toEqual(['task-today', 'task-retry-budget']);
      expect(throughDate).toBe('2026-08-26');
    });

    it('excludes done, archived and foreign tasks', async () => {
      const { overdue, upcoming } = await service.upcomingWork(reader, { days: 90, limit: 50 });
      const all = ids([...overdue, ...upcoming]);

      expect(all).not.toContain('task-done');
      expect(all).not.toContain('task-archived');
      expect(all).not.toContain('task-theirs');
    });

    it('honours limit per bucket', async () => {
      const { upcoming } = await service.upcomingWork(reader, { days: 90, limit: 1 });

      expect(ids(upcoming)).toEqual(['task-retry-budget']);
    });

    it('agrees with the dashboard on which tasks are overdue', async () => {
      const dashboard = await harness.dashboardService.load(reader, {});
      const { overdue } = await service.upcomingWork(reader, { days: 7, limit: 50 });

      expect(ids(overdue)).toEqual(ids(dashboard.today.overdue));
    });

    it('succeeds for an agent holding workspace.read and nothing else', async () => {
      await expect(service.upcomingWork(reader, { days: 7, limit: 50 })).resolves.toBeDefined();
    });

    it('denies an agent without workspace.read', async () => {
      await expect(service.upcomingWork(stranger, { days: 7, limit: 50 })).rejects.toThrow(PermissionDeniedError);
    });
  });

  it('scopes to the actor’s workspace, not to the personas the document happens to hold', async () => {
    const theirs = agentActorFor(1, ['workspace.read']);

    const { hits } = await service.search(theirs, { query: 'retry', limit: 20 });

    expect(ids(hits)).toEqual(['task-theirs', 'reflection-theirs']);
    expect(PERSONAS[1]!.workspace.id).not.toBe(PERSONAS[0]!.workspace.id);
  });
});

