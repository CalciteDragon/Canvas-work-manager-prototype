import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROTOTYPE_API_BASE_URL } from '../config/prototype-config';
import {
  PrototypeIdentityProvider,
  PROTOTYPE_PERSONA_STORAGE_KEY,
} from './prototype-identity-provider';

const identity = {
  user: {
    id: 'user-demo',
    name: 'Demo User',
    avatar: '🧭',
    workspaceId: 'workspace-demo',
    preferences: { theme: 'dark', dashboardWidgets: [] },
    createdAt: '2026-08-01T16:00:00.000Z',
  },
  workspace: {
    id: 'workspace-demo',
    name: 'Demo User Workspace',
    ownerUserId: 'user-demo',
    createdAt: '2026-08-01T16:00:00.000Z',
  },
};

// A Response body can only be read once, so every mocked call gets a fresh one.
const jsonResponse = (body: unknown, status = 200) => () =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const provider = () => {
  TestBed.configureTestingModule({
    providers: [PrototypeIdentityProvider, { provide: PROTOTYPE_API_BASE_URL, useValue: 'http://host.test' }],
  });
  return TestBed.inject(PrototypeIdentityProvider);
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('PrototypeIdentityProvider', () => {
  it('reads the persona from GET /api/me and memoizes it', async () => {
    fetchMock.mockImplementation(jsonResponse(identity));
    const subject = provider();

    const [first, second] = [await subject.getCurrentIdentity(), await subject.getCurrentIdentity()];

    expect(first.user.id).toBe('user-demo');
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://host.test/api/me');
  });

  // `pnpm dev` starts web and host at once, so the first call can lose the race to the
  // host's listen. A memoized rejection would then fail every later call — and because the
  // gateway takes its persona header from here, every gateway call with it.
  it('does not memoize a failure', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed')).mockImplementation(jsonResponse(identity));
    const subject = provider();

    await expect(subject.getCurrentIdentity()).rejects.toThrow();

    expect((await subject.getCurrentIdentity()).user.id).toBe('user-demo');
  });

  it('sends the stored persona, and no header when none is stored', async () => {
    fetchMock.mockImplementation(jsonResponse(identity));

    await provider().getCurrentIdentity();
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).toEqual({});

    localStorage.setItem(PROTOTYPE_PERSONA_STORAGE_KEY, 'user-alex');
    TestBed.resetTestingModule();
    await provider().getCurrentIdentity();
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).headers).toEqual({ 'x-prototype-user': 'user-alex' });
  });

  // A reseed, or a hand-edited browser, can leave a persona the host no longer has. Left
  // alone it 404s every request forever.
  it('clears a stale persona and retries once against the host default', async () => {
    localStorage.setItem(PROTOTYPE_PERSONA_STORAGE_KEY, 'user-nobody');
    fetchMock
      .mockImplementationOnce(jsonResponse({ error: 'not_found' }, 404))
      .mockImplementationOnce(jsonResponse(identity));

    const resolved = await provider().getCurrentIdentity();

    expect(resolved.user.id).toBe('user-demo');
    expect(localStorage.getItem(PROTOTYPE_PERSONA_STORAGE_KEY)).toBeNull();
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).headers).toEqual({});
  });

  it('rejects a body that is not an Identity', async () => {
    fetchMock.mockImplementation(jsonResponse({ user: identity.user }));

    const subject = provider();
    await expect(subject.getCurrentIdentity()).rejects.toThrow();
  });
});

// Found by running the app with the host stopped: the raw `TypeError: Failed to fetch`
// reached the sidebar. §8 says the UI sees `GatewayError` and nothing else — the identity
// provider is as much of a boundary as the gateway is.
describe('PrototypeIdentityProvider — failures the UI has to see', () => {
  it('reports an unreachable host as a GatewayError, not a fetch TypeError', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const subject = provider();

    await expect(subject.getCurrentIdentity()).rejects.toMatchObject({
      name: 'GatewayError',
      code: 'unreachable',
      status: 0,
    });
  });

  it('reports a broken /api/me body as an invalid_response, not a Zod error', async () => {
    fetchMock.mockImplementation(jsonResponse({ user: identity.user }));
    const subject = provider();

    await expect(subject.getCurrentIdentity()).rejects.toMatchObject({ code: 'invalid_response', status: 0 });
  });

  it('reports a non-404 status as a GatewayError carrying it', async () => {
    fetchMock.mockImplementation(jsonResponse({ error: 'internal_error' }, 500));
    const subject = provider();

    await expect(subject.getCurrentIdentity()).rejects.toMatchObject({ code: 'internal_error', status: 500 });
  });
});
