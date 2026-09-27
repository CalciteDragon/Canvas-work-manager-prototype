import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ProjectSchema, type ArchivedProjectsResult } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
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
});
