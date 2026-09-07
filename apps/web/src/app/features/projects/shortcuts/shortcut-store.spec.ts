import { TestBed } from '@angular/core/testing';
import { type ProjectId, type ProjectPageId } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
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
});
