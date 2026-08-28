import { TestBed } from '@angular/core/testing';
import {
  ProjectSchema,
  type Project,
  type ProjectId,
  type ProjectLayoutMode,
} from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { GatewayError } from '../../core/gateway/gateway-error';
import {
  WORK_MANAGER_GATEWAY,
  type WorkManagerGateway,
} from '../../core/gateway/work-manager-gateway';
import { StateInspectorPage } from './state-inspector-page';

const AT = '2026-08-27T16:00:00.000Z';

const project = (id: string, layout: ProjectLayoutMode = 'flow'): Project =>
  ProjectSchema.parse({
    id,
    workspaceId: 'workspace-demo',
    name: id === 'project-a' ? 'Website launch' : 'Office renovation',
    status: 'active',
    projectLayoutMode: layout,
    createdAt: AT,
    updatedAt: AT,
  });

const render = async (projects: WorkManagerGateway['projects']) => {
  TestBed.configureTestingModule({
    providers: [{ provide: WORK_MANAGER_GATEWAY, useValue: { projects } as WorkManagerGateway }],
  });
  const fixture = TestBed.createComponent(StateInspectorPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
};

const controls = (fixture: Awaited<ReturnType<typeof render>>, id: string) =>
  [
    ...fixture.nativeElement.querySelectorAll(`[data-layout-control][data-project-id="${id}"]`),
  ] as HTMLButtonElement[];

const pressed = (control: HTMLButtonElement | undefined) =>
  control?.getAttribute('aria-pressed') === 'true';

describe('StateInspectorPage (§28)', () => {
  it('lists projects with independent flow/grid controls and keeps Slice 12 deferrals honest', async () => {
    const fixture = await render({
      list: vi.fn(async () => [project('project-a'), project('project-b', 'grid')]),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    } as WorkManagerGateway['projects']);

    expect(fixture.nativeElement.textContent).toContain('Website launch');
    expect(fixture.nativeElement.textContent).toContain('Office renovation');
    expect(controls(fixture, 'project-a')).toHaveLength(2);
    expect(controls(fixture, 'project-b')).toHaveLength(2);
    expect(pressed(controls(fixture, 'project-a').find(({ value }) => value === 'flow'))).toBe(true);
    expect(pressed(controls(fixture, 'project-b').find(({ value }) => value === 'grid'))).toBe(true);
    expect(fixture.nativeElement.querySelector('[data-slice-12-deferral]')?.textContent).toContain(
      'Slice 12',
    );
  });

  it('persists a selected project independently and exposes update failures', async () => {
    const update = vi.fn(
      async (id: ProjectId, input: { projectLayoutMode?: ProjectLayoutMode }) => {
        if (id === 'project-b') throw new GatewayError('unreachable', 0, 'layout save failed');
        return project(id, input.projectLayoutMode);
      },
    );
    const fixture = await render({
      list: vi.fn(async () => [project('project-a'), project('project-b')]),
      get: vi.fn(),
      create: vi.fn(),
      update,
    } as WorkManagerGateway['projects']);

    const gridA = controls(fixture, 'project-a').find(({ value }) => value === 'grid')!;
    gridA.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(update).toHaveBeenCalledWith('project-a', { projectLayoutMode: 'grid' });
    expect(pressed(gridA)).toBe(true);

    const gridB = controls(fixture, 'project-b').find(({ value }) => value === 'grid')!;
    gridB.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-state-error]')?.textContent).toContain(
      'layout save failed',
    );
    expect(pressed(controls(fixture, 'project-b').find(({ value }) => value === 'flow'))).toBe(true);
    expect(pressed(controls(fixture, 'project-b').find(({ value }) => value === 'grid'))).toBe(false);
  });

  it('disables only the project whose layout PATCH is pending', async () => {
    let release!: () => void;
    const update = vi.fn(
      async (id: ProjectId, input: { projectLayoutMode?: ProjectLayoutMode }) => {
        await new Promise<void>((resolve) => (release = resolve));
        return project(id, input.projectLayoutMode);
      },
    );
    const fixture = await render({
      list: vi.fn(async () => [project('project-a'), project('project-b')]),
      get: vi.fn(),
      create: vi.fn(),
      update,
    } as WorkManagerGateway['projects']);

    controls(fixture, 'project-a').find(({ value }) => value === 'grid')!.click();
    fixture.detectChanges();

    expect(controls(fixture, 'project-a').every(({ disabled }) => disabled)).toBe(true);
    expect(controls(fixture, 'project-b').every(({ disabled }) => !disabled)).toBe(true);

    release();
    await fixture.whenStable();
  });
});
