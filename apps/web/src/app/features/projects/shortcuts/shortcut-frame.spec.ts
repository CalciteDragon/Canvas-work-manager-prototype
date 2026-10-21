import { DeferBlockState, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ProjectSectionSchema, ResolvedSectionShortcutSchema, type ProjectId } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { ShortcutFrame } from './shortcut-frame';
import { WORK_MANAGER_GATEWAY } from '../../../core/gateway/work-manager-gateway';
import { FakeWorkManagerGateway } from '../../../core/gateway/testing/fake-gateway';

const AT = '2026-08-27T16:00:00.000Z';

const shortcut = (overrides: Record<string, unknown> = {}) =>
  ResolvedSectionShortcutSchema.parse({
    id: 'shortcut-a',
    pageId: 'page-project-a',
    sourceSectionId: 'section-source',
    position: 0,
    columnSpan: 12,
    collapsed: false,
    createdAt: AT,
    updatedAt: AT,
    source: ProjectSectionSchema.parse({
      id: 'section-source',
      projectId: 'project-a',
      pageId: 'page-project-a-work',
      type: 'markdown',
      position: 0,
      columnSpan: 12,
      collapsed: false,
      config: { markdown: 'Canonical source' },
      createdAt: AT,
      updatedAt: AT,
    }),
    sourceProjectId: 'project-a',
    sourceProjectName: 'Website launch',
    sourcePageKind: 'work',
    breadcrumb: ['Website launch', 'Kitchen'],
    availability: 'available',
    ...overrides,
  });

const render = (value = shortcut()) => {
  const fixture = TestBed.createComponent(ShortcutFrame);
  fixture.componentRef.setInput('shortcut', value);
  fixture.componentRef.setInput('projectDataRevision', 0);
  fixture.componentRef.setInput('projectHierarchyRevision', 0);
  fixture.detectChanges();
  return fixture;
};

const query = (fixture: ReturnType<typeof render>, selector: string) =>
  fixture.nativeElement.querySelector(selector) as HTMLElement | null;

describe('ShortcutFrame (§27)', () => {
  it('renders source identity and content read-only, without section writes', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = render();
    for (const block of await fixture.getDeferBlocks()) await block.render(DeferBlockState.Complete);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(query(fixture, '[data-shortcut-source]')?.textContent).toContain('Website launch / Kitchen');
    expect(query(fixture, 'app-markdown-renderer')?.textContent).toContain('Canonical source');
    expect(query(fixture, '[data-markdown-edit]')).toBeNull();
    expect(query(fixture, '[data-shortcut-open-source]')).not.toBeNull();
    expect(query(fixture, 'h2')?.textContent?.replace('↗', '').trim()).toBe('Markdown (Website launch)');
    expect(query(fixture, '[data-shortcut-drag-handle]')?.getAttribute('aria-label')).toBe('Move shortcut to Markdown (Website launch)');
    expect(query(fixture, '[data-shortcut-collapse]')?.getAttribute('aria-label')).toBe('Collapse Markdown (Website launch)');
    expect(query(fixture, '[data-shortcut-remove]')?.getAttribute('aria-label')).toBe('Remove shortcut to Markdown (Website launch)');
  });

  it('uses a titled source name alone in its heading and controls', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const value = shortcut();
    const fixture = render(shortcut({ source: { ...value.source, title: 'Launch brief' } }));

    expect(query(fixture, 'h2')?.textContent?.replace('↗', '').trim()).toBe('Launch brief');
    expect(query(fixture, '[data-shortcut-drag-handle]')?.getAttribute('aria-label')).toBe('Move shortcut to Launch brief');
    expect(query(fixture, '[data-shortcut-collapse]')?.getAttribute('aria-label')).toBe('Collapse Launch brief');
    expect(query(fixture, '[data-shortcut-remove]')?.getAttribute('aria-label')).toBe('Remove shortcut to Launch brief');
  });

  it('lets the canvas focus its heading without adding it to the tab order (Slice 75, W3-016)', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = render();
    const heading = query(fixture, '[data-shortcut-title]')!;

    expect(heading.tagName).toBe('H2');
    expect(heading.getAttribute('tabindex')).toBe('-1');
    heading.focus();
    expect(document.activeElement).toBe(heading);
  });

  it('keeps layout controls available without exposing source editing or sizing controls', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = render();

    expect(query(fixture, '[data-shortcut-drag-handle]')).not.toBeNull();
    expect(query(fixture, '[data-shortcut-remove]')).not.toBeNull();
    expect(query(fixture, '[data-shortcut-size]')).toBeNull();
    expect(query(fixture, '[data-section-config]')).toBeNull();
  });

  it('shows an unavailable source without mounting its content', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = render(shortcut({ availability: 'source_archived' }));

    expect(query(fixture, '[data-shortcut-unavailable]')?.textContent).toContain('archived');
    expect(query(fixture, '[data-shortcut-content]')).toBeNull();
  });

  it('uses the distinct hidden-source state and keeps the content unmounted', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = render(shortcut({ availability: 'source_hidden' }));

    expect(query(fixture, '[data-shortcut-frame]')?.getAttribute('data-shortcut-availability')).toBe('source_hidden');
    expect(query(fixture, '[data-shortcut-unavailable]')?.textContent).toContain('project or parent');
    expect(query(fixture, '[data-shortcut-content]')).toBeNull();
  });

  it('keeps the no-op content input callbacks stable across change detection', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = render();
    const first = fixture.componentInstance.contentInputs();
    fixture.detectChanges();

    expect(fixture.componentInstance.contentInputs()).toBe(first);
    expect(first.readOnly).toBe(true);
    expect(first.onConfigChange).toBe(fixture.componentInstance.contentInputs().onConfigChange);
  });
});

it('markdown shortcut is read-only', async () => {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const value = shortcut();
  const fixture = render(shortcut({ source: { ...value.source, type: 'markdown', config: { markdown: '# Canonical source' } } }));
  for (const block of await fixture.getDeferBlocks()) await block.render(DeferBlockState.Complete);
  await fixture.whenStable();
  fixture.detectChanges();
  expect(query(fixture, 'h3')?.textContent).toBe('Canonical source');
  expect(query(fixture, '[data-markdown-edit]')).toBeNull();
  expect(await fixture.componentInstance.contentInputs().onConfigChange({ markdown: 'ignored' })).toBe(false);
});

it('a shortcut to a Markdown section holding an extra key shows only the guidance (Slice 64)', async () => {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const value = shortcut();
  const fixture = render(shortcut({ source: { ...value.source, type: 'markdown', config: { markdown: 'Autumn planting only\\.', extra: 'kept' } } }));
  for (const block of await fixture.getDeferBlocks()) await block.render(DeferBlockState.Complete);
  await fixture.whenStable();
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).not.toContain('Autumn planting only');
  expect(query(fixture, '[data-markdown-unreadable]')).not.toBeNull();
  expect(query(fixture, '[data-markdown-edit]')).toBeNull();
  expect(query(fixture, 'app-markdown-source-editor')).toBeNull();
});

// Slice 72 (L5-004): untitled Progress shortcuts from different owners name their bars from the
// frame's own name, so two bars on one canvas never share a name.
it('gives two untitled Progress shortcuts from different owners distinct bar names', async () => {
  const gateway = new FakeWorkManagerGateway({ progress: { projectId: 'project-a' as ProjectId, formula: 'count', percentage: 50, completed: 1, total: 2, explanation: 'half done' } });
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: WORK_MANAGER_GATEWAY, useValue: gateway }] });
  const progressShortcut = (owner: string) => shortcut({
    source: ProjectSectionSchema.parse({ id: `section-${owner}`, projectId: 'project-a', pageId: 'page-project-a-work', type: 'progress', position: 0, columnSpan: 12, collapsed: false, config: {}, createdAt: AT, updatedAt: AT }),
    sourceProjectName: owner,
  });
  const names: (string | null)[] = [];
  for (const owner of ['Kitchen', 'Garden']) {
    const fixture = render(progressShortcut(owner));
    for (const block of await fixture.getDeferBlocks()) await block.render(DeferBlockState.Complete);
    await fixture.whenStable();
    for (let index = 0; index < 5; index += 1) await Promise.resolve();
    fixture.detectChanges();
    names.push(query(fixture, '[role="progressbar"]')?.getAttribute('aria-label') ?? null);
  }
  expect(names).toEqual(['Progress (Kitchen)', 'Progress (Garden)']);
});
