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
  </button>`,
})
class TestContent {
  readonly section = input.required<ProjectSection>();
  readonly onConfigChange = input.required<(config: SectionConfig) => void>();
  readonly onProjectDataChange = input.required<() => void>();
  readonly projectDataRevision = input.required<number>();
  readonly projectHierarchyRevision = input.required<number>();
  readonly readOnly = input(false);
  readonly sourceLink = input(null);

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
  readonly projectDataRevision = input.required<number>();
  readonly projectHierarchyRevision = input.required<number>();
  readonly readOnly = input(false);
  readonly sourceLink = input(null);
}

const definition = (overrides: Partial<SectionDefinition> = {}): SectionDefinition => ({
  type: 'test-content',
  kind: 'view',
  displayName: 'Test Content',
  icon: 'markdown',
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
  fixture.componentRef.setInput('saveConfig', async () => true);
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
    fixture.componentRef.setInput('saveConfig', async (id: string, config: SectionConfig) => {
      seen.push(['config', { id, config }]);
      return true;
    });

    query(fixture, '[data-section-collapse]')!.click();
    query(fixture, '[data-section-remove]')!.click();
    // Config-change is the one hop that carries a section's actual content upward.
    query(fixture, '[data-test-save]')!.click();

    expect(seen).toEqual([
      ['collapse', { id: 'section-a', collapsed: true }],
      ['remove', 'section-a'],
      ['config', { id: 'section-a', config: { text: 'edited' } }],
    ]);
  });

  it('keeps the remove control focusable and blocks duplicate removal while pending', () => {
    const fixture = render();
    const remove = query(fixture, '[data-section-remove]') as HTMLButtonElement;
    const requested = vi.fn();
    fixture.componentInstance.removeRequested.subscribe(requested);
    fixture.componentRef.setInput('removalPending', true);
    fixture.detectChanges();

    expect(remove.disabled).toBe(false);
    expect(remove.getAttribute('aria-disabled')).toBe('true');
    remove.click();
    expect(requested).not.toHaveBeenCalled();
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
    expect(first['sourceLink']).toBeNull();
    expect(first).not.toHaveProperty('onProjectHierarchyChange');
    expect(first.projectHierarchyRevision).toBe(0);
    fixture.detectChanges();
    const second = fixture.componentInstance.contentInputs();
    expect(second).toBe(first);
    expect(second.onConfigChange).toBe(first.onConfigChange);

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

  /** Slice 33 (Refactor §26.8): a rename's outcome decides focus, never the rename having started. */
  it('keeps focus on a failed rename input, returns Enter to the title, and leaves a blur commit where the user went', async () => {
    let answer = false;
    const rename = vi.fn(async () => answer);
    const fixture = render({ title: 'Backlog' }, {}, rename);
    const elsewhere = document.createElement('button');
    document.body.append(fixture.nativeElement, elsewhere);
    const edit = async (value: string) => {
      query(fixture, '[data-section-title-edit]')!.click();
      fixture.detectChanges();
      const input = query(fixture, '[data-section-name]') as HTMLInputElement;
      input.focus();
      input.value = value;
      return input;
    };
    try {
      const failed = await edit('Rejected draft');
      failed.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();
      expect((query(fixture, '[data-section-name]') as HTMLInputElement).value).toBe('Rejected draft');
      expect(document.activeElement).toBe(query(fixture, '[data-section-name]'));

      answer = true;
      (query(fixture, '[data-section-name]') as HTMLInputElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(query(fixture, '[data-section-name]')).toBeNull();
      expect(document.activeElement).toBe(query(fixture, '[data-section-title-edit]'));

      await edit('Chosen by blur');
      elsewhere.focus();
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(rename).toHaveBeenLastCalledWith('section-a', 'Chosen by blur');
      expect(document.activeElement).toBe(elsewhere);
    } finally {
      fixture.nativeElement.remove();
      elsewhere.remove();
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

it('content config writes return the saveConfig result', async () => {
  const fixture = render();
  const save = vi.fn(async () => false);
  fixture.componentRef.setInput('saveConfig', save);
  expect(await fixture.componentInstance.contentInputs().onConfigChange({ text: 'draft' })).toBe(false);
  expect(save).toHaveBeenCalledWith('section-a', { text: 'draft' });
});


describe('slice 76 named section chrome', () => {
  it('names a plain heading and a one-stop ordered toolbar, including optional settings', () => {
    const fixture = render({ title: 'Launch' });
    const heading = query(fixture, '[data-section-title]')!;
    expect(heading.textContent?.trim()).toBe('Launch');
    expect(heading.querySelector('button')).toBeNull();
    expect(heading.querySelector('[aria-hidden="true"]')).not.toBeNull();
    const toolbar = query(fixture, '[role="toolbar"]')!;
    expect(toolbar.getAttribute('aria-label')).toBe('Launch tools');
    expect([...toolbar.querySelectorAll('button')].map((button) => button.getAttribute('aria-label'))).toEqual(['Rename Launch', 'Collapse Launch', 'Move Launch', 'Remove section Launch']);
    expect([...toolbar.querySelectorAll('button')].map((button) => button.tabIndex)).toEqual([0, -1, -1, -1]);
    expect(query(fixture, '[data-section-frame]')!.getAttribute('aria-labelledby')).toBe(heading.id);
    const withSettings = render({}, { inspectorComponent: TestInspector });
    expect(query(withSettings, '[role="toolbar"]')!.querySelectorAll('button').length).toBe(5);
  });

  it('fails closed for title clicks except mouse or pen pointerdown; Rename remains while editing', async () => {
    const fixture = render();
    document.body.append(fixture.nativeElement);
    try {
      const title = query(fixture, '[data-section-title]')!;
      const pointer = (type: string) => {
        const event = new Event('pointerdown', { bubbles: true });
        Object.defineProperty(event, 'pointerType', { value: type }); title.dispatchEvent(event);
      };
      title.click(); fixture.detectChanges(); expect(query(fixture, '[data-section-name]')).toBeNull();
      pointer('touch'); title.click(); fixture.detectChanges(); expect(query(fixture, '[data-section-name]')).toBeNull();
      pointer('mouse'); title.click(); fixture.detectChanges(); await fixture.whenStable();
      expect(query(fixture, '[data-section-name]')).not.toBeNull();
      const rename = query(fixture, '[data-section-title-edit]')!;
      const down = new Event('pointerdown', { bubbles: true, cancelable: true });
      rename.dispatchEvent(down); expect(down.defaultPrevented).toBe(true);
      rename.click();
      expect(document.activeElement).toBe(query(fixture, '[data-section-name]'));
    } finally { fixture.nativeElement.remove(); }
  });

  it('prefills and selects the default and treats unchanged Enter and blur as no write', async () => {
    const rename = vi.fn(async () => true);
    const fixture = render({}, {}, rename);
    document.body.append(fixture.nativeElement);
    try {
      query(fixture, '[data-section-title-edit]')!.click(); fixture.detectChanges(); await fixture.whenStable();
      const field = query(fixture, '[data-section-name]') as HTMLInputElement;
      expect(field.value).toBe('Test Content'); expect(field.selectionStart).toBe(0); expect(field.selectionEnd).toBe(field.value.length);
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await fixture.whenStable(); fixture.detectChanges(); expect(rename).not.toHaveBeenCalled();
      query(fixture, '[data-section-title-edit]')!.click(); fixture.detectChanges();
      (query(fixture, '[data-section-name]') as HTMLInputElement).dispatchEvent(new Event('blur'));
      await fixture.whenStable(); expect(rename).not.toHaveBeenCalled();
    } finally { fixture.nativeElement.remove(); }
  });

  it('roves horizontally without moving the placement and follows programmatic focus', () => {
    const fixture = render(); document.body.append(fixture.nativeElement);
    try {
      const move = query(fixture, '[data-section-drag-handle]')!;
      const moves = vi.fn(); fixture.componentInstance.moveRequested.subscribe(moves);
      move.focus();
      expect(move.tabIndex).toBe(0);
      move.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(moves).not.toHaveBeenCalled(); expect(document.activeElement).toBe(query(fixture, '[data-section-remove]'));
      move.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      move.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(moves.mock.calls).toEqual([['previous'], ['next']]);
    } finally { fixture.nativeElement.remove(); }
  });

  it('links a frame collapse alert and exposes its pending state', () => {
    const fixture = render(); fixture.componentRef.setInput('collapseError', { sentence: 'Couldn’t collapse “Launch notes”. Try again.', reason: 'The server did not answer.' }); fixture.componentRef.setInput('collapsePending', true); fixture.detectChanges();
    const alert = query(fixture, '[role="alert"]')!;
    expect(alert.textContent?.trim()).toBe('Couldn’t collapse “Launch notes”. Try again.');
    // The reason is a closed Details beside the described sentence (Slice 78).
    expect(alert.parentElement!.querySelector('details')?.textContent).toContain('The server did not answer.');
    expect(query(fixture, '[data-section-collapse]')!.getAttribute('aria-describedby')).toBe(alert.id);
    expect(query(fixture, '[data-section-collapse]')!.getAttribute('aria-busy')).toBe('true');
    expect(query(fixture, '[data-section-frame]')!.getAttribute('aria-busy')).toBe('true');
  });
});
