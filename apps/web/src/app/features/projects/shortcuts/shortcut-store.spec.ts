import { TestBed } from '@angular/core/testing';
import { type ProjectId, type ProjectPageId } from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { GatewayError } from '../../../core/gateway/gateway-error';
import { FakeWorkManagerGateway } from '../../../core/gateway/testing/fake-gateway';
import { WORK_MANAGER_GATEWAY } from '../../../core/gateway/work-manager-gateway';
import { ShortcutStore } from './shortcut-store';

describe('ShortcutStore (§27)', () => {
  it('requests sources for the destination page', async () => {
    const gateway = new FakeWorkManagerGateway();
    TestBed.configureTestingModule({
      providers: [ShortcutStore, { provide: WORK_MANAGER_GATEWAY, useValue: gateway }],
    });
    const store = TestBed.inject(ShortcutStore);
    const projectId = 'project-root' as ProjectId;
    const pageId = 'page-root-home' as ProjectPageId;

    await store.load(projectId, pageId);

    expect(gateway.argumentTo('shortcuts.sources')).toEqual({ projectId, pageId });
    expect(store.error()).toBeNull();
    expect(store.loading()).toBe(false);
  });

  it('holds a failed discovery read as a Failure; Try again re-reads, including after not_found (Slice 78)', async () => {
    const gateway = new FakeWorkManagerGateway({ failOn: { 'shortcuts.sources': new GatewayError('not_found', 404, 'page page-root-home not found') } });
    TestBed.configureTestingModule({
      providers: [ShortcutStore, { provide: WORK_MANAGER_GATEWAY, useValue: gateway }],
    });
    const store = TestBed.inject(ShortcutStore);
    const projectId = 'project-root' as ProjectId;
    const pageId = 'page-root-home' as ProjectPageId;

    await store.load(projectId, pageId);
    expect(store.error()).toEqual({ sentence: 'The list of sections isn’t available.', reason: 'page page-root-home not found' });
    expect(store.sources()).toEqual([]);

    gateway.options.failOn = {};
    let answer!: (value: never[]) => void;
    vi.spyOn(gateway.shortcuts, 'sources').mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; }));
    const retrying = store.retry();
    // The failure stays on screen, its Try again busy, until the read answers.
    expect(store.loading()).toBe(true);
    expect(store.error()?.reason).toBe('page page-root-home not found');
    answer([]);
    await retrying;
    expect(store.error()).toBeNull();
    expect(gateway.calls.filter(({ method }) => method === 'shortcuts.sources')).toHaveLength(1);
  });

  it('clears a failure at once when another page is read (Slice 78)', async () => {
    const gateway = new FakeWorkManagerGateway({ failOn: { 'shortcuts.sources': new GatewayError('internal_error', 500, 'boom') } });
    TestBed.configureTestingModule({
      providers: [ShortcutStore, { provide: WORK_MANAGER_GATEWAY, useValue: gateway }],
    });
    const store = TestBed.inject(ShortcutStore);
    await store.load('project-root' as ProjectId, 'page-root-home' as ProjectPageId);
    expect(store.error()?.sentence).toBe('Couldn’t load the list of sections.');
    vi.spyOn(gateway.shortcuts, 'sources').mockImplementationOnce(() => new Promise(() => {}));
    void store.load('project-root' as ProjectId, 'page-root-work' as ProjectPageId);
    expect(store.error()).toBeNull();
  });
});
