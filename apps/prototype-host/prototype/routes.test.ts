import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrototypeStateSchema, PrototypeNotesFileSchema, ProjectSchema } from '@cwm/contracts';
import { SimulatedClock, PrototypeAIProvider } from '@cwm/domain';
import { JsonDataStore } from '@cwm/repositories';
import { buildSeed } from '@cwm/prototype-data';
import { afterEach, describe, expect, it } from 'vitest';
import { createApi } from '../api/services.ts';
import { createApiRoutes } from '../api/routes.ts';
import { loadPersistence } from '../persistence/store.ts';
import { resolveRoute, type RouteTable } from '../router.ts';
import { createPrototypeRoutes } from './routes.ts';
import { PrototypeRuntime } from './runtime.ts';
import { SwitchableAIProvider } from './switchable-ai-provider.ts';

/**
 * §71 makes the host's HTTP implementation deliberately disposable, so this is one smoke
 * test per route rather than an exhaustive matrix. What it does insist on is the two
 * things the panel's value depends on: a seed swap that a *later* request can see, and a
 * clock that reaches the domain.
 */
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const harness = async (seed = 'busy-week') => {
  const directory = await mkdtemp(join(tmpdir(), 'cwm-prototype-routes-'));
  directories.push(directory);
  const path = join(directory, 'data.json');
  await writeFile(path, `${JSON.stringify(buildSeed(seed as 'busy-week'), null, 2)}\n`, 'utf8');

  const persistence = await loadPersistence(path);
  const clock = new SimulatedClock();
  const ai = new SwitchableAIProvider(new PrototypeAIProvider());
  const runtime = new PrototypeRuntime({ persistence, clock, ai, seed });
  const routes: RouteTable = {
    ...createPrototypeRoutes(runtime, { path: join(directory, 'notes.json') }),
    ...createApiRoutes(createApi(persistence, { clock, ai })),
  };
  return { routes, path, clock, runtime, notesPath: join(directory, 'notes.json') };
};

const persona = (routes: RouteTable, method: string, path: string, body?: unknown) =>
  resolveRoute(routes, method, path, {
    query: new URLSearchParams(),
    headers: { 'x-prototype-user': 'user-demo' },
    body,
  });

describe('GET /prototype/state', () => {
  it('reports the seed, the simulated clock and the document’s personas', async () => {
    const { routes } = await harness();

    const result = await persona(routes, 'GET', '/prototype/state');

    const state = PrototypeStateSchema.parse(result.body);
    expect(state.seed).toBe('busy-week');
    expect(state.seeds).toContain('overdue-chaos');
    expect(state.aiProvider).toBe('mock');
    expect(state.clockOffsetMs).toBe(0);
    expect(state.personas.map(({ id }) => id)).toContain('user-demo');
  });
});

describe('POST /prototype/seed', () => {
  // The point of the whole slice: a later request sees the new seed, with no restart.
  it('swaps the document a subsequent API read answers from, and rewrites the file', async () => {
    const { routes, path } = await harness('busy-week');
    const before = await persona(routes, 'GET', '/api/projects');

    await persona(routes, 'POST', '/prototype/seed', { seed: 'personal-workspace' });

    const after = await persona(routes, 'GET', '/api/projects');
    const names = (result: { body: unknown }) => ProjectSchema.array().parse(result.body).map((project) => project.name);
    expect(names(after)).not.toEqual(names(before));
    expect(names(after)).toContain('Personal workspace');

    const onDisk = JSON.parse(await readFile(path, 'utf8')) as { projects: unknown[] };
    expect(onDisk.projects).toHaveLength(1);
  });

  it('refuses an unknown seed with a 400 and changes nothing', async () => {
    const { routes } = await harness('busy-week');

    const result = await persona(routes, 'POST', '/prototype/seed', { seed: 'not-a-seed' });

    expect(result.status).toBe(400);
    expect(PrototypeStateSchema.parse((await persona(routes, 'GET', '/prototype/state')).body).seed).toBe('busy-week');
  });
});

describe('POST /prototype/clock', () => {
  it('moves the clock the domain writes with, and returns to real time on null', async () => {
    const { routes, clock } = await harness();

    await persona(routes, 'POST', '/prototype/clock', { now: '2026-12-25T09:00:00.000Z' });
    const created = await persona(routes, 'POST', '/api/tasks', {
      projectId: ProjectSchema.array().parse((await persona(routes, 'GET', '/api/projects')).body)[0]?.id,
      title: 'Written on the simulated day',
    });

    expect((created.body as { createdAt: string }).createdAt.slice(0, 10)).toBe('2026-12-25');

    await persona(routes, 'POST', '/prototype/clock', { now: null });
    expect(clock.offset).toBe(0);
  });

  it('rejects a non-instant at the route, not merely in the schema', async () => {
    const { routes } = await harness();

    expect((await persona(routes, 'POST', '/prototype/clock', { now: 'next friday' })).status).toBe(400);
    // §11's contract is UTC-only: a local offset is not an instant the prototype accepts.
    expect((await persona(routes, 'POST', '/prototype/clock', { now: '2026-12-25T09:00:00+02:00' })).status).toBe(400);
  });
});

describe('POST /prototype/ai-provider', () => {
  it('swaps the delegate the already-wired services hold', async () => {
    const { routes } = await harness();

    const result = await persona(routes, 'POST', '/prototype/ai-provider', { provider: 'real' });

    expect(PrototypeStateSchema.parse(result.body).aiProvider).toBe('real');
    // §44's adapter is a stub that rejects, so the dashboard read fails as a whole.
    expect((await persona(routes, 'GET', '/api/dashboard')).status).toBe(500);

    await persona(routes, 'POST', '/prototype/ai-provider', { provider: 'mock' });
    expect((await persona(routes, 'GET', '/api/dashboard')).status).toBe(200);
  });
});

describe('POST /prototype/reset', () => {
  it('loads the default seed and returns the clock to real time (§76)', async () => {
    const { routes } = await harness('overdue-chaos');
    await persona(routes, 'POST', '/prototype/clock', { now: '2026-12-25T09:00:00.000Z' });

    const result = await persona(routes, 'POST', '/prototype/reset');

    const state = PrototypeStateSchema.parse(result.body);
    expect(state.seed).toBe('personal-workspace');
    expect(state.clockOffsetMs).toBe(0);
  });
});

describe('POST /prototype/notes', () => {
  it('appends a note stamped with real time, even when the clock has been moved', async () => {
    const { routes, notesPath } = await harness();
    await persona(routes, 'POST', '/prototype/clock', { now: '2027-06-01T09:00:00.000Z' });

    const result = await persona(routes, 'POST', '/prototype/notes', {
      note: 'The seed control needs a confirmation step.',
      route: '/projects/project-launch',
      projectId: 'project-launch',
      slice: 12,
    });

    expect(result.status).toBe(201);
    const { notes } = PrototypeNotesFileSchema.parse(JSON.parse(await readFile(notesPath, 'utf8')));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ route: '/projects/project-launch', projectId: 'project-launch', slice: 12 });
    // The simulated clock says 2027; the note must not.
    expect(notes[0]!.createdAt.slice(0, 4)).toBe(String(new Date().getUTCFullYear()));
  });

  it('preserves every existing entry, including a hand-written slice field', async () => {
    const { routes, notesPath } = await harness();
    const existing = {
      notes: [
        { id: 'note-2026-08-26-001', createdAt: '2026-08-26T21:30:00.000Z', route: null, projectId: null, slice: 1, note: 'First' },
        { id: 'note-2026-08-27-001', createdAt: '2026-08-27T09:00:00.000Z', route: '/app', projectId: null, slice: 11, note: 'Second' },
      ],
    };
    await writeFile(notesPath, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');

    await persona(routes, 'POST', '/prototype/notes', { note: 'Third', route: '/app', projectId: null });

    const { notes } = PrototypeNotesFileSchema.parse(JSON.parse(await readFile(notesPath, 'utf8')));
    expect(notes).toHaveLength(3);
    expect(notes.slice(0, 2)).toEqual(existing.notes);
  });

  it('rejects an empty note', async () => {
    const { routes } = await harness();

    expect((await persona(routes, 'POST', '/prototype/notes', { note: '', route: null, projectId: null })).status).toBe(400);
  });

  // 26 KB of hand-written observations must never be replaced by a one-entry file.
  it('refuses to overwrite a notes file it cannot parse', async () => {
    const { routes, notesPath } = await harness();
    await writeFile(notesPath, '{"notes": "not an array"}', 'utf8');

    expect((await persona(routes, 'POST', '/prototype/notes', { note: 'Third', route: null, projectId: null })).status).toBe(500);
    expect(await readFile(notesPath, 'utf8')).toBe('{"notes": "not an array"}');
  });
});

describe('the seed swap and the store', () => {
  it('leaves the data file loadable by a fresh store — the restart path still works', async () => {
    const { routes, path } = await harness('busy-week');

    await persona(routes, 'POST', '/prototype/seed', { seed: 'nested-projects' });

    const reloaded = await JsonDataStore.load(path);
    expect(reloaded.snapshot().projects.length).toBeGreaterThan(1);
  });
});
