import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { createApiRouteTable } from './api/services.ts';
import { start, stop } from './main.ts';
import { loadPersistence } from './persistence/store.ts';

const seedPath = fileURLToPath(new URL('../../prototype/seeds/personal-workspace.json', import.meta.url));
const started: Array<Awaited<ReturnType<typeof start>>> = [];
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(started.splice(0).map((server) => stop(server)));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/**
 * A real `JsonDataStore` over a real file, not an in-memory one. That matters: with an
 * in-memory store `persist()` finishes inside a single task, so five "concurrent"
 * requests never actually overlap and this suite would pass with no serialization at
 * all. Real file I/O keeps a unit of work open across ticks, which is the condition
 * `runUnitOfWork` refuses — so the serializing adapter is genuinely under test here.
 */
const startApi = async () => {
  const root = await mkdtemp(join(tmpdir(), 'cwm-host-concurrency-'));
  roots.push(root);
  const path = join(root, 'data.json');
  await copyFile(seedPath, path);

  const persistence = await loadPersistence(path);
  const server = await start(0, createApiRouteTable(persistence));
  started.push(server);

  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const projects = (await (await fetch(`${base}/api/projects`)).json()) as Array<{ id: string }>;
  return { base, projectId: projects[0]!.id, path };
};

describe('concurrent writes', () => {
  it('does not lose an update when five creates arrive at once', async () => {
    const { base, projectId } = await startApi();

    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        fetch(`${base}/api/tasks`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ projectId, title: `Concurrent ${index}` }),
        }),
      ),
    );
    const created = (await Promise.all(responses.map((response) => response.json()))) as Array<{ id: string }>;

    expect(responses.map((response) => response.status)).toEqual([201, 201, 201, 201, 201]);
    expect(new Set(created.map((task) => task.id)).size).toBe(5);

    const listed = (await (
      await fetch(`${base}/api/tasks?projectId=${projectId}&search=Concurrent`)
    ).json()) as unknown[];
    expect(listed).toHaveLength(5);
  });

  it('answers 400 for a malformed JSON body rather than 500', async () => {
    const { base } = await startApi();

    const response = await fetch(`${base}/api/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"title":',
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'invalid_request' });
  });

  it('accepts a bodyless POST to complete, the way curl -X POST sends it', async () => {
    const { base, projectId } = await startApi();
    const created = (await (
      await fetch(`${base}/api/tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, title: 'Configure deployment' }),
      })
    ).json()) as { id: string };

    const response = await fetch(`${base}/api/tasks/${created.id}/complete`, { method: 'POST' });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'done' });
  });
});
