import { ChangeDetectionStrategy, Component, effect, input } from '@angular/core';
import { CdkDragHandle } from '@angular/cdk/drag-drop';
import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { ProjectSectionSchema, type ProjectSection, type SectionConfig } from '@cwm/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { SectionDefinition } from '../registry';
import { ProjectSectionFrame } from './project-section-frame';

const AT = '2026-08-27T16:00:00.000Z';

const section = (overrides: Record<string, unknown> = {}): ProjectSection =>
  ProjectSectionSchema.parse({
    id: 'section-a',
    projectId: 'project-a',
    pageId: 'page-project-a',
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
  readonly readOnly = input(false);

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
  readonly readOnly = input(false);
}

const definition = (overrides: Partial<SectionDefinition> = {}): SectionDefinition => ({
  type: 'test-content',
  kind: 'view',
  displayName: 'Test Content',
  icon: '🧪',
  createDefaultConfig: () => ({}),
  component: TestContent,
  ...overrides,
});

const render = (
  overrides: Record<string, unknown> = {},
  definitionOverrides: Partial<SectionDefinition> = {},
  rename: (id: string, title: string | null) => Promise<boolean> = async () => true,
) => {
  inputChanges = 0;
  const fixture = TestBed.createComponent(ProjectSectionFrame);
  fixture.componentRef.setInput('section', section(overrides));
  fixture.componentRef.setInput('definition', definition(definitionOverrides));
  fixture.componentRef.setInput('rename', rename);
  fixture.componentRef.setInput('projectDataRevision', 0);
  fixture.componentRef.setInput('projectHierarchyRevision', 0);
  fixture.detectChanges();
  return fixture;
};

const query = (fixture: ReturnType<typeof render>, selector: string) =>
  fixture.nativeElement.querySelector(selector) as HTMLElement | null;

describe('ProjectSectionFrame (§31)', () => {
  it('renders always-available SVG chrome and the registered content component', () => {
    const fixture = render();

    expect(query(fixture, '[data-section-drag-handle]')).not.toBeNull();
    expect(query(fixture, '[data-section-collapse]')).not.toBeNull();
    expect(query(fixture, '[data-section-remove]')).not.toBeNull();
    expect(query(fixture, '[data-section-size]')).toBeNull();
    expect(query(fixture, '[data-section-duplicate]')).toBeNull();
    expect(query(fixture, '[data-section-frame]')?.textContent).not.toMatch(/[⠿▸▾â]/);
    expect(query(fixture, '[data-section-drag-handle] svg')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Test Content');
    expect(query(fixture, '[data-test-save]')).not.toBeNull();
  });

  it('prefers the section’s own title over the definition’s display name', () => {
    const fixture = render({ title: 'This week' });

    expect(fixture.nativeElement.textContent).toContain('This week');
  });

  it('emits collapse and remove intent and forwards content changes without a gateway', () => {
    const fixture = render();
    const frame = fixture.componentInstance;
    const seen: unknown[] = [];
    frame.collapseToggled.subscribe((event) => seen.push(['collapse', event]));
    frame.removeRequested.subscribe((event) => seen.push(['remove', event]));
    frame.configChanged.subscribe((event) => seen.push(['config', event]));
    frame.projectHierarchyChanged.subscribe(() => seen.push(['hierarchy']));

    query(fixture, '[data-section-collapse]')!.click();
    query(fixture, '[data-section-remove]')!.click();
    // Config-change is the one hop that carries a section's actual content upward.
    query(fixture, '[data-test-save]')!.click();
    query(fixture, '[data-test-hierarchy]')!.click();

    expect(seen).toEqual([
      ['collapse', { id: 'section-a', collapsed: true }],
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

  it('offers a settings icon only when the definition has an inspector', () => {
    const withoutInspector = render();
    expect(query(withoutInspector, '[data-section-config]')).toBeNull();

    const withInspector = render({}, { inspectorComponent: TestInspector });
    query(withInspector, '[data-section-config]')!.click();
    withInspector.detectChanges();
    expect(query(withInspector, '[data-test-inspector]')).not.toBeNull();
  });

  it('renders an untitled sub-projects frame as Sub-Projects, not Sub Projects', () => {
    // The regression the one-entry overrides table exists to prevent; the spec (line 1109)
    // spells it with the hyphen and a split-on-hyphen derivation cannot produce it.
    const fixture = render({ type: 'sub-projects' }, { type: 'sub-projects', displayName: 'Sub-Projects' });

    expect(query(fixture, '.section-frame__title')!.textContent).toContain('Sub-Projects');
  });

  it('edits the title inline and commits Enter once, including clearing to the default', async () => {
    const fixture = render({ title: 'Backlog' });
    const seen: unknown[] = [];
    fixture.componentRef.setInput('rename', async (id: string, title: string | null) => {
      seen.push({ id, title });
      return true;
    });
    fixture.detectChanges();
    query(fixture, '[data-section-title-edit]')!.click();
    fixture.detectChanges();
    const input = query(fixture, '[data-section-name]') as HTMLInputElement;
    expect(input.value).toBe('Backlog');

    input.value = 'Shipped';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(seen).toEqual([{ id: 'section-a', title: 'Shipped' }]);
    expect(query(fixture, '[data-section-name]')).toBeNull();
  });

  it('clears the override for a blank name and restores the persisted name on Escape', async () => {
    const fixture = render({ title: 'Backlog' });
    const rename = vi.fn(async () => true);
    fixture.componentRef.setInput('rename', rename);
    query(fixture, '[data-section-title-edit]')!.click();
    fixture.detectChanges();
    const input = query(fixture, '[data-section-name]') as HTMLInputElement;
    input.value = '   ';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await fixture.whenStable();
    expect(rename).toHaveBeenCalledWith('section-a', null);

    fixture.detectChanges();
    query(fixture, '[data-section-title-edit]')!.click();
    fixture.detectChanges();
    const secondInput = query(fixture, '[data-section-name]') as HTMLInputElement;
    secondInput.value = 'Unsaved';
    secondInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(query(fixture, '[data-section-name]')).toBeNull();
    expect(rename).toHaveBeenCalledTimes(1);
  });

  it('keeps failed rename text for correction and exposes keyboard move intent', async () => {
    const fixture = render();
    const rename = vi.fn(async () => false);
    fixture.componentRef.setInput('rename', rename);
    fixture.detectChanges();
    query(fixture, '[data-section-title-edit]')!.click();
    fixture.detectChanges();
    const input = query(fixture, '[data-section-name]') as HTMLInputElement;
    input.value = 'Retained draft';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect((query(fixture, '[data-section-name]') as HTMLInputElement).value).toBe('Retained draft');
    expect(query(fixture, '[data-section-name]')).not.toBeNull();

    const moves: unknown[] = [];
    fixture.componentInstance.moveRequested.subscribe((direction) => moves.push(direction));
    query(fixture, '[data-section-drag-handle]')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    );
    expect(moves).toEqual(['next']);

    expect(fixture.debugElement.query(By.directive(CdkDragHandle))).not.toBeNull();
  });

  it('an unavailable grip swallows move keys but lets Tab leave it', () => {
    const fixture = render();
    fixture.componentRef.setInput('movePending', true);
    fixture.detectChanges();
    const grip = query(fixture, '[data-section-drag-handle]')!;
    const moves: unknown[] = [];
    fixture.componentInstance.moveRequested.subscribe((direction) => moves.push(direction));

    const arrow = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    grip.dispatchEvent(arrow);
    grip.dispatchEvent(tab);

    expect(moves).toEqual([]);
    expect(arrow.defaultPrevented).toBe(true);
    expect(tab.defaultPrevented).toBe(false);
  });

  it('returns focus to the title after Enter or Escape settles an inline rename', async () => {
    const fixture = render({ title: 'Backlog' });
    document.body.appendChild(fixture.nativeElement);
    try {
      query(fixture, '[data-section-title-edit]')!.click();
      fixture.detectChanges();
      const input = query(fixture, '[data-section-name]') as HTMLInputElement;
      expect(input.placeholder).toBe('Test Content');
      input.value = 'Shipped';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(document.activeElement).toBe(query(fixture, '[data-section-title-edit]'));

      query(fixture, '[data-section-title-edit]')!.click();
      fixture.detectChanges();
      (query(fixture, '[data-section-name]') as HTMLInputElement).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      fixture.detectChanges();
      await fixture.whenStable();
      expect(document.activeElement).toBe(query(fixture, '[data-section-title-edit]'));
    } finally {
      fixture.nativeElement.remove();
    }
  });

  /**
   * §34's Todos links land on a container that may be collapsed. Opening it is a property of the
   * visit, not a layout change, so the canonical record the content store is given must still say
   * `collapsed: true` while everything the reader sees says otherwise.
   */
  it('opens a collapsed section for one visit without changing the record it renders', () => {
    const fixture = render({ collapsed: true });
    expect(query(fixture, '[data-section-content]')).toBeNull();

    fixture.componentRef.setInput('transientlyExpanded', true);
    fixture.detectChanges();

    expect(query(fixture, '[data-section-content]')).not.toBeNull();
    expect(query(fixture, '[data-section-collapse]')!.getAttribute('aria-expanded')).toBe('true');
    expect(query(fixture, '[data-section-collapse]')!.getAttribute('aria-label')).toBe('Collapse Test Content');
    expect(query(fixture, '[data-section-frame]')!.classList.contains('section-frame--collapsed')).toBe(false);
    // The canonical section is untouched: this is chrome, not a write.
    expect(fixture.componentInstance.section().collapsed).toBe(true);
  });

  it('reads collapse intent off what the reader can see', () => {
    const fixture = render({ collapsed: true });
    fixture.componentRef.setInput('transientlyExpanded', true);
    fixture.detectChanges();
    const seen: unknown[] = [];
    fixture.componentInstance.collapseToggled.subscribe((event) => seen.push(event));

    query(fixture, '[data-section-collapse]')!.click();

    // Collapse, not "expand again": the section is open on screen.
    expect(seen).toEqual([{ id: 'section-a', collapsed: true }]);
  });

  it('leaves an ordinary frame exactly as it was, and offers a heading a canvas can focus', () => {
    const fixture = render({ collapsed: true });

    expect(query(fixture, '[data-section-content]')).toBeNull();
    expect(query(fixture, '[data-section-collapse]')!.getAttribute('aria-expanded')).toBe('false');
    // Focusable programmatically, and out of the tab order: only a canvas arrival focuses it.
    expect(query(fixture, '[data-section-title]')!.getAttribute('tabindex')).toBe('-1');
  });
});
