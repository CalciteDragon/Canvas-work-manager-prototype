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
    const created = (await Promise.all(responses.map((response) => response.json()))) as Array<{ task: { id: string } }>;

    expect(responses.map((response) => response.status)).toEqual([201, 201, 201, 201, 201]);
    expect(new Set(created.map(({ task }) => task.id)).size).toBe(5);

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
    ).json()) as { task: { id: string } };

    const response = await fetch(`${base}/api/tasks/${created.task.id}/complete`, { method: 'POST' });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ task: { status: 'done' } });
  });
});

/**
 * Slice 35: history transitions against the same real file store. `expectedRevision` is what makes
 * a race and a blind retry safe; the serializing unit of work is what makes them real races.
 */
describe('concurrent history transitions', () => {
  const json = { 'content-type': 'application/json' };

  /** A section update whose receipt the transitions below step. */
  const updatedSection = async (base: string, projectId: string) => {
    const created = (await (await fetch(`${base}/api/projects/${projectId}/sections`, {
      method: 'POST', headers: json, body: JSON.stringify({ type: 'rich-text', title: 'Before' }),
    })).json()) as { section: { id: string } };
    const updated = (await (await fetch(`${base}/api/sections/${created.section.id}`, {
      method: 'PATCH', headers: json, body: JSON.stringify({ title: 'After' }),
    })).json()) as { operation: { historyId: string; actionId: string; revision: number } };
    return { sectionId: created.section.id, receipt: updated.operation };
  };

  const undo = (base: string, receipt: { historyId: string; actionId: string }, expectedRevision: number) =>
    fetch(`${base}/api/history/${receipt.historyId}/transition`, {
      method: 'POST', headers: json, body: JSON.stringify({ actionId: receipt.actionId, direction: 'undo', expectedRevision }),
    });

  it('two transitions at one revision — exactly one advances, the other refuses stale with the current summary', async () => {
    const { base, projectId } = await startApi();
    const { sectionId, receipt } = await updatedSection(base, projectId);

    const responses = await Promise.all([undo(base, receipt, receipt.revision), undo(base, receipt, receipt.revision)]);
    const bodies = (await Promise.all(responses.map((response) => response.json()))) as Array<Record<string, unknown>>;

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    const refused = bodies[responses.findIndex(({ status }) => status === 409)] as { details: Record<string, unknown> };
    expect(refused.details).toMatchObject({
      reason: 'history_revision_stale',
      summary: { revision: receipt.revision + 1, redo: { actionId: receipt.actionId } },
    });
    const sections = (await (await fetch(`${base}/api/projects/${projectId}/sections`)).json()) as Array<{ id: string; title?: string }>;
    expect(sections.find(({ id }) => id === sectionId)?.title).toBe('Before');
  });

  it('a replayed transition refuses as stale and returns the current summary; nothing executes twice', async () => {
    const { base, projectId } = await startApi();
    const { receipt } = await updatedSection(base, projectId);
    const activity = async () => ((await (await fetch(`${base}/api/activity?projectId=${projectId}`)).json()) as unknown[]).length;

    // The first response is "lost": the caller never reads it, and sends the same request again.
    expect((await undo(base, receipt, receipt.revision)).status).toBe(200);
    const events = await activity();
    const replay = await undo(base, receipt, receipt.revision);

    expect(replay.status).toBe(409);
    // From the summary alone the caller can tell its first call landed: the revision moved and its action waits as Redo.
    expect(((await replay.json()) as { details: unknown }).details).toMatchObject({
      reason: 'history_revision_stale', summary: { revision: receipt.revision + 1, undo: { operation: 'section.add' }, redo: { actionId: receipt.actionId } },
    });
    expect(await activity()).toBe(events);
  });
});
