import { TestBed } from '@angular/core/testing';
import { ProjectSchema, type ArchivedProjectsResult, type ProjectId } from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { GatewayError } from '../../../core/gateway/gateway-error';
import { FakeWorkManagerGateway } from '../../../core/gateway/testing/fake-gateway';
import { WORK_MANAGER_GATEWAY } from '../../../core/gateway/work-manager-gateway';
import { LIVE_UPDATES } from '../../../core/live/live-updates';
import { FakeLiveUpdates } from '../../../core/live/testing/fake-live-updates';
import { ArchivedProjectsStore } from './archived-projects-store';

const project = ProjectSchema.parse({ id: 'archived-root', workspaceId: 'workspace-demo', kind: 'root',
  name: 'Old launch', status: 'archived', projectLayoutMode: 'flow', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' });
const result: ArchivedProjectsResult = { items: [{ project, breadcrumb: [{ projectId: project.id, name: project.name }] }] };

const setup = (options: ConstructorParameters<typeof FakeWorkManagerGateway>[0] = { archivedProjects: result }) => {
  const gateway = new FakeWorkManagerGateway({ projects: [project], ...options });
  const live = new FakeLiveUpdates();
  TestBed.configureTestingModule({ providers: [ArchivedProjectsStore, { provide: WORK_MANAGER_GATEWAY, useValue: gateway }, { provide: LIVE_UPDATES, useValue: live }] });
  return { store: TestBed.inject(ArchivedProjectsStore), gateway, live };
};

describe('ArchivedProjectsStore (Slice 44)', () => {
  it('requires an explicit non-archived status before Restore and refreshes the workspace result', async () => {
    const { store, gateway } = setup();
    await store.load();
    expect(await store.restore(project.id)).toBe(false);
    expect(gateway.calls.some((call) => call.method === 'projects.update')).toBe(false);
    store.chooseStatus(project.id, 'active');
    expect(await store.restore(project.id)).toBe(true);
    expect(gateway.calls).toContainEqual({ method: 'projects.update', argument: { id: project.id, input: { status: 'active' } } });
    expect(gateway.calls.at(-1)?.method).toBe('projects.archived');
  });

  it('re-reads after a concurrent blocker refusal and shows the refusal', async () => {
    const { store, gateway } = setup({ archivedProjects: result, failOn: { 'projects.update': new GatewayError('conflict', 409, 'Restore the parent first') } });
    await store.load();
    store.chooseStatus(project.id, 'planning');
    expect(await store.restore(project.id)).toBe(false);
    // Slice 78: the refusal is said in product words, its reason apart; it outranks the quiet re-read before it.
    expect(store.error()).toEqual({ kind: 'refused', sentence: 'Couldn’t restore “Old launch”. The list may have changed.', reason: 'Restore the parent first' });
    expect(gateway.calls.at(-1)?.method).toBe('projects.archived');
  });

  it('keeps the refusal when the quiet re-read before it fails too (Slice 78)', async () => {
    const { store, gateway } = setup({ archivedProjects: result, failOn: {
      'projects.update': new GatewayError('conflict', 409, 'Restore the parent first'),
    } });
    await store.load();
    store.chooseStatus(project.id, 'planning');
    gateway.options.failOn = { ...gateway.options.failOn, 'projects.archived': new GatewayError('unreachable', 503, 'Offline') };
    expect(await store.restore(project.id)).toBe(false);
    expect(store.error()).toMatchObject({ kind: 'refused', reason: 'Restore the parent first' });
  });

  it('says an unreachable restore may not have been restored (Slice 78)', async () => {
    const { store } = setup({ archivedProjects: result, failOn: { 'projects.update': new GatewayError('unreachable', 0, 'host offline') } });
    await store.load();
    store.chooseStatus(project.id, 'active');
    expect(await store.restore(project.id)).toBe(false);
    expect(store.error()).toEqual({ kind: 'refused', sentence: 'Couldn’t reach your workspace, so “Old launch” may not have been restored.', reason: 'host offline' });
  });

  it('says a failed first read as a load failure, and a failed read over the list as stale (Slice 78)', async () => {
    const { store, gateway } = setup();
    gateway.options.failOn = { 'projects.archived': new GatewayError('unreachable', 0, 'list read failed') };
    expect(await store.load()).toBe(false);
    expect(store.error()).toEqual({ kind: 'load', sentence: 'Couldn’t reach your workspace, so this list didn’t load.', reason: 'list read failed' });

    gateway.options.failOn = {};
    expect(await store.retry()).toBe(true);
    expect(store.error()).toBeNull();
    gateway.options.failOn = { 'projects.archived': new GatewayError('internal_error', 500, 'quiet read failed') };
    expect(await store.load({ quiet: true })).toBe(false);
    expect(store.error()).toEqual({ kind: 'stale', sentence: 'This list may be out of date.', reason: 'quiet read failed' });
    expect(store.items()).toHaveLength(1);
    // Restore stays paused under stale, as under the other three.
    store.chooseStatus(project.id, 'active');
    expect(await store.restore(project.id)).toBe(false);
    gateway.options.failOn = {};
    expect(await store.retry()).toBe(true);
    expect(await store.restore(project.id)).toBe(true);
  });

  it('keeps Try again busy and the failure on screen while it reads (Slice 78)', async () => {
    const { store, gateway } = setup();
    gateway.options.failOn = { 'projects.archived': new GatewayError('unreachable', 0, 'list read failed') };
    await store.load();
    let answer!: (value: ArchivedProjectsResult) => void;
    vi.spyOn(gateway.projects, 'archived').mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; }));
    const retrying = store.retry();
    expect(store.retryPending()).toBe(true);
    expect(store.error()?.kind).toBe('load');
    answer(result);
    await retrying;
    expect(store.retryPending()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('retains a successful write message when its follow-up read fails and Retry only reads', async () => {
    const { store, gateway } = setup({ archivedProjects: result });
    await store.load();
    store.chooseStatus(project.id, 'active');
    gateway.options.failOn = { 'projects.archived': new GatewayError('unreachable', 503, 'Offline') };
    expect(await store.restore(project.id)).toBe(true);
    expect(store.error()).toEqual({ kind: 'committed-unrefreshed', sentence: 'Restored “Old launch”, but this list couldn’t refresh.', reason: 'Offline' });
    const writes = gateway.calls.filter((call) => call.method === 'projects.update').length;
    expect(await store.restore(project.id)).toBe(false);
    expect(gateway.calls.filter((call) => call.method === 'projects.update')).toHaveLength(writes);
    await store.retry();
    expect(gateway.calls.filter((call) => call.method === 'projects.update')).toHaveLength(writes);
    // Slice 47: a later failed read does not erase the fact that the write committed.
    expect(store.error()?.kind).toBe('committed-unrefreshed');
  });

  it('hands a refusal over to its Try again read, which turns stale when it fails, so Try again visibly ran', async () => {
    const { store, gateway } = setup({ archivedProjects: result, failOn: { 'projects.update': new GatewayError('conflict', 409, 'Restore the parent first') } });
    await store.load();
    store.chooseStatus(project.id, 'planning');
    expect(await store.restore(project.id)).toBe(false);
    gateway.options.failOn = { 'projects.archived': new GatewayError('unreachable', 503, 'Offline') };
    // A live frame's failed read leaves the held refusal as it is.
    expect(await store.load({ quiet: true })).toBe(false);
    expect(store.error()).toMatchObject({ kind: 'refused', reason: 'Restore the parent first' });
    expect(await store.retry()).toBe(false);
    expect(store.error()).toEqual({ kind: 'stale', sentence: 'This list may be out of date.', reason: 'Offline' });
  });

  it('keeps Restore blocked while a live-frame read is pending after a failed refresh', async () => {
    const { store, gateway, live } = setup();
    await store.load();
    store.chooseStatus(project.id, 'active');
    gateway.options.failOn = { 'projects.archived': new GatewayError('unreachable', 503, 'Offline') };
    expect(await store.restore(project.id)).toBe(true);
    let resolveRead!: (value: ArchivedProjectsResult) => void;
    vi.spyOn(gateway.projects, 'archived').mockImplementationOnce(() => new Promise((resolve) => { resolveRead = resolve; }));
    live.emit({ type: 'project.updated', entityType: 'project', entityId: project.id,
      projectId: project.id, rootProjectId: project.id });
    await Promise.resolve();
    expect(store.error()?.kind).toBe('committed-unrefreshed');
    expect(await store.restore(project.id)).toBe(false);
    expect(gateway.calls.filter((call) => call.method === 'projects.update')).toHaveLength(1);
    resolveRead({ items: [] });
    await Promise.resolve();
    expect(store.items()).toHaveLength(0);
  });

  it('re-reads on project records from another root and clears on persona reload', async () => {
    const { store, gateway, live } = setup();
    await store.load();
    gateway.options.archivedProjects = { items: [] };
    live.emit({ type: 'project.updated', entityType: 'project', entityId: 'elsewhere', projectId: 'elsewhere' as ProjectId, rootProjectId: 'elsewhere' as ProjectId });
    await Promise.resolve();
    expect(store.items()).toHaveLength(0);
    live.emit({ type: 'prototype.reloaded', entityId: 'seed' });
    expect(store.items()).toHaveLength(0);
  });

  it('clears a held failure and a pending Try again on persona reload (Slice 78)', async () => {
    const { store, gateway, live } = setup();
    gateway.options.failOn = { 'projects.archived': new GatewayError('unreachable', 0, 'list read failed') };
    await store.load();
    vi.spyOn(gateway.projects, 'archived').mockImplementationOnce(() => new Promise(() => {})).mockImplementationOnce(() => new Promise(() => {}));
    void store.retry();
    expect(store.retryPending()).toBe(true);
    live.emit({ type: 'prototype.reloaded', entityId: 'seed' });
    expect(store.error()).toBeNull();
    expect(store.retryPending()).toBe(false);
  });

  it('drops an old persona read that resolves after a reload', async () => {
    const { store, gateway, live } = setup();
    await store.load();
    let resolveOld!: (value: ArchivedProjectsResult) => void;
    const old = new Promise<ArchivedProjectsResult>((resolve) => { resolveOld = resolve; });
    vi.spyOn(gateway.projects, 'archived').mockImplementationOnce(() => old).mockResolvedValue({ items: [] });
    const pendingOld = store.load();
    live.emit({ type: 'prototype.reloaded', entityId: 'seed' });
    await Promise.resolve();
    resolveOld(result);
    await pendingOld;
    expect(store.items()).toHaveLength(0);
  });

  it('does not show an old persona Restore error after reload supersedes its refresh', async () => {
    const { store, gateway, live } = setup();
    await store.load();
    store.chooseStatus(project.id, 'active');
    let resolveOld!: (value: ArchivedProjectsResult) => void;
    const old = new Promise<ArchivedProjectsResult>((resolve) => { resolveOld = resolve; });
    const archived = vi.spyOn(gateway.projects, 'archived').mockImplementationOnce(() => old).mockResolvedValue({ items: [] });
    const restoring = store.restore(project.id);
    await vi.waitFor(() => expect(archived).toHaveBeenCalledTimes(1));
    live.emit({ type: 'prototype.reloaded', entityId: 'seed' });
    await vi.waitFor(() => expect(archived).toHaveBeenCalledTimes(2));
    resolveOld(result);
    await restoring;
    expect(store.items()).toHaveLength(0);
    expect(store.error()).toBeNull();
  });
});
