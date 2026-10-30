import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  ProjectJournalResultSchema,
  ProjectPageSchema,
  ProjectSchema,
  ProjectSectionSchema,
  ProjectCompletedWorkResultSchema,
  type ProjectId,
  type ProjectPageId,
  type OperationActionId,
  type OperationHistoryId,
  type OperationReceipt,
} from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import { GatewayError } from '../../../core/gateway/gateway-error';
import { FakeWorkManagerGateway } from '../../../core/gateway/testing/fake-gateway';
import { WORK_MANAGER_GATEWAY } from '../../../core/gateway/work-manager-gateway';
import { LIVE_UPDATES } from '../../../core/live/live-updates';
import { FakeLiveUpdates } from '../../../core/live/testing/fake-live-updates';
import { ReflectionsPage } from './reflections-page';

const AT = '2026-09-05T10:00:00.000Z';
const PROJECT = 'project-journal-page' as ProjectId;
const PAGE = 'page-journal-page' as ProjectPageId;
const root = ProjectSchema.parse({
  id: PROJECT,
  workspaceId: 'workspace-demo',
  kind: 'root',
  name: 'Product launch',
  status: 'active',
  projectLayoutMode: 'flow',
  createdAt: AT,
  updatedAt: AT,
});
const page = ProjectPageSchema.parse({ id: PAGE, projectId: PROJECT, kind: 'reflections', enabled: true, createdAt: AT, updatedAt: AT });
const section = ProjectSectionSchema.parse({
  id: 'section-journal-page',
  projectId: PROJECT,
  pageId: PAGE,
  type: 'reflections',
  title: 'Launch notes',
  position: 0,
  columnSpan: 12,
  collapsed: false,
  config: {},
  createdAt: AT,
  updatedAt: AT,
});
const subject = {
  kind: 'task' as const,
  id: 'task-release',
  name: 'Ship release',
  status: 'done' as const,
  completedAt: AT,
  archived: false,
  hiddenByArchivedAncestor: false,
  breadcrumb: [{ projectId: PROJECT, name: root.name }],
};
const journal = ProjectJournalResultSchema.parse({
  projectId: PROJECT,
  items: [{
    reflection: {
      id: 'reflection-page',
      projectId: PROJECT,
      sectionId: section.id,
      subject: { kind: 'task', id: subject.id },
      title: 'Release notes',
      body: 'The release is live.',
      createdAt: AT,
      updatedAt: AT,
    },
    origin: {
      projectId: PROJECT,
      pageId: PAGE,
      pageKind: 'reflections',
      breadcrumb: [{ projectId: PROJECT, name: root.name }],
      sectionId: section.id,
      sectionName: section.title ?? 'Reflections',
    },
    subject,
  }],
});
const completedWork = ProjectCompletedWorkResultSchema.parse({ projectId: PROJECT, candidates: [subject] });
const addReceipt: OperationReceipt = {
  historyId: 'history-journal-page' as OperationHistoryId,
  actionId: 'operation-reflections-page-add' as OperationActionId,
  operation: 'section.add',
  revision: 1,
  label: 'Add reflections',
  createdAt: AT,
  expiresAt: '2026-09-06T10:00:00.000Z',
};

const render = async (options: { withSection?: boolean; onData?: () => void; completedWork?: typeof completedWork } = {}) => {
  const gateway = new FakeWorkManagerGateway({
    projects: [root],
    pages: [page],
    sections: options.withSection === false ? [] : [section],
    journal,
    completedWork: options.completedWork ?? completedWork,
  });
  const live = new FakeLiveUpdates();
  const onData = options.onData ?? vi.fn();
  const onHierarchy = vi.fn();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: WORK_MANAGER_GATEWAY, useValue: gateway }, { provide: LIVE_UPDATES, useValue: live }],
  });
  const fixture = TestBed.createComponent(ReflectionsPage);
  fixture.componentRef.setInput('projectId', PROJECT);
  fixture.componentRef.setInput('pageId', PAGE);
  fixture.componentRef.setInput('projectLayoutMode', 'flow');
  fixture.componentRef.setInput('restoreBlocked', false);
  fixture.componentRef.setInput('shortcutsAllowed', false);
  fixture.componentRef.setInput('rootProjectId', PROJECT);
  fixture.componentRef.setInput('onProjectDataChange', onData);
  fixture.componentRef.setInput('onProjectHierarchyChange', onHierarchy);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, gateway, onData, onHierarchy };
};

const query = (fixture: Awaited<ReturnType<typeof render>>['fixture'], selector: string) =>
  fixture.nativeElement.querySelector(selector) as HTMLElement | null;

describe('ReflectionsPage (§36)', () => {
  it('calls a completed subproject a workstream in the subject picker', async () => {
    const { fixture } = await render({ completedWork: ProjectCompletedWorkResultSchema.parse({
      projectId: PROJECT,
      candidates: [{ ...subject, kind: 'subproject', id: 'project-kitchen', name: 'Kitchen', status: 'completed' }],
    }) });

    expect(query(fixture, '[data-subject-id="project-kitchen"]')?.textContent?.trim()).toBe('Kitchen · Workstream');
  });

  it('renders the page container, picker, linked subject and canonical owner link', async () => {
    const { fixture } = await render();

    expect(query(fixture, '[data-reflections-page]')).not.toBeNull();
    expect(query(fixture, '[data-reflections-container-name]')?.textContent).toContain('Launch notes');
    expect(query(fixture, '[data-reflections-entry]')?.textContent).toContain('Release notes');
    expect(query(fixture, '[data-reflections-subject]')?.textContent).toContain('Ship release');
    expect(query(fixture, '[data-reflections-owner-link]')?.getAttribute('href')).toBe(
      '/projects/project-journal-page/pages/reflections#section-section-journal-page',
    );
  });

  // Slice 72 (L5-003, W1-022): the subject picker has a visible label.
  it('labels the subject picker with a visible "Subject" control label', async () => {
    const { fixture } = await render();
    const picker = query(fixture, '[data-reflections-subject-picker]') as HTMLSelectElement;

    expect(picker.labels?.[0]?.textContent?.trim()).toBe('Subject');
    expect(picker.labels?.[0]?.classList).toContain('control-label');
  });

  it('selects completed work, writes a linked reflection, clears the draft and notifies project data', async () => {
    const { fixture, gateway, onData } = await render();
    const picker = query(fixture, '[data-reflections-subject-picker]') as HTMLSelectElement;
    picker.value = 'task:task-release';
    picker.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const title = query(fixture, '[data-reflection-title]') as HTMLInputElement;
    const body = query(fixture, '[data-reflection-body]') as HTMLTextAreaElement;
    title.value = '  New checkpoint  ';
    body.value = '  The handoff was smooth.  ';
    query(fixture, '[data-reflection-create]')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(gateway.argumentTo('reflections.create')).toEqual({
      projectId: PROJECT,
      sectionId: section.id,
      title: 'New checkpoint',
      body: 'The handoff was smooth.',
      subject: { kind: 'task', id: 'task-release' },
    });
    expect(title.value).toBe('');
    expect(body.value).toBe('');
    expect(onData).toHaveBeenCalledOnce();
  });

  it('says a committed save whose refresh failed with Retry refresh, inside the mounted status region (Slice 78)', async () => {
    const { fixture, gateway } = await render();
    gateway.journal.get = vi.fn().mockRejectedValueOnce(new GatewayError('unreachable', 0, 'refresh offline')).mockResolvedValue(journal);
    (query(fixture, '[data-reflection-body]') as HTMLTextAreaElement).value = 'A note';
    query(fixture, '[data-reflection-create]')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    const status = query(fixture, '[data-reflections-status]')!;
    expect(status.getAttribute('role')).toBe('status');
    expect(status.querySelector('[data-reflections-saved-unrefreshed] [data-failure-sentence]')?.textContent?.trim()).toBe('Saved, but this journal couldn’t refresh.');
    expect(status.querySelector('[data-reflections-refresh-error]')).toBeNull();
    status.querySelector<HTMLButtonElement>('[data-recovery="retry-refresh"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(query(fixture, '[data-reflections-saved-unrefreshed]')).toBeNull();
  });

  it('shows a failed journal read with Try again in place of the empty sentence (Slice 78)', async () => {
    const { fixture, gateway } = await render();
    gateway.journal.get = vi.fn().mockRejectedValueOnce(new GatewayError('internal_error', 500, 'journal broke')).mockResolvedValue(journal);
    await fixture.componentInstance.store.load(PROJECT, PAGE);
    fixture.detectChanges();
    expect(query(fixture, '[data-reflections-error] [data-failure-sentence]')?.textContent?.trim()).toBe('Couldn’t load this journal.');
    expect(query(fixture, '[data-reflections-empty]')).toBeNull();

    query(fixture, '[data-reflections-error] [data-recovery="try-again"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(query(fixture, '[data-reflections-error]')).toBeNull();
    expect(query(fixture, '[data-reflections-entry]')).not.toBeNull();
  });

  it('keeps the ordinary empty feed distinct and can add its missing page container', async () => {
    const { fixture, gateway, onHierarchy } = await render({ withSection: false });
    expect(query(fixture, '[data-reflections-no-container]')).not.toBeNull();
    expect(query(fixture, '[data-reflections-empty]')).toBeNull();

    gateway.sections.create = vi.fn(async (_projectId, input) => ({ section: { ...section, ...input }, operation: addReceipt }));
    (query(fixture, '[data-reflections-add-container]') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(gateway.sections.create).toHaveBeenCalledExactlyOnceWith(PROJECT, { type: 'reflections', pageId: PAGE });
    expect(onHierarchy).toHaveBeenCalledOnce();
  });

  it('hides writing controls when the root is archived', async () => {
    const { fixture } = await render();
    fixture.componentRef.setInput('restoreBlocked', true);
    fixture.detectChanges();
    expect(query(fixture, '[data-reflection-create]')).toBeNull();
  });
});
