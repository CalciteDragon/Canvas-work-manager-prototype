import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ProjectSchema, type ArchivedProjectsResult, type ProjectWriteResult } from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { GatewayError } from '../../../core/gateway/gateway-error';
import { FakeWorkManagerGateway } from '../../../core/gateway/testing/fake-gateway';
import { WORK_MANAGER_GATEWAY } from '../../../core/gateway/work-manager-gateway';
import { ArchivedProjectsPage } from './archived-projects-page';

const project = ProjectSchema.parse({ id: 'archived-page', workspaceId: 'workspace-demo', kind: 'root', name: 'Past launch',
  status: 'archived', projectLayoutMode: 'flow', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' });
const archived: ArchivedProjectsResult = { items: [{ project, breadcrumb: [{ projectId: project.id, name: project.name }] }] };

const render = async (gateway = new FakeWorkManagerGateway({ projects: [project], archivedProjects: archived })) => {
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: WORK_MANAGER_GATEWAY, useValue: gateway }] });
  const fixture = TestBed.createComponent(ArchivedProjectsPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, gateway };
};

describe('ArchivedProjectsPage (Slice 44)', () => {
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

  it('moves focus to the heading after the last restored row disappears', async () => {
    const { fixture, gateway } = await render();
    const host = fixture.nativeElement as HTMLElement;
    const select = host.querySelector<HTMLSelectElement>('[data-archived-status]')!;
    select.value = 'active'; select.dispatchEvent(new Event('change'));
    gateway.options.archivedProjects = { items: [] };
    fixture.detectChanges();
    const restore = host.querySelector<HTMLButtonElement>('[data-archived-restore]')!;
    restore.focus(); restore.click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(document.activeElement).toBe(host.querySelector('h1'));
  });

  // Slice 47: a later row's Restore is disabled until its status is chosen, so focus goes to
  // the next enabled status selector — only while the Restore action still owns focus.
  describe('focus after Restore (Slice 47)', () => {
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

    it('focuses the status of the row that takes the restored row’s place', async () => {
      const { fixture, gateway } = await render(gatewayOf([first, second, third]));
      gateway.options.archivedProjects = { items: [first, third] };
      await restoreRow(fixture, second.project.id);
      await settle(fixture);
      expect(document.activeElement).toBe(statusOf(fixture, third.project.id));
    });

    it('focuses the previous row’s status when the restored row was last', async () => {
      const { fixture, gateway } = await render(gatewayOf([first, second]));
      gateway.options.archivedProjects = { items: [first] };
      await restoreRow(fixture, second.project.id);
      await settle(fixture);
      expect(document.activeElement).toBe(statusOf(fixture, first.project.id));
    });

    it('focuses a child the restore revealed', async () => {
      const { fixture, gateway } = await render(gatewayOf([first]));
      gateway.options.archivedProjects = { items: [child] };
      await restoreRow(fixture, first.project.id);
      await settle(fixture);
      expect(document.activeElement).toBe(statusOf(fixture, child.project.id));
    });

    it('focuses Retry when the refresh fails and the retained row stays blocked', async () => {
      const { fixture, gateway } = await render(gatewayOf([first, second]));
      gateway.options.failOn = { 'projects.archived': new GatewayError('unreachable', 503, 'Offline') };
      const restore = await restoreRow(fixture, first.project.id);
      await settle(fixture);
      const host = fixture.nativeElement as HTMLElement;
      expect(restore.disabled).toBe(true);
      expect(document.activeElement).toBe(host.querySelector('[data-archived-retry]'));

      // A successful Retry removes itself with the error; focus moves on rather than dropping.
      gateway.options.failOn = {};
      gateway.options.archivedProjects = { items: [second] };
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
