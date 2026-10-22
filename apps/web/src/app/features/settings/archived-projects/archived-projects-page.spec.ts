import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ProjectSchema, type ArchivedProjectsResult, type ProjectWriteResult } from '@cwm/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GatewayError } from '../../../core/gateway/gateway-error';
import { FakeWorkManagerGateway } from '../../../core/gateway/testing/fake-gateway';
import { WORK_MANAGER_GATEWAY } from '../../../core/gateway/work-manager-gateway';
import { ArchivedProjectsPage } from './archived-projects-page';
import { LIVE_UPDATES } from '../../../core/live/live-updates';
import { FakeLiveUpdates } from '../../../core/live/testing/fake-live-updates';

const popoverMethods = ['showPopover', 'hidePopover'].map(key => ({ key, descriptor: Object.getOwnPropertyDescriptor(HTMLElement.prototype, key) }));
beforeEach(() => {
  for (const { key } of popoverMethods) Object.defineProperty(HTMLElement.prototype, key, { configurable: true, value: vi.fn() });
});
afterEach(() => {
  TestBed.resetTestingModule();
  for (const { key, descriptor } of popoverMethods) {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, key, descriptor);
    else Reflect.deleteProperty(HTMLElement.prototype, key);
  }
});
const project = ProjectSchema.parse({ id: 'archived-page', workspaceId: 'workspace-demo', kind: 'root', name: 'Past launch',
  status: 'archived', projectLayoutMode: 'flow', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' });
const archived: ArchivedProjectsResult = { items: [{ project, breadcrumb: [{ projectId: project.id, name: project.name }] }] };

const render = async (gateway = new FakeWorkManagerGateway({ projects: [project], archivedProjects: archived })) => {
  const live = new FakeLiveUpdates();
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: WORK_MANAGER_GATEWAY, useValue: gateway }, { provide: LIVE_UPDATES, useValue: live }] });
  const fixture = TestBed.createComponent(ArchivedProjectsPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, gateway, live };
};

describe('ArchivedProjectsPage (Slice 44)', () => {
  it('closes a restore toast on persona reload outside a project shell', async () => {
    const { fixture, gateway, live } = await render();
    const host = fixture.nativeElement as HTMLElement;
    const select = host.querySelector<HTMLSelectElement>('[data-archived-status]')!;
    select.value = 'active'; select.dispatchEvent(new Event('change')); fixture.detectChanges();
    gateway.options.archivedProjects = { items: [] };
    host.querySelector<HTMLButtonElement>('[data-archived-restore]')!.click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.componentInstance.toast.state()).not.toBeNull();
    live.emit({ type: 'prototype.reloaded', entityId: 'seed' });
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.componentInstance.toast.state()).toBeNull();
  });
  it('confirms the restored name and status with Open it and no Undo', async () => {
    const { fixture, gateway } = await render();
    const host = fixture.nativeElement as HTMLElement;
    const select = host.querySelector<HTMLSelectElement>('[data-archived-status]')!;
    select.value = 'on_hold'; select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    gateway.options.archivedProjects = { items: [] };
    const restore = host.querySelector<HTMLButtonElement>('[data-archived-restore]')!;
    restore.focus(); restore.click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(host.querySelector('[data-toast]')?.textContent).toContain('Restored Past launch as On hold.');
    const open = host.querySelector<HTMLAnchorElement>('[data-restore-open]');
    expect(open?.getAttribute('href')).toBe('/projects/archived-page');
    expect(host.querySelector('[data-restore-undo]')).toBeNull();
    expect(document.activeElement).toBe(open);
  });
  it('shows breadcrumb and Open project, and requires a status before Restore', async () => {
    const { fixture, gateway } = await render();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-archived-project]')?.textContent).toContain('Past launch');
    expect(host.querySelector<HTMLAnchorElement>('[data-archived-open]')?.getAttribute('href')).toBe('/projects/archived-page');
    const restore = host.querySelector<HTMLButtonElement>('[data-archived-restore]')!;
    expect(restore.disabled).toBe(true);
    const select = host.querySelector<HTMLSelectElement>('[data-archived-status]')!;
    select.value = 'on_hold';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(restore.disabled).toBe(false);
    restore.click();
    await fixture.whenStable();
    expect(gateway.calls).toContainEqual({ method: 'projects.update', argument: { id: project.id, input: { status: 'on_hold' } } });
  });

  it('offers a read-only Retry after a list failure', async () => {
    const { fixture, gateway } = await render(new FakeWorkManagerGateway({ failOn: { 'projects.archived': new GatewayError('unreachable', 503, 'Offline') } }));
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-archived-error]')?.textContent).toContain('Offline');
    gateway.options.failOn = {};
    host.querySelector<HTMLButtonElement>('[data-archived-retry]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.querySelector('[data-archived-empty]')).not.toBeNull();
    expect(gateway.calls.every((call) => call.method === 'projects.archived')).toBe(true);
  });

  it('disables a stale Restore row when the write succeeded but its refresh failed', async () => {
    const { fixture, gateway } = await render();
    const host = fixture.nativeElement as HTMLElement;
    const select = host.querySelector<HTMLSelectElement>('[data-archived-status]')!;
    select.value = 'active'; select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    gateway.options.failOn = { 'projects.archived': new GatewayError('unreachable', 503, 'Offline') };
    const restore = host.querySelector<HTMLButtonElement>('[data-archived-restore]')!;
    restore.click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(host.querySelector('[data-archived-error]')?.textContent).toContain('Restore succeeded');
    expect(restore.disabled).toBe(true);
    restore.click();
    expect(gateway.calls.filter((call) => call.method === 'projects.update')).toHaveLength(1);
    gateway.options.failOn = {};
    gateway.options.archivedProjects = { items: [] };
    host.querySelector<HTMLButtonElement>('[data-archived-retry]')!.click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(host.querySelector('[data-archived-project]')).toBeNull();
  });

  it('moves focus to the toast, then the heading after the last restored row disappears', async () => {
    const { fixture, gateway } = await render();
    const host = fixture.nativeElement as HTMLElement;
    const select = host.querySelector<HTMLSelectElement>('[data-archived-status]')!;
    select.value = 'active'; select.dispatchEvent(new Event('change'));
    gateway.options.archivedProjects = { items: [] };
    fixture.detectChanges();
    const restore = host.querySelector<HTMLButtonElement>('[data-archived-restore]')!;
    restore.focus(); restore.click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(document.activeElement).toBe(host.querySelector('[data-restore-open]'));
    host.querySelector<HTMLButtonElement>('[data-toast-dismiss]')!.click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(document.activeElement).toBe(host.querySelector('h1'));
  });

  // Slice 74 puts successful Restore focus in the toast; read-only Retry keeps Slice 47's guard.
  describe('focus after Restore and Retry', () => {
    const entry = (id: string, name: string, parent?: string) => {
      const record = ProjectSchema.parse({ ...project, id, name, ...(parent === undefined ? {} : { kind: 'subproject', parentProjectId: parent }) });
      return { project: record, breadcrumb: [{ projectId: record.id, name }] };
    };
    const first = entry('archived-first', 'First');
    const second = entry('archived-second', 'Second');
    const third = entry('archived-third', 'Third');
    const child = entry('archived-child', 'Revealed child', first.project.id);
    const gatewayOf = (items: ReturnType<typeof entry>[]) => new FakeWorkManagerGateway({
      projects: [first, second, third, child].map(({ project: record }) => record),
      archivedProjects: { items },
    });

    const restoreRow = async (fixture: Awaited<ReturnType<typeof render>>['fixture'], id: string) => {
      const host = fixture.nativeElement as HTMLElement;
      const row = host.querySelector(`[data-project-id="${id}"]`)!;
      const select = row.querySelector<HTMLSelectElement>('[data-archived-status]')!;
      select.value = 'active'; select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      const restore = row.querySelector<HTMLButtonElement>('[data-archived-restore]')!;
      restore.focus(); restore.click();
      return restore;
    };
    const settle = async (fixture: Awaited<ReturnType<typeof render>>['fixture']) => {
      await fixture.whenStable(); fixture.detectChanges();
    };
    const statusOf = (fixture: Awaited<ReturnType<typeof render>>['fixture'], id: string) =>
      (fixture.nativeElement as HTMLElement).querySelector(`[data-project-id="${id}"] [data-archived-status]`);

    it('dismissal focuses the next Restore even when an earlier row has no chosen status', async () => {
      const { fixture, gateway } = await render(gatewayOf([first, second, third]));
      const host = fixture.nativeElement as HTMLElement;
      const select = host.querySelector<HTMLSelectElement>(`[data-project-id="${third.project.id}"] [data-archived-status]`)!;
      select.value = 'active'; select.dispatchEvent(new Event('change')); fixture.detectChanges();
      gateway.options.archivedProjects = { items: [first, third] };
      await restoreRow(fixture, second.project.id); await settle(fixture);
      host.querySelector<HTMLButtonElement>('[data-toast-dismiss]')!.click(); await settle(fixture);
      expect(document.activeElement).toBe(host.querySelector(`[data-project-id="${third.project.id}"] [data-archived-restore]`));
    });

    it('focuses Open it when the restored row disappears', async () => {
      const { fixture, gateway } = await render(gatewayOf([first, second, third]));
      gateway.options.archivedProjects = { items: [first, third] };
      await restoreRow(fixture, second.project.id);
      await settle(fixture);
      expect(document.activeElement).toBe((fixture.nativeElement as HTMLElement).querySelector('[data-restore-open]'));
    });

    it('focuses Open it when the restored row was last', async () => {
      const { fixture, gateway } = await render(gatewayOf([first, second]));
      gateway.options.archivedProjects = { items: [first] };
      await restoreRow(fixture, second.project.id);
      await settle(fixture);
      expect(document.activeElement).toBe((fixture.nativeElement as HTMLElement).querySelector('[data-restore-open]'));
    });

    it('focuses Open it when the restore reveals a child', async () => {
      const { fixture, gateway } = await render(gatewayOf([first]));
      gateway.options.archivedProjects = { items: [child] };
      await restoreRow(fixture, first.project.id);
      await settle(fixture);
      expect(document.activeElement).toBe((fixture.nativeElement as HTMLElement).querySelector('[data-restore-open]'));
    });

    it('confirms a committed Restore even when its refresh fails, then preserves Retry focus', async () => {
      const { fixture, gateway } = await render(gatewayOf([first, second]));
      gateway.options.failOn = { 'projects.archived': new GatewayError('unreachable', 503, 'Offline') };
      const restore = await restoreRow(fixture, first.project.id);
      await settle(fixture);
      const host = fixture.nativeElement as HTMLElement;
      expect(restore.disabled).toBe(true);
      expect(document.activeElement).toBe(host.querySelector('[data-restore-open]'));

      // A successful Retry removes itself with the error; focus moves on rather than dropping.
      gateway.options.failOn = {};
      gateway.options.archivedProjects = { items: [second] };
      host.querySelector<HTMLButtonElement>('[data-archived-retry]')!.focus();
      host.querySelector<HTMLButtonElement>('[data-archived-retry]')!.click();
      await settle(fixture);
      expect(host.querySelector('[data-archived-retry]')).toBeNull();
      expect(document.activeElement).toBe(statusOf(fixture, second.project.id));
    });

    it('leaves focus where the person moved it while Restore was pending', async () => {
      const { fixture, gateway } = await render(gatewayOf([first, second]));
      let release!: (result: ProjectWriteResult) => void;
      gateway.projects.update = vi.fn(() => new Promise<ProjectWriteResult>((resolve) => { release = resolve; }));
      gateway.options.archivedProjects = { items: [second] };
      await restoreRow(fixture, first.project.id);
      fixture.detectChanges();
      const elsewhere = document.createElement('button');
      document.body.append(elsewhere);
      try {
        elsewhere.focus();
        release({ project: { ...first.project, status: 'active' }, operation: null });
        await settle(fixture);
        expect((fixture.nativeElement as HTMLElement).querySelector(`[data-project-id="${first.project.id}"]`)).toBeNull();
        expect(document.activeElement).toBe(elsewhere);
      } finally {
        elsewhere.remove();
      }
    });
  });
});


it('shows ancestors once and describes a root as top-level (slice 77)', async () => {
 const {fixture}=await render();
 expect(fixture.nativeElement.querySelector('.archived-projects__breadcrumb')?.textContent.trim()).toBe('Top-level project');
 TestBed.resetTestingModule();
 const child=ProjectSchema.parse({...project,id:'archived-child',kind:'subproject',parentProjectId:project.id,name:'Kitchen'});
 const nested=await render(new FakeWorkManagerGateway({projects:[project,child],archivedProjects:{items:[{project:child,breadcrumb:[{projectId:project.id,name:project.name},{projectId:child.id,name:child.name}]}]}}));
 const text=nested.fixture.nativeElement.querySelector('.archived-projects__breadcrumb')?.textContent;
 expect(text).toContain('Past launch'); expect(text).not.toContain('Kitchen');
});
