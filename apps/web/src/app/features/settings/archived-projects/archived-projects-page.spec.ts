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
  vi.stubGlobal('ResizeObserver', class {
    private connected = true;
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element): void {
      queueMicrotask(() => {
        if (this.connected) this.callback([{ target, contentRect: { width: 100, height: 30 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
      });
    }
    disconnect(): void { this.connected = false; }
  });
});
afterEach(() => {
  TestBed.resetTestingModule();
  vi.unstubAllGlobals();
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

  it('offers a read-only Try again after a list failure, with no empty sentence (Slice 78)', async () => {
    const { fixture, gateway } = await render(new FakeWorkManagerGateway({ failOn: { 'projects.archived': new GatewayError('unreachable', 503, 'Offline') } }));
    const host = fixture.nativeElement as HTMLElement;
    const error = host.querySelector('[data-archived-error]')!;
    expect(error.querySelector('[data-failure-sentence]')?.textContent?.trim()).toBe('Couldn’t reach your workspace, so this list didn’t load.');
    expect(error.querySelector('[data-failure-sentence]')?.getAttribute('role')).toBe('alert');
    expect(error.querySelector('details')?.textContent).toContain('Offline');
    expect(error.querySelector('[data-recovery]')?.textContent?.trim()).toBe('Try again');
    expect(host.querySelector('[data-archived-empty]')).toBeNull();
    expect(host.querySelector('[data-archived-loading]')).toBeNull();
    gateway.options.failOn = {};
    host.querySelector<HTMLButtonElement>('[data-archived-error] [data-recovery]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.querySelector('[data-archived-empty]')).not.toBeNull();
    expect(gateway.calls.every((call) => call.method === 'projects.archived')).toBe(true);
  });

  it('says a failed read over the list politely, keeps the list and pauses Restore until Try again reads (Slice 78)', async () => {
    const { fixture, gateway } = await render();
    const host = fixture.nativeElement as HTMLElement;
    gateway.options.failOn = { 'projects.archived': new GatewayError('internal_error', 500, 'quiet read failed') };
    await fixture.componentInstance['store'].load({ quiet: true });
    fixture.detectChanges();
    const error = host.querySelector('[data-archived-error]')!;
    expect(error.querySelector('[data-failure-sentence]')?.textContent?.trim()).toBe('This list may be out of date.');
    expect(error.querySelector('[data-failure-sentence]')?.getAttribute('role')).toBe('status');
    expect(error.querySelector('[data-recovery]')?.textContent?.trim()).toBe('Try again');
    expect(host.textContent).not.toContain('Couldn’t load');
    expect(host.querySelector('[data-archived-project]')).not.toBeNull();
    const select = host.querySelector<HTMLSelectElement>('[data-archived-status]')!;
    select.value = 'active'; select.dispatchEvent(new Event('change')); fixture.detectChanges();
    expect(host.querySelector<HTMLButtonElement>('[data-archived-restore]')!.disabled).toBe(true);

    gateway.options.failOn = {};
    host.querySelector<HTMLButtonElement>('[data-archived-error] [data-recovery]')!.click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(host.querySelector('[data-archived-error]')).toBeNull();
    expect(host.querySelector<HTMLButtonElement>('[data-archived-restore]')!.disabled).toBe(false);
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
    expect(host.querySelector('[data-archived-error] [data-failure-sentence]')?.textContent?.trim()).toBe('Restored “Past launch”, but this list couldn’t refresh.');
    expect(host.querySelector('[data-archived-error] [data-recovery]')?.textContent?.trim()).toBe('Retry refresh');
    expect(restore.disabled).toBe(true);
    restore.click();
    expect(gateway.calls.filter((call) => call.method === 'projects.update')).toHaveLength(1);
    gateway.options.failOn = {};
    gateway.options.archivedProjects = { items: [] };
    host.querySelector<HTMLButtonElement>('[data-archived-error] [data-recovery]')!.click();
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

    for (const moveFocus of [false, true]) {
      it(`waits for a rendered toast action and ${moveFocus ? 'preserves focus moved after settlement' : 'then focuses Open it'}`, async () => {
        const { fixture, gateway } = await render(gatewayOf([first]));
        gateway.options.archivedProjects = { items: [child] };
        let notify: ((width: number) => void) | undefined;
        const disconnect = vi.fn();
        vi.stubGlobal('ResizeObserver', class {
          constructor(private readonly callback: ResizeObserverCallback) {}
          observe(target: Element): void { notify = (width) => this.callback([{ target, contentRect: { width, height: width } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
          disconnect = disconnect;
        });
        const focus = vi.spyOn(fixture.componentInstance.toast, 'focusFirst');
        const elsewhere = document.createElement('button');
        document.body.append(elsewhere);
        try {
          await restoreRow(fixture, first.project.id);
          await vi.waitFor(() => expect(notify).toBeTypeOf('function'));
          // An open native popover can still have no rendered action box during reopening.
          notify!(0);
          expect(focus).not.toHaveBeenCalled();
          if (moveFocus) elsewhere.focus();
          notify!(100);
          await settle(fixture);
          expect(document.activeElement).toBe(moveFocus ? elsewhere : (fixture.nativeElement as HTMLElement).querySelector('[data-restore-open]'));
          expect(focus).toHaveBeenCalledTimes(moveFocus ? 0 : 1);
          expect(disconnect).toHaveBeenCalled();
        } finally {
          notify?.(100);
          elsewhere.remove();
        }
      });
    }

    for (const cancellation of ['dismissal', 'destruction', 'newer Restore']) {
      it(`settles a layout handoff on ${cancellation} and ignores its late notification`, async () => {
        const { fixture, gateway } = await render(gatewayOf([first]));
        gateway.options.archivedProjects = { items: [child] };
        let notify: (() => void) | undefined;
        const disconnect = vi.fn();
        vi.stubGlobal('ResizeObserver', class {
          constructor(private readonly callback: ResizeObserverCallback) {}
          observe(target: Element): void { notify = () => this.callback([{ target, contentRect: { width: 100, height: 30 } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
          disconnect = disconnect;
        });
        const focus = vi.spyOn(fixture.componentInstance.toast, 'focusFirst');
        await restoreRow(fixture, first.project.id);
        await vi.waitFor(() => expect(notify).toBeTypeOf('function'));
        const previousNotification = notify!;
        if (cancellation === 'dismissal') {
          fixture.componentInstance.toast.close();
          fixture.detectChanges();
        } else if (cancellation === 'destruction') {
          fixture.destroy();
        } else {
          gateway.options.archivedProjects = { items: [] };
          await restoreRow(fixture, child.project.id);
          await vi.waitFor(() => expect(notify).not.toBe(previousNotification));
        }
        expect(disconnect).toHaveBeenCalled();
        previousNotification();
        expect(focus).not.toHaveBeenCalled();
        if (cancellation === 'newer Restore') notify!();
        await fixture.whenStable();
        expect(focus).toHaveBeenCalledTimes(cancellation === 'newer Restore' ? 1 : 0);
      });
    }

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
      host.querySelector<HTMLButtonElement>('[data-archived-error] [data-recovery]')!.focus();
      host.querySelector<HTMLButtonElement>('[data-archived-error] [data-recovery]')!.click();
      await settle(fixture);
      expect(host.querySelector('[data-archived-error] [data-recovery]')).toBeNull();
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
