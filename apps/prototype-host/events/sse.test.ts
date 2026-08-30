import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { InMemoryDataStore } from '@cwm/repositories';
import { buildSeed } from '@cwm/prototype-data';
import type { WorkspaceId } from '@cwm/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { LiveEventHub } from './hub.ts';
import { createEventStreamHandler } from './sse.ts';

const WEB_ORIGIN = 'http://localhost:4200';

/** Enough of a Node response to watch what the handler writes and when it lets go. */
class FakeResponse extends EventEmitter {
  status = 0;
  headers: Record<string, string> = {};
  chunks: string[] = [];
  ended = false;

  writeHead(status: number, headers: Record<string, string>): this {
    this.status = status;
    this.headers = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
    return this;
  }

  write(chunk: string): boolean {
    this.chunks.push(chunk);
    return true;
  }

  end(chunk?: string): this {
    if (chunk !== undefined) this.chunks.push(chunk);
    this.ended = true;
    return this;
  }

  get body(): string {
    return this.chunks.join('');
  }
}

const requestFor = (url: string, method = 'GET'): IncomingMessage =>
  ({ method, url, headers: { origin: WEB_ORIGIN } }) as unknown as IncomingMessage;

const asResponse = (response: FakeResponse): ServerResponse => response as unknown as ServerResponse;

describe('GET /prototype/events (§62)', () => {
  let store: InMemoryDataStore;
  let hub: LiveEventHub;
  let handle: ReturnType<typeof createEventStreamHandler>;
  let response: FakeResponse;

  const seed = buildSeed('personal-workspace');
  const persona = seed.users[0]!;
  const otherPersona = seed.users[1]!;

  beforeEach(() => {
    store = new InMemoryDataStore(seed);
    hub = new LiveEventHub();
    handle = createEventStreamHandler(hub, store, { heartbeatMs: 20 });
    response = new FakeResponse();
  });

  it('answers text/event-stream with CORS for the web origin', async () => {
    await handle(requestFor('/prototype/events'), asResponse(response));

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('text/event-stream');
    expect(response.headers['cache-control']).toBe('no-cache');
    expect(response.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
    // Without this the browser retries on its own schedule, which is not ours to guess.
    expect(response.body).toContain('retry: ');
    response.emit('close');
  });

  it('writes one data frame per event, carrying the event and nothing else', async () => {
    await handle(requestFor(`/prototype/events?user=${persona.id}`), asResponse(response));
    response.chunks.length = 0;

    hub.publish({
      workspaceId: persona.workspaceId as WorkspaceId,
      event: { type: 'task.completed', entityType: 'task', entityId: 'task-1', projectId: 'project-1' as never },
    });

    expect(response.body).toBe(
      'data: {"type":"task.completed","entityType":"task","entityId":"task-1","projectId":"project-1"}\n\n',
    );
    expect(response.body).not.toContain('workspace');
    response.emit('close');
  });

  it('filters by the ?user persona’s workspace', async () => {
    await handle(requestFor(`/prototype/events?user=${persona.id}`), asResponse(response));
    response.chunks.length = 0;

    hub.publish({
      workspaceId: otherPersona.workspaceId as WorkspaceId,
      event: { type: 'task.updated', entityId: 'task-theirs' },
    });

    expect(response.body).toBe('');
    response.emit('close');
  });

  it('streams unfiltered when ?user is absent', async () => {
    await handle(requestFor('/prototype/events'), asResponse(response));
    response.chunks.length = 0;

    hub.publish({
      workspaceId: otherPersona.workspaceId as WorkspaceId,
      event: { type: 'task.updated', entityId: 'task-theirs' },
    });

    expect(response.body).toContain('task-theirs');
    response.emit('close');
  });

  it('404s an unknown persona, with CORS headers so the browser sees the real error', async () => {
    await handle(requestFor('/prototype/events?user=user-nope'), asResponse(response));

    expect(response.status).toBe(404);
    expect(response.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
    expect(response.ended).toBe(true);
  });

  it('refuses a non-GET with 405', async () => {
    await handle(requestFor('/prototype/events', 'POST'), asResponse(response));

    expect(response.status).toBe(405);
    expect(response.ended).toBe(true);
  });

  it('unsubscribes and clears the heartbeat when the client disconnects', async () => {
    await handle(requestFor('/prototype/events'), asResponse(response));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(response.body).toContain(':');

    response.emit('close');
    const after = response.chunks.length;
    await new Promise((resolve) => setTimeout(resolve, 50));
    hub.publish({ workspaceId: persona.workspaceId as WorkspaceId, event: { type: 'task.updated', entityId: 't' } });

    expect(response.chunks).toHaveLength(after);
  });
});
