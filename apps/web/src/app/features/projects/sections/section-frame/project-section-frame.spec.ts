import { ChangeDetectionStrategy, Component, effect, input } from '@angular/core';
import { CdkDragHandle } from '@angular/cdk/drag-drop';
import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { ProjectSectionSchema, type ProjectSection, type SectionConfig } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import type { SectionDefinition } from '../registry';
import { ProjectSectionFrame } from './project-section-frame';

const AT = '2026-08-27T16:00:00.000Z';

const section = (overrides: Record<string, unknown> = {}): ProjectSection =>
  ProjectSectionSchema.parse({
    id: 'section-a',
    projectId: 'project-a',
    type: 'test-content',
    position: 0,
    columnSpan: 12,
    collapsed: false,
    config: { text: 'seeded' },
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  });

/**
 * Counts how often the content component's inputs actually *change*. Counting constructor
 * calls would prove nothing: `setInput` never reconstructs a component, so a rebuilt inputs
 * record shows up as repeated input changes, not repeated construction.
 */
let inputChanges = 0;

@Component({
  selector: 'app-test-content',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button data-test-save type="button" (click)="onConfigChange()({ text: 'edited' })">
    save
  </button><button data-test-hierarchy type="button" (click)="onProjectHierarchyChange()()">hierarchy</button>`,
})
class TestContent {
  readonly section = input.required<ProjectSection>();
  readonly onConfigChange = input.required<(config: SectionConfig) => void>();
  readonly onProjectDataChange = input.required<() => void>();
  readonly onProjectHierarchyChange = input.required<() => void>();
  readonly projectDataRevision = input.required<number>();
  readonly projectHierarchyRevision = input.required<number>();

  constructor() {
    effect(() => {
      // Reading both inputs subscribes to their identity. A record or a callback rebuilt on
      // each change-detection pass is a new identity every pass, and re-runs this.
      this.section();
      this.onConfigChange();
      inputChanges += 1;
    });
  }
}

@Component({
  selector: 'app-test-inspector',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p data-test-inspector>inspector</p>`,
})
class TestInspector {
  readonly section = input.required<ProjectSection>();
  readonly onConfigChange = input.required<(config: SectionConfig) => void>();
  readonly onProjectDataChange = input.required<() => void>();
  readonly onProjectHierarchyChange = input.required<() => void>();
  readonly projectDataRevision = input.required<number>();
  readonly projectHierarchyRevision = input.required<number>();
}

const definition = (overrides: Partial<SectionDefinition> = {}): SectionDefinition => ({
  type: 'test-content',
  displayName: 'Test Content',
  icon: '🧪',
  createDefaultConfig: () => ({}),
  component: TestContent,
  ...overrides,
});

const render = (
  overrides: Record<string, unknown> = {},
  definitionOverrides: Partial<SectionDefinition> = {},
  editMode = true,
) => {
  inputChanges = 0;
  const fixture = TestBed.createComponent(ProjectSectionFrame);
  fixture.componentRef.setInput('section', section(overrides));
  fixture.componentRef.setInput('definition', definition(definitionOverrides));
  fixture.componentRef.setInput('editMode', editMode);
  fixture.componentRef.setInput('projectDataRevision', 0);
  fixture.componentRef.setInput('projectHierarchyRevision', 0);
  fixture.detectChanges();
  return fixture;
};

const query = (fixture: ReturnType<typeof render>, selector: string) =>
  fixture.nativeElement.querySelector(selector) as HTMLElement | null;

describe('ProjectSectionFrame (§31)', () => {
  it('renders the registered content component inside the shared chrome', () => {
    const fixture = render();

    expect(query(fixture, '[data-section-drag-handle]')).not.toBeNull();
    expect(query(fixture, '[data-section-collapse]')).not.toBeNull();
    expect(query(fixture, '[data-section-size]')).not.toBeNull();
    expect(query(fixture, '[data-section-duplicate]')).not.toBeNull();
    expect(query(fixture, '[data-section-remove]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Test Content');
    expect(query(fixture, '[data-test-save]')).not.toBeNull();
  });

  it('prefers the section’s own title over the definition’s display name', () => {
    const fixture = render({ title: 'This week' });

    expect(fixture.nativeElement.textContent).toContain('This week');
  });

  it('emits collapse, resize, duplicate, remove and config-change intent without a gateway', () => {
    const fixture = render();
    const frame = fixture.componentInstance;
    const seen: unknown[] = [];
    frame.collapseToggled.subscribe((event) => seen.push(['collapse', event]));
    frame.resized.subscribe((event) => seen.push(['resize', event]));
    frame.duplicateRequested.subscribe((event) => seen.push(['duplicate', event]));
    frame.removeRequested.subscribe((event) => seen.push(['remove', event]));
    frame.configChanged.subscribe((event) => seen.push(['config', event]));
    frame.projectHierarchyChanged.subscribe(() => seen.push(['hierarchy']));

    query(fixture, '[data-section-collapse]')!.click();
    const size = query(fixture, '[data-section-size]') as HTMLSelectElement;
    size.value = '6';
    size.dispatchEvent(new Event('change'));
    query(fixture, '[data-section-duplicate]')!.click();
    query(fixture, '[data-section-remove]')!.click();
    // Config-change is the one hop that carries a section's actual content upward.
    query(fixture, '[data-test-save]')!.click();
    query(fixture, '[data-test-hierarchy]')!.click();

    expect(seen).toEqual([
      ['collapse', { id: 'section-a', collapsed: true }],
      ['resize', { id: 'section-a', columnSpan: 6 }],
      ['duplicate', 'section-a'],
      ['remove', 'section-a'],
      ['config', { id: 'section-a', config: { text: 'edited' } }],
      ['hierarchy'],
    ]);
  });

  it('hides the content when the section is collapsed', () => {
    const fixture = render({ collapsed: true });

    expect(query(fixture, '[data-section-content]')).toBeNull();
    expect(query(fixture, '[data-section-collapse]')!.getAttribute('aria-expanded')).toBe('false');
  });

  it('does not rebuild the content component on a change-detection pass that changed nothing', () => {
    const fixture = render();
    expect(inputChanges).toBe(1);

    // The invariant directly: the record and the callback keep their identity across reads.
    // `NgComponentOutlet` calls `setInput` for every key on every pass, and only
    // `Object.is` equality stops that from being a change.
    const first = fixture.componentInstance.contentInputs();
    fixture.detectChanges();
    const second = fixture.componentInstance.contentInputs();
    expect(second).toBe(first);
    expect(second.onConfigChange).toBe(first.onConfigChange);
    expect(second.onProjectHierarchyChange).toBe(first.onProjectHierarchyChange);

    fixture.detectChanges();

    // `NgComponentOutlet` re-applies its inputs from `ngDoCheck` on every pass, and only
    // `setInput`'s `Object.is` check stops that from being a change. If the callback or the
    // inputs record were built inline, each pass would be a new identity and this would
    // climb — a self-feeding dirty loop in a zoneless app.
    expect(inputChanges).toBe(1);
  });

  it('renders the definition’s inspector when it has one, and says so when it does not', () => {
    const withoutInspector = render();
    query(withoutInspector, '[data-section-config]')!.click();
    withoutInspector.detectChanges();
    expect(query(withoutInspector, '[data-section-no-settings]')).not.toBeNull();

    const withInspector = render({}, { inspectorComponent: TestInspector });
    query(withInspector, '[data-section-config]')!.click();
    withInspector.detectChanges();
    expect(query(withInspector, '[data-test-inspector]')).not.toBeNull();
  });

  it('leaves collapse usable in view mode but hides every layout-editing control', () => {
    const fixture = render({}, {}, false);
    const seen: unknown[] = [];
    fixture.componentInstance.collapseToggled.subscribe((event) => seen.push(event));

    expect(query(fixture, '[data-section-drag-handle]')).toBeNull();
    expect(query(fixture, '[data-section-size]')).toBeNull();
    expect(query(fixture, '[data-section-config]')).toBeNull();
    expect(query(fixture, '[data-section-duplicate]')).toBeNull();
    expect(query(fixture, '[data-section-remove]')).toBeNull();
    expect(query(fixture, '[data-section-content]')).not.toBeNull();

    query(fixture, '[data-section-collapse]')!.click();
    expect(seen).toEqual([{ id: 'section-a', collapsed: true }]);
  });

  it('attaches a real CDK drag handle only in Edit Layout Mode', () => {
    const fixture = render();

    expect(fixture.debugElement.query(By.directive(CdkDragHandle))).not.toBeNull();
    expect(query(fixture, '[data-section-size]')).not.toBeNull();
    expect(query(fixture, '[data-section-config]')).not.toBeNull();
    expect(query(fixture, '[data-section-duplicate]')).not.toBeNull();
    expect(query(fixture, '[data-section-remove]')).not.toBeNull();

    fixture.componentRef.setInput('editMode', false);
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.directive(CdkDragHandle))).toBeNull();
  });

  it('closes an open inspector when Edit Layout Mode ends and does not reopen it', () => {
    const fixture = render({}, { inspectorComponent: TestInspector });
    query(fixture, '[data-section-config]')!.click();
    fixture.detectChanges();
    expect(query(fixture, '[data-section-inspector]')).not.toBeNull();

    fixture.componentRef.setInput('editMode', false);
    fixture.detectChanges();
    expect(query(fixture, '[data-section-inspector]')).toBeNull();

    fixture.componentRef.setInput('editMode', true);
    fixture.detectChanges();
    expect(query(fixture, '[data-section-inspector]')).toBeNull();
    expect(query(fixture, '[data-section-config]')!.getAttribute('aria-expanded')).toBe('false');
  });
});
