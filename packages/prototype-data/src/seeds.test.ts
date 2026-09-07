import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrototypeDocumentSchema, ownedKindOf, type PrototypeDocument } from '@cwm/contracts';
import { InMemoryDataStore } from '@cwm/repositories';
import { afterEach, describe, expect, it } from 'vitest';
import { PERSONAS } from './personas';
import { SEED_NAMES, SEED_NOW, buildSeed } from './seeds';
import { type SeedFileOperations, writeSeedFile } from './seed-cli';

const seedSnapshotsDirectory = fileURLToPath(new URL('../../../prototype/seeds/', import.meta.url));
const temporaryRoots: string[] = [];

const makeTemporaryRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'cwm-seed-test-'));
  temporaryRoots.push(root);
  return root;
};

const serialized = (document: PrototypeDocument): string => `${JSON.stringify(document, null, 2)}\n`;

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('seed registry and validation', () => {
  it('exposes exactly the six seed names §16 asks the prototype for so far', () => {
    expect(SEED_NAMES).toEqual([
      'empty',
      'personal-workspace',
      'busy-week',
      'nested-projects',
      'overdue-chaos',
      'agent-heavy',
    ]);
  });

  it.each(SEED_NAMES)('builds %s as a valid isolated prototype document', (seedName) => {
    const document = buildSeed(seedName);
    expect(() => PrototypeDocumentSchema.parse(document)).not.toThrow();
    expect(() => new InMemoryDataStore(document)).not.toThrow();

    document.users[0]!.preferences.dashboardWidgets[0]!.config = { contaminated: true };
    expect(buildSeed(seedName)).not.toEqual(document);
  });

  it('protects the exported persona templates from contaminating future builds', () => {
    const mutablePersona = PERSONAS[0] as unknown as { user: { name: string } };
    const originalName = mutablePersona.user.name;
    let mutationError: unknown;
    try {
      mutablePersona.user.name = 'Contaminated';
    } catch (error: unknown) {
      mutationError = error;
    }
    if (mutationError === undefined) mutablePersona.user.name = originalName;

    expect(mutationError).toBeInstanceOf(TypeError);
    expect(buildSeed('empty').users[0]!.name).toBe('Demo User');
  });

  it.each(SEED_NAMES)('matches the committed %s snapshot', async (seedName) => {
    const snapshot = await readFile(join(seedSnapshotsDirectory, `${seedName}.json`), 'utf8');
    expect(snapshot).toBe(serialized(buildSeed(seedName)));
  });

  it.each(SEED_NAMES)('includes all isolated personas in %s', (seedName) => {
    const document = buildSeed(seedName);
    expect(document.users.map(({ name }) => name)).toEqual(['Demo User', 'Alex', 'Sam']);
    expect(document.users.every(({ avatar }) => avatar !== undefined)).toBe(true);
    expect(new Set(document.users.map(({ id }) => id)).size).toBe(3);
    expect(new Set(document.users.map(({ workspaceId }) => workspaceId)).size).toBe(3);
    expect(new Set(document.users.map(({ preferences }) => JSON.stringify(preferences))).size).toBe(3);

    for (const persona of PERSONAS) {
      expect(document.users).toContainEqual(persona.user);
      expect(document.workspaces).toContainEqual(persona.workspace);
      expect(persona.workspace.ownerUserId).toBe(persona.user.id);
      expect(persona.user.workspaceId).toBe(persona.workspace.id);
    }
  });
});

describe('seed scenarios', () => {
  it('builds an actually empty work state', () => {
    const { schemaVersion: _schemaVersion, users: _users, workspaces: _workspaces, ...work } = buildSeed('empty');
    expect(Object.values(work).every((collection) => collection.length === 0)).toBe(true);
  });

  it('builds the default personal workspace', () => {
    const document = buildSeed('personal-workspace');
    const demoWorkspaceId = PERSONAS[0].workspace.id;
    const demoProjects = document.projects.filter(({ workspaceId }) => workspaceId === demoWorkspaceId);

    expect(demoProjects.length).toBeGreaterThanOrEqual(1);
    expect(document.tasks.some(({ projectId }) => demoProjects.some(({ id }) => id === projectId))).toBe(true);
  });

  it('builds a realistic busy week', () => {
    const document = buildSeed('busy-week');
    const demoWorkspaceId = PERSONAS[0].workspace.id;
    const demoProjectIds = new Set(
      document.projects.filter(({ workspaceId }) => workspaceId === demoWorkspaceId).map(({ id }) => id),
    );
    const tasks = document.tasks.filter(({ projectId }) => demoProjectIds.has(projectId));
    const now = Date.parse(SEED_NOW);

    expect(demoProjectIds.size).toBeGreaterThanOrEqual(3);
    expect(tasks.length).toBeGreaterThanOrEqual(7);
    expect(new Set(tasks.map(({ status }) => status)).size).toBeGreaterThan(2);
    expect(new Set(tasks.map(({ priority }) => priority)).size).toBeGreaterThan(1);
    expect(tasks.some(({ dueAt }) => dueAt !== undefined && Date.parse(dueAt) < now)).toBe(true);
    expect(tasks.some(({ dueAt }) => dueAt !== undefined && Date.parse(dueAt) > now)).toBe(true);
  });

  it('makes the busy-week launch canvas exercise every Slice 10 section and timeline input', () => {
    const document = buildSeed('busy-week');
    const launch = document.projects.find(({ name }) => name === 'Website launch');

    expect(launch).toMatchObject({ targetDate: '2026-08-28', progressFormula: 'weighted' });
    expect(
      document.projects.some(
        ({ parentProjectId, targetDate }) => parentProjectId === launch?.id && targetDate !== undefined,
      ),
    ).toBe(true);
    expect(
      document.sections
        .filter(({ projectId }) => projectId === launch?.id)
        .sort((left, right) => left.position - right.position)
        .map(({ type }) => type),
    ).toEqual(['rich-text', 'task-list', 'sub-projects', 'progress', 'reflections', 'timeline']);

    const launchTasks = document.tasks.filter(({ projectId }) => projectId === launch?.id);
    expect(launchTasks.some(({ estimate }) => estimate !== undefined && estimate > 0)).toBe(true);
    expect(launchTasks.some(({ startAt, dueAt }) => startAt !== undefined && dueAt !== undefined)).toBe(true);
    expect(document.reflections.some(({ projectId }) => projectId === launch?.id)).toBe(true);
    expect(
      document.milestones.some(({ projectId, targetDate }) => projectId === launch?.id && targetDate !== undefined),
    ).toBe(true);
  });

  it('builds a finite three-level nested project hierarchy', () => {
    const document = buildSeed('nested-projects');
    const projects = new Map(document.projects.map((project) => [project.id, project]));
    expect(
      document.projects.some((project) => {
        const parent = project.parentProjectId === undefined ? undefined : projects.get(project.parentProjectId);
        return parent?.parentProjectId !== undefined;
      }),
    ).toBe(true);

    for (const project of document.projects) {
      const visited = new Set<string>();
      let current: typeof project | undefined = project;
      while (current !== undefined) {
        expect(visited.has(current.id), `cycle at ${current.id}`).toBe(false);
        visited.add(current.id);
        current = current.parentProjectId === undefined ? undefined : projects.get(current.parentProjectId);
      }
    }
  });

  it('makes the nested-projects renovation canvas exercise hierarchy and derived timeline inputs', () => {
    const document = buildSeed('nested-projects');
    const renovation = document.projects.find(({ name }) => name === 'Home renovation');
    const descendants = document.projects.filter(({ parentProjectId }) => parentProjectId === renovation?.id);

    expect(descendants.length).toBeGreaterThanOrEqual(2);
    expect(descendants.some(({ targetDate }) => targetDate !== undefined)).toBe(true);
    expect(
      document.projects.some(({ parentProjectId }) =>
        descendants.some(({ id }) => id === parentProjectId),
      ),
    ).toBe(true);
    expect(
      document.sections
        .filter(({ projectId }) => projectId === renovation?.id)
        .sort((left, right) => left.position - right.position)
        .map(({ type }) => type),
    ).toEqual(['rich-text', 'task-list', 'sub-projects', 'progress', 'reflections', 'timeline']);
    expect(
      document.tasks.some(
        ({ projectId, startAt, dueAt }) =>
          descendants.some(({ id }) => id === projectId) && startAt !== undefined && dueAt !== undefined,
      ),
    ).toBe(true);
    expect(
      document.milestones.some(
        ({ projectId, targetDate }) =>
          [renovation?.id, ...descendants.map(({ id }) => id)].includes(projectId) && targetDate !== undefined,
      ),
    ).toBe(true);
    expect(document.reflections.some(({ projectId }) => projectId === renovation?.id)).toBe(true);
  });

  it('builds overdue chaos with several incomplete overdue tasks', () => {
    const document = buildSeed('overdue-chaos');
    const now = Date.parse(SEED_NOW);
    const overdue = document.tasks.filter(
      ({ dueAt, status }) => dueAt !== undefined && Date.parse(dueAt) < now && !['done', 'cancelled'].includes(status),
    );

    expect(overdue.length).toBeGreaterThanOrEqual(4);
    expect(document.tasks.some(({ dueAt, status }) => dueAt !== undefined && Date.parse(dueAt) < now && status === 'done')).toBe(true);
    expect(document.tasks.some(({ dueAt }) => dueAt !== undefined && Date.parse(dueAt) > now)).toBe(true);
  });
});

describe('seed file writer', () => {
  it('writes a selected seed through temp then rename', async () => {
    const root = await makeTemporaryRoot();
    const targetPath = join(root, '.prototype', 'data.json');
    const calls: string[] = [];
    const operations: SeedFileOperations = {
      mkdir: async (path, options) => {
        calls.push(`mkdir:${path}`);
        await mkdir(path, options);
      },
      writeFile: async (path, data, encoding) => {
        calls.push(`write:${path}`);
        await writeFile(path, data, encoding);
      },
      rename: async (from, to) => {
        calls.push(`rename:${from}:${to}`);
        await rename(from, to);
      },
    };

    await writeSeedFile('busy-week', { targetPath, fileOperations: operations });

    expect(calls).toEqual([
      `mkdir:${dirname(targetPath)}`,
      `write:${targetPath}.tmp`,
      `rename:${targetPath}.tmp:${targetPath}`,
    ]);
    expect(PrototypeDocumentSchema.parse(JSON.parse(await readFile(targetPath, 'utf8')))).toEqual(buildSeed('busy-week'));
    await expect(readFile(`${targetPath}.tmp`, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('writes the reset default identically to personal-workspace', async () => {
    const root = await makeTemporaryRoot();
    const resetPath = join(root, 'reset', 'data.json');
    const explicitPath = join(root, 'explicit', 'data.json');

    await writeSeedFile(undefined, { targetPath: resetPath });
    await writeSeedFile('personal-workspace', { targetPath: explicitPath });

    expect(await readFile(resetPath, 'utf8')).toBe(await readFile(explicitPath, 'utf8'));
  });

  it('rejects an unknown seed before mutating the current file', async () => {
    const root = await makeTemporaryRoot();
    const targetPath = join(root, 'data.json');
    await writeFile(targetPath, 'keep me', 'utf8');

    await expect(writeSeedFile('does-not-exist', { targetPath })).rejects.toThrow(
      /does-not-exist.*empty.*personal-workspace.*busy-week.*nested-projects.*overdue-chaos.*agent-heavy/s,
    );
    expect(await readFile(targetPath, 'utf8')).toBe('keep me');
  });

  it('creates a missing target directory', async () => {
    const root = await makeTemporaryRoot();
    const targetPath = join(root, 'missing', '.prototype', 'data.json');

    await writeSeedFile('empty', { targetPath });

    expect(PrototypeDocumentSchema.parse(JSON.parse(await readFile(targetPath, 'utf8')))).toEqual(buildSeed('empty'));
  });

  it('keeps the live file intact when the temporary write fails', async () => {
    const root = await makeTemporaryRoot();
    const targetPath = join(root, 'data.json');
    await writeFile(targetPath, 'original', 'utf8');
    let renamed = false;
    const operations: SeedFileOperations = {
      mkdir,
      writeFile: async (path, data, encoding) => {
        await writeFile(path, String(data).slice(0, 20), encoding);
        throw new Error('interrupted temp write');
      },
      rename: async () => {
        renamed = true;
      },
    };

    await expect(writeSeedFile('busy-week', { targetPath, fileOperations: operations })).rejects.toThrow(
      'interrupted temp write',
    );
    expect(renamed).toBe(false);
    expect(await readFile(targetPath, 'utf8')).toBe('original');
  });

  it('keeps the live file intact when rename fails after a complete temp write', async () => {
    const root = await makeTemporaryRoot();
    const targetPath = join(root, 'data.json');
    await writeFile(targetPath, 'original', 'utf8');
    const operations: SeedFileOperations = {
      mkdir,
      writeFile,
      rename: async () => {
        throw new Error('interrupted rename');
      },
    };

    await expect(writeSeedFile('busy-week', { targetPath, fileOperations: operations })).rejects.toThrow(
      'interrupted rename',
    );
    expect(await readFile(targetPath, 'utf8')).toBe('original');
    expect(await readFile(`${targetPath}.tmp`, 'utf8')).toBe(serialized(buildSeed('busy-week')));
  });
});

describe('seeded project canvases (§30)', () => {
  const sectionsByProject = (document: PrototypeDocument) => {
    const grouped = new Map<string, typeof document.sections>();
    for (const section of document.sections) {
      grouped.set(section.projectId, [...(grouped.get(section.projectId) ?? []), section]);
    }
    return grouped;
  };

  it.each(['personal-workspace', 'busy-week', 'nested-projects', 'overdue-chaos', 'agent-heavy'] as const)(
    '%s gives every seeded canvas a rich-text brief above its task list',
    (seedName) => {
      const document = buildSeed(seedName);

      expect(document.sections.length).toBeGreaterThan(0);
      for (const sections of sectionsByProject(document).values()) {
        expect(sections.slice(0, 2).map((section) => [section.type, section.position])).toEqual([
          ['rich-text', 0],
          ['task-list', 1],
        ]);
      }
    },
  );

  it.each(SEED_NAMES)('%s numbers sections densely within each project', (seedName) => {
    for (const sections of sectionsByProject(buildSeed(seedName)).values()) {
      // A gap or a repeat has no meaning the canvas could render.
      expect([...sections].map((section) => section.position).sort()).toEqual(sections.map((_, index) => index));
    }
  });

  it('leaves one nested project without a canvas, so the empty state is reachable', () => {
    const document = buildSeed('nested-projects');

    const withoutSections = document.projects.filter(
      (project) => !document.sections.some((section) => section.projectId === project.id),
    );

    expect(withoutSections.map((project) => project.name)).toEqual(['Cabinets']);
  });
});

describe('agent-heavy', () => {
  const document = () => buildSeed('agent-heavy');

  it('gives the demo persona connections in every state §53 has to render', () => {
    const connections = document().agentConnections;

    expect(connections.map(({ id, revoked }) => [id, revoked])).toEqual([
      ['agent-claude', false],
      ['agent-cursor', false],
      ['agent-old', true],
    ]);
    // §53 shows "Last used"; a connection that has never been used is the other state,
    // and `lastUsedAt` is optional precisely so the seed can carry one.
    expect(connections.find(({ id }) => id === 'agent-cursor')?.lastUsedAt).toBeUndefined();
    expect(new Set(connections.map(({ userId }) => userId))).toEqual(new Set(['user-demo']));
  });

  it('separates read-only from read-write, so a denial is reachable without editing anything', () => {
    const byId = new Map<string, readonly string[]>(
      document().agentConnections.map((connection) => [connection.id, connection.permissions]),
    );

    expect(byId.get('agent-claude')).toContain('tasks.write');
    expect(byId.get('agent-cursor')).not.toContain('tasks.write');
    expect(byId.get('agent-cursor')).toContain('tasks.read');
  });

  it('records activity from all three actors, which is what §57 asks the feed to tell apart', () => {
    const actors = new Set(document().activityEvents.map(({ actor }) => actor));

    expect(actors).toEqual(new Set(['user', 'agent', 'system']));
  });

  it('attributes every agent event to a connection that exists in the same workspace', () => {
    const seed = document();
    const owners = new Map<string, string>(
      seed.agentConnections.map((connection) => [connection.id, connection.userId]),
    );
    const workspaces = new Map<string, string>(seed.users.map((user) => [user.id, user.workspaceId]));

    for (const event of seed.activityEvents.filter(({ actor }) => actor === 'agent')) {
      const owner = owners.get(event.actorAgentConnectionId ?? '');
      expect(owner).toBeDefined();
      expect(workspaces.get(owner!)).toBe(event.workspaceId);
    }
  });

  it('carries a Recent Activity section, so §30’s newest type has a seeded home', () => {
    expect(document().sections.map(({ type }) => type)).toContain('recent-activity');
  });
});

describe('seeded rows name the container that owns them', () => {
  it.each(SEED_NAMES)('%s resolves every sectionId to a container of the matching type', (seedName) => {
    const document = buildSeed(seedName);
    const sections = new Map(document.sections.map((section) => [section.id, section]));

    const rows = [
      ...document.tasks.map((task) => ({ kind: 'tasks', ...task })),
      ...document.reflections.map((reflection) => ({ kind: 'reflections', ...reflection })),
    ];

    for (const row of rows) {
      const owner = sections.get(row.sectionId);
      expect(owner, `${row.id} names a section that does not exist`).toBeDefined();
      // The denormalisation the decision accepts: a row's section must be in its project.
      expect(owner!.projectId, `${row.id} is owned across projects`).toBe(row.projectId);
      expect(ownedKindOf(owner!.type), `${row.id} is owned by a ${owner!.type}`).toBe(row.kind);
    }
  });

  it.each(SEED_NAMES)('%s leaves no project holding rows nothing renders', (seedName) => {
    const document = buildSeed(seedName);
    const containerless = document.projects.filter(
      (project) =>
        !document.sections.some((section) => section.projectId === project.id) &&
        [...document.tasks, ...document.reflections].some((row) => row.projectId === project.id),
    );

    expect(containerless.map((project) => project.name)).toEqual([]);
  });
});

/**
 * §26–27's ownership chain, asserted against the built seeds rather than trusted from the
 * builder's conventions — the same reason `sectionId` references are checked above.
 */
describe('seeded owner kinds and pages', () => {
  it.each(SEED_NAMES)('gives every project in %s exactly one canonical page', (seedName) => {
    const document = buildSeed(seedName);

    for (const project of document.projects) {
      const pages = document.projectPages.filter((page) => page.projectId === project.id);
      expect(pages).toEqual([
        expect.objectContaining({ kind: project.kind === 'root' ? 'home' : 'work', enabled: true }),
      ]);
    }
    expect(document.projectPages).toHaveLength(document.projects.length);
  });

  it.each(SEED_NAMES)('puts every section in %s on a page of its own project', (seedName) => {
    const document = buildSeed(seedName);
    const owners = new Map(document.projectPages.map((page) => [page.id, page.projectId]));

    for (const section of document.sections) {
      expect(owners.get(section.pageId)).toBe(section.projectId);
    }
  });

  it.each(SEED_NAMES)('derives %s owner kinds from the hierarchy', (seedName) => {
    for (const project of buildSeed(seedName).projects) {
      expect(project.kind).toBe(project.parentProjectId === undefined ? 'root' : 'subproject');
    }
  });

  it('reserves the shortcut collection empty until slice 25.8', () => {
    expect(buildSeed('nested-projects').sectionShortcuts).toEqual([]);
  });
});
