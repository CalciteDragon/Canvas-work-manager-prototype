import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ProjectSchema, type Project, type ProjectRestoreStatus } from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { OwnerRestoreFailure } from './project-workspace-store';
import { ArchivedBanner } from './archived-banner';

const AT = '2026-08-27T16:00:00.000Z';
const project = (id: string, name: string, status: 'active' | 'archived', parentProjectId?: string): Project =>
  ProjectSchema.parse({
    id,
    workspaceId: 'workspace-demo',
    ...(parentProjectId === undefined ? { kind: 'root' } : { kind: 'subproject', parentProjectId }),
    name,
    status,
    projectLayoutMode: 'flow',
    createdAt: AT,
    updatedAt: AT,
  });

const ATTIC = project('project-attic', 'Legacy attic', 'archived');
const SHELVING = project('project-shelving', 'Legacy shelving', 'active', 'project-attic');
const RENOVATION = project('project-renovation', 'Home renovation', 'archived');
const KITCHEN = project('project-kitchen', 'Kitchen', 'archived', 'project-renovation');

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ArchivedBanner],
  template: `
    <app-archived-banner [project]="project()" [owner]="owner()" [pending]="pending()" [disabled]="disabled()"
      [failure]="failure()" (restore)="restored($event)" />
  `,
})
class Host {
  readonly project = signal(ATTIC);
  readonly owner = signal(ATTIC);
  readonly pending = signal(false);
  readonly disabled = signal(false);
  readonly failure = signal<OwnerRestoreFailure | null>(null);
  readonly restored = vi.fn<(status: ProjectRestoreStatus) => void>();
}

const setup = (projectValue: Project, owner: Project) => {
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.project.set(projectValue);
  fixture.componentInstance.owner.set(owner);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const banner = () => element.querySelector<HTMLElement>('app-archived-banner')!;
  const sentence = () => banner().querySelector('[data-archived-sentence]')?.textContent?.trim();
  const select = () => banner().querySelector<HTMLSelectElement>('select[data-restore-status]')!;
  const button = () => banner().querySelector<HTMLButtonElement>('button[data-restore-action]')!;
  return { fixture, host: fixture.componentInstance, banner, sentence, select, button };
};

describe('ArchivedBanner (Slice 79, §26, §31, L4-007, L1-028)', () => {
  it('says the project itself is archived, and restores it', () => {
    const { sentence, button, host, banner } = setup(ATTIC, ATTIC);

    expect(banner().classList).toContain('state-message--archived');
    expect(sentence()).toBe('“Legacy attic” is archived.');
    expect(button().getAttribute('aria-label')).toBe('Restore Legacy attic');
    button().click();
    expect(host.restored).toHaveBeenLastCalledWith('active');
  });

  it('names the archived ancestor that holds live work, and restores the ancestor', () => {
    const { sentence, button } = setup(SHELVING, ATTIC);

    expect(sentence()).toBe('“Legacy shelving” is inside “Legacy attic”, which is archived.');
    expect(button().getAttribute('aria-label')).toBe('Restore Legacy attic');
  });

  it('says “archived, and so is” when the project and an outer owner are both archived, offering the outer one', () => {
    const { sentence, button } = setup(KITCHEN, RENOVATION);

    expect(sentence()).toBe('“Kitchen” is archived, and so is “Home renovation”, which holds it.');
    expect(button().getAttribute('aria-label')).toBe('Restore Home renovation');
  });

  it('emits the chosen status, and starts on Active again when the owner moves on', () => {
    const { select, button, host, fixture } = setup(KITCHEN, RENOVATION);

    select().value = 'on_hold';
    select().dispatchEvent(new Event('change'));
    fixture.detectChanges();
    button().click();
    expect(host.restored).toHaveBeenLastCalledWith('on_hold');

    // A context refresh replaces the record, not the owner: the choice stays.
    host.owner.set({ ...RENOVATION });
    fixture.detectChanges();
    expect(select().value).toBe('on_hold');

    host.owner.set(KITCHEN);
    fixture.detectChanges();
    expect(select().value).toBe('active');
  });

  it('is busy while the restore runs: aria-busy on the banner, the controls aria-disabled and refusing a press', () => {
    const { banner, button, select, host, fixture } = setup(ATTIC, ATTIC);

    host.pending.set(true);
    fixture.detectChanges();

    expect(banner().getAttribute('aria-busy')).toBe('true');
    expect(button().getAttribute('aria-disabled')).toBe('true');
    expect(select().getAttribute('aria-disabled')).toBe('true');
    expect(button().disabled).toBe(false);
    button().click();
    expect(host.restored).not.toHaveBeenCalled();

    host.pending.set(false);
    fixture.detectChanges();
    expect(banner().hasAttribute('aria-busy')).toBe(false);
  });

  it('disables the choice natively while another project write runs', () => {
    const { button, select, host, fixture } = setup(ATTIC, ATTIC);

    host.disabled.set(true);
    fixture.detectChanges();

    expect(button().disabled).toBe(true);
    expect(select().disabled).toBe(true);
  });

  it('shows a failure in the banner with Details, and Try again repeats the last status', () => {
    const { banner, select, button, host, fixture } = setup(ATTIC, ATTIC);
    select().value = 'planning';
    select().dispatchEvent(new Event('change'));
    fixture.detectChanges();
    button().click();

    host.failure.set({ ownerId: ATTIC.id, sentence: 'Couldn’t restore “Legacy attic”. Try again.', reason: 'Host unreachable', retryable: true });
    fixture.detectChanges();

    const failure = banner().querySelector<HTMLElement>('app-failure-message[data-archived-restore-error]')!;
    expect(failure.querySelector('[data-failure-sentence]')?.textContent?.trim()).toBe('Couldn’t restore “Legacy attic”. Try again.');
    expect(failure.querySelector('[data-failure-sentence]')?.getAttribute('role')).toBe('alert');
    expect(failure.querySelector('details summary')?.textContent?.trim()).toBe('Details');
    expect(failure.querySelector('details p')?.textContent?.trim()).toBe('Host unreachable');

    failure.querySelector<HTMLButtonElement>('[data-recovery="try-again"]')!.click();
    expect(host.restored).toHaveBeenCalledTimes(2);
    expect(host.restored).toHaveBeenLastCalledWith('planning');
  });

  it('offers no Try again when retrying could not help, and ignores a failure for another owner', () => {
    const { banner, host, fixture } = setup(ATTIC, ATTIC);

    host.failure.set({ ownerId: ATTIC.id, sentence: 'Couldn’t restore “Legacy attic”. It may have changed elsewhere.', reason: 'not_found', retryable: false });
    fixture.detectChanges();
    expect(banner().querySelector('[data-archived-restore-error] [data-failure-sentence]')?.textContent?.trim())
      .toBe('Couldn’t restore “Legacy attic”. It may have changed elsewhere.');
    expect(banner().querySelector('[data-recovery]')).toBeNull();

    host.failure.set({ ownerId: RENOVATION.id, sentence: 'Couldn’t restore “Home renovation”. Try again.', reason: null, retryable: true });
    fixture.detectChanges();
    expect(banner().querySelector('[data-archived-restore-error]')).toBeNull();
  });
});
