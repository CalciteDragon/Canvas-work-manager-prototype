import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { RECEIPT_UNDO, inertReceiptUndo, type ReceiptUndo, type ReceiptUndoOffer } from '../../../core/history/receipt-undo';
import {
  ProjectArchiveItemSchema,
  ProjectArchiveResultSchema,
  ProjectSchema,
  ProjectSectionSchema,
  type ProjectArchiveResult,
  type ProjectId,
  type ProjectPageId,
} from '@cwm/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GatewayError } from '../../../core/gateway/gateway-error';
import { FakeWorkManagerGateway } from '../../../core/gateway/testing/fake-gateway';
import { WORK_MANAGER_GATEWAY } from '../../../core/gateway/work-manager-gateway';
import { LIVE_UPDATES } from '../../../core/live/live-updates';
import { FakeLiveUpdates } from '../../../core/live/testing/fake-live-updates';
import { ArchivePage } from './archive-page';

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
const AT = '2026-09-02T06:13:32.422Z';
const PROJECT = 'project-archive-page' as ProjectId;
const root = ProjectSchema.parse({
  id: PROJECT,
  workspaceId: 'workspace-demo',
  kind: 'root',
  name: 'Website launch',
  status: 'active',
  projectLayoutMode: 'flow',
  createdAt: AT,
  updatedAt: AT,
});
const section = ProjectSectionSchema.parse({
  id: 'section-archive-page',
  projectId: PROJECT,
  pageId: 'page-archive-page',
  type: 'task-list',
  title: 'Backlog',
  position: 0,
  columnSpan: 12,
  collapsed: false,
  config: {},
  archivedAt: AT,
  createdAt: AT,
  updatedAt: AT,
});
const archive: ProjectArchiveResult = ProjectArchiveResultSchema.parse({
  projectId: PROJECT,
  root,
  items: [
    ProjectArchiveItemSchema.parse({
      kind: 'section',
      section,
      origin: {
        projectId: PROJECT,
        pageId: section.pageId,
        sectionId: section.id,
        sectionName: 'Backlog',
        pageKind: 'home',
        pageEnabled: true,
        breadcrumb: [{ projectId: PROJECT, name: root.name }],
      },
      cause: { kind: 'own' },
      cascadeCount: 0,
      recovery: { kind: 'owned-content', ownedData: 'tasks', contentCount: 2, separateRestoreCount: 2 },
      restoration: { kind: 'ready', operation: 'restore_section', permission: 'projects.write' },
    }),
  ],
});

const render = async (answer: ProjectArchiveResult = archive, receiptUndo?: ReceiptUndo) => {
  const gateway = new FakeWorkManagerGateway({ projects: [root], sections: [section], archive: answer });
  const live = new FakeLiveUpdates();
  const dataChanged = vi.fn();
  const hierarchyChanged = vi.fn();

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: WORK_MANAGER_GATEWAY, useValue: gateway },
      { provide: LIVE_UPDATES, useValue: live },
      ...(receiptUndo === undefined ? [] : [{ provide: RECEIPT_UNDO, useValue: receiptUndo }]),
    ],
  });
  const fixture = TestBed.createComponent(ArchivePage);
  fixture.componentRef.setInput('projectId', PROJECT);
  fixture.componentRef.setInput('pageId', 'page-archive' as ProjectPageId);
  fixture.componentRef.setInput('projectLayoutMode', 'flow');
  fixture.componentRef.setInput('restoreBlocked', false);
  fixture.componentRef.setInput('shortcutsAllowed', false);
  fixture.componentRef.setInput('rootProjectId', PROJECT);
  fixture.componentRef.setInput('onProjectDataChange', dataChanged);
  fixture.componentRef.setInput('onProjectHierarchyChange', hierarchyChanged);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  return { fixture, gateway, dataChanged, hierarchyChanged };
};

describe('ArchivePage (§31)', () => {
  it('confirms Restore in the toast with its canonical route, Undo, and focus recovery', async () => {
    const { fixture, gateway } = await render(archive, { ...inertReceiptUndo(), offer: () => 'ready' });
    const host = fixture.nativeElement as HTMLElement;
    gateway.archive.get = vi.fn().mockResolvedValue({ ...archive, items: [] });
    const restore = host.querySelector<HTMLButtonElement>('[data-archived-restore]')!;
    restore.focus(); restore.click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(host.querySelector('[data-toast]')?.textContent).toContain('Restored “Backlog” to Website launch › Home.');
    const go = host.querySelector<HTMLAnchorElement>('[data-restore-go]')!;
    expect(go?.getAttribute('href')).toBe('/projects/project-archive-page/pages/home#section-section-archive-page');
    expect(host.querySelector('[data-restore-undo]')).not.toBeNull();
    expect(document.activeElement).toBe(go);
    host.querySelector<HTMLButtonElement>('[data-toast-dismiss]')!.click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(document.activeElement).toBe(host.querySelector('#archive-page-title'));
  });

  it('names a saving Undo and withdraws it when the receipt becomes unavailable', async () => {
    const offer = signal<ReceiptUndoOffer>('saving');
    const { fixture, gateway } = await render(archive, { ...inertReceiptUndo(), offer: () => offer() });
    gateway.archive.get = vi.fn().mockResolvedValue({ ...archive, items: [] });
    fixture.nativeElement.querySelector('[data-archived-restore]').click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-restore-undo]')?.getAttribute('aria-label')).toBe('Undo (saving…)');
    expect(fixture.nativeElement.querySelector('[data-restore-undo]')?.getAttribute('aria-disabled')).toBe('true');
    offer.set('unavailable'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-restore-undo]')).toBeNull();
  });

  it.each([false, true])('withdraws the restored destination after Undo and shows its returned owner link: %s', async (hasLink) => {
    const result = { tone: 'status' as const, message: 'Undone: Restored Backlog.',
      ...(hasLink ? { link: { projectId: 'project-kitchen' as ProjectId, label: 'Open Kitchen' } } : {}) };
    const { fixture, gateway } = await render(archive, { ...inertReceiptUndo(), offer: () => 'ready', undo: async () => result });
    gateway.archive.get = vi.fn().mockResolvedValue({ ...archive, items: [] });
    fixture.nativeElement.querySelector('[data-archived-restore]').click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-restore-go]')).not.toBeNull();
    await fixture.componentInstance.toast.undo();
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-restore-go]')).toBeNull();
    const owner = fixture.nativeElement.querySelector('a[data-toast-open]');
    expect(owner?.getAttribute('href') ?? null).toBe(hasLink ? '/projects/project-kitchen' : null);
    expect(owner?.textContent?.trim() ?? null).toBe(hasLink ? 'Open Kitchen' : null);
  });

  it('names a disabled origin page and offers no Go to it', async () => {
    const item = archive.items[0]!;
    const { fixture, gateway } = await render({ ...archive, items: [{ ...item, origin: { ...item.origin, pageEnabled: false } }] });
    gateway.archive.get = vi.fn().mockResolvedValue({ ...archive, items: [] });
    fixture.nativeElement.querySelector('[data-archived-restore]').click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-toast]')?.textContent).toContain('Home, which is switched off.');
    expect(fixture.nativeElement.querySelector('[data-restore-go]')).toBeNull();
  });

  it('links a restored workstream to its own route and refreshes the hierarchy', async () => {
    const child = ProjectSchema.parse({ ...root, id: 'project-kitchen', kind: 'subproject', parentProjectId: PROJECT, name: 'Kitchen', status: 'archived' });
    const item = ProjectArchiveItemSchema.parse({ kind: 'subproject', project: child,
      origin: { ...archive.items[0]!.origin, projectId: child.id, pageKind: 'work', breadcrumb: [{ projectId: PROJECT, name: root.name }, { projectId: child.id, name: child.name }] },
      cause: { kind: 'own' }, restoration: { kind: 'ready', operation: 'restore_project', permission: 'projects.write' } });
    const { fixture, gateway, hierarchyChanged } = await render({ ...archive, items: [item] });
    gateway.options.projects = [root, child];
    gateway.archive.get = vi.fn().mockResolvedValue({ ...archive, items: [] });
    fixture.nativeElement.querySelector('[data-archived-restore]').click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-restore-go]')?.getAttribute('href')).toBe('/projects/project-kitchen');
    expect(hierarchyChanged).toHaveBeenCalledTimes(1);
  });

  it('dismissal focuses the next surviving Restore', async () => {
    const next = ProjectArchiveItemSchema.parse({ ...archive.items[0], section: { ...section, id: 'section-next', title: 'Next' } });
    const { fixture, gateway } = await render({ ...archive, items: [archive.items[0]!, next] });
    gateway.archive.get = vi.fn().mockResolvedValue({ ...archive, items: [next] });
    const host = fixture.nativeElement as HTMLElement;
    const restore = host.querySelector<HTMLButtonElement>('[data-archived-restore]')!;
    restore.focus(); restore.click(); await fixture.whenStable(); fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('[data-toast-dismiss]')!.click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(document.activeElement).toBe(host.querySelector('[data-archived-restore]'));
  });
  it('renders archive rows and their owning-page origin', async () => {
    const { fixture } = await render();

    expect(fixture.nativeElement.querySelector('[data-archive-root-guidance]')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('[data-archived-item]')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('[data-archived-origin-link]')?.textContent).toContain('Home');
    expect(fixture.nativeElement.querySelector('[data-archived-origin-link]')?.getAttribute('href')).toBe(
      '/projects/project-archive-page/pages/home#section-section-archive-page',
    );
  });

  it('renders the domain projection’s content and two-step guidance as supplied', async () => {
    const { fixture } = await render();

    expect(fixture.nativeElement.querySelector('[data-archived-content]')?.textContent).toContain('2 tasks in this section');
    expect(fixture.nativeElement.querySelector('[data-archived-recovery-guidance]')?.textContent).toContain(
      'Restore this section first, then restore its 2 archived tasks separately.',
    );
  });

  it('says nothing is archived for an empty projection', async () => {
    const { fixture } = await render({ ...archive, items: [] });

    expect(fixture.nativeElement.querySelector('[data-archive-empty]')?.textContent).toContain('Nothing is ready to restore');
    expect(fixture.nativeElement.querySelector('[data-archived-item]')).toBeNull();
  });

  it('awaits a canonical restore and tells the shell what changed', async () => {
    const { fixture, gateway, dataChanged, hierarchyChanged } = await render();
    gateway.archive.get = vi.fn().mockResolvedValue({ ...archive, items: [] });

    (fixture.nativeElement.querySelector('[data-archived-restore]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(gateway.calls.filter(({ method }) => method === 'sections.restore')).toHaveLength(1);
    expect(dataChanged).toHaveBeenCalledTimes(1);
    expect(hierarchyChanged).not.toHaveBeenCalled();
  });

  // Slice 47: the retained row stays visibly blocked, with its error and Retry, while Retry's
  // read is pending — and the block is not mistaken for an archived project.
  it('keeps the stale row blocked with its error and Retry until a current read replaces it', async () => {
    const { fixture, gateway } = await render();
    const host = fixture.nativeElement as HTMLElement;
    gateway.archive.get = vi.fn().mockRejectedValue(new GatewayError('unreachable', 0, 'archive read failed'));

    host.querySelector<HTMLButtonElement>('[data-archived-restore]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.querySelector('[data-archive-error] [data-failure-sentence]')?.textContent).toMatch(/^Restored “.+”, but Archive couldn’t refresh\.$/);
    expect(host.querySelector('[data-archive-error] [data-recovery]')?.textContent?.trim()).toBe('Retry refresh');
    expect(host.querySelector<HTMLButtonElement>('[data-archived-restore]')!.disabled).toBe(true);
    expect(host.querySelector('[data-archived-blocked]')).toBeNull();

    let answer!: (result: ProjectArchiveResult) => void;
    gateway.archive.get = vi.fn(() => new Promise<ProjectArchiveResult>((resolve) => { answer = resolve; }));
    host.querySelector<HTMLButtonElement>('[data-archive-error] [data-recovery]')!.click();
    fixture.detectChanges();
    expect(host.querySelector('[data-archive-error]')?.textContent).toContain('but Archive couldn’t refresh');
    expect(host.querySelector('[data-archive-error] [data-recovery]')?.getAttribute('aria-disabled')).toBe('true');
    expect(host.querySelector<HTMLButtonElement>('[data-archived-restore]')!.disabled).toBe(true);
    host.querySelector<HTMLButtonElement>('[data-archived-restore]')!.click();

    answer({ ...archive, items: [] });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.querySelector('[data-archive-error]')).toBeNull();
    expect(host.querySelector('[data-archived-item]')).toBeNull();
    expect(gateway.calls.filter(({ method }) => method === 'sections.restore')).toHaveLength(1);
  });

  it('says a failed first read with Try again and no empty sentence; a failed read over the list politely (Slice 78)', async () => {
    const { fixture, gateway } = await render();
    const host = fixture.nativeElement as HTMLElement;
    gateway.archive.get = vi.fn().mockRejectedValue(new GatewayError('unreachable', 0, 'archive read failed'));
    await fixture.componentInstance.store.load(PROJECT, { quiet: true });
    fixture.detectChanges();

    const status = host.querySelector('[data-archive-error]')!;
    expect(status.querySelector('[data-failure-sentence]')?.textContent?.trim()).toBe('This archive may be out of date.');
    expect(status.querySelector('[data-failure-sentence]')?.getAttribute('role')).toBe('status');
    expect(host.querySelector('[role="status"] [role="alert"], [role="alert"] [role="status"]')).toBeNull();
    expect(status.querySelector('[data-recovery]')?.textContent?.trim()).toBe('Try again');
    expect(host.textContent).not.toContain('Couldn’t load');
    expect(host.querySelector('[data-archived-item]')).not.toBeNull();
    expect(host.querySelector<HTMLButtonElement>('[data-archived-restore]')!.disabled).toBe(true);
  });
});
