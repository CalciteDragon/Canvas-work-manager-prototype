import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ProjectSectionSchema, ResolvedSectionShortcutSchema } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { ShortcutFrame } from './shortcut-frame';

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
      type: 'rich-text',
      position: 0,
      columnSpan: 12,
      collapsed: false,
      config: { text: 'Canonical source' },
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

const render = (value = shortcut(), editMode = false) => {
  const fixture = TestBed.createComponent(ShortcutFrame);
  fixture.componentRef.setInput('shortcut', value);
  fixture.componentRef.setInput('editMode', editMode);
  fixture.componentRef.setInput('projectDataRevision', 0);
  fixture.componentRef.setInput('projectHierarchyRevision', 0);
  fixture.detectChanges();
  return fixture;
};

const query = (fixture: ReturnType<typeof render>, selector: string) =>
  fixture.nativeElement.querySelector(selector) as HTMLElement | null;

describe('ShortcutFrame (§27)', () => {
  it('renders source identity and content read-only, without section writes', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = render();

    expect(query(fixture, '[data-shortcut-source]')?.textContent).toContain('Website launch / Kitchen');
    expect(query(fixture, '[data-rich-text-body]')).not.toBeNull();
    expect(query(fixture, '[data-rich-text-body]')?.hasAttribute('readonly')).toBe(true);
    expect(query(fixture, '[data-shortcut-open-source]')).not.toBeNull();
    expect(query(fixture, '[data-shortcut-remove]')).toBeNull();
  });

  it('keeps placement controls in edit mode but does not expose source editing controls', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = render(shortcut(), true);

    expect(query(fixture, '[data-shortcut-drag-handle]')).not.toBeNull();
    expect(query(fixture, '[data-shortcut-size]')).not.toBeNull();
    expect(query(fixture, '[data-shortcut-remove]')).not.toBeNull();
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
