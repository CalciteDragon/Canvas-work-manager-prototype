import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import type {
  ProjectId,
  ProjectLayoutMode,
  ProjectPageId,
  SectionColumnSpan,
  SectionConfig,
  SectionId,
  SectionShortcutId,
} from '@cwm/contracts';
import { PrototypeSettings } from '../../core/config/prototype-settings';
import { ArchivedRegion } from './archived-region/archived-region';
import { ProjectPageStore } from './project-page-store';
import { SectionRemovalDialog } from './section-removal-dialog';
import { ProjectSectionFrame } from './sections/section-frame/project-section-frame';
import { SECTION_REGISTRY, definitionFor } from './sections/registry';
import { ShortcutFrame } from './shortcuts/shortcut-frame';
import { ShortcutPicker } from './shortcuts/shortcut-picker';
import { ShortcutStore } from './shortcuts/shortcut-store';

/**
 * §27's section canvas, for **one page**: the controls row, the drag-drop canvas, the
 * Archived region and the removal dialog. It is the renderer for a root's Home and for a
 * sub-project's sole work canvas, which after §26 are the same component — the two kinds
 * differ in their *header*, and the header belongs to `ProjectWorkspaceShell`.
 *
 * It is mounted through `NgComponentOutlet`, which binds **inputs only**. The two ways the
 * canvas has to tell the shell something — progress may have moved, the work hierarchy may
 * have moved — therefore arrive as callback inputs with stable identity, exactly as
 * `ProjectSectionFrame` hands callbacks to its content components.
 *
 * Section stores follow ownership. Progress, Task List and Reflections provide their own
 * stores at the content boundary. A shortcut never gets one of those stores from this canvas:
 * its source content is mounted read-only by `ShortcutFrame`, so the source remains the only
 * owner of writable content. Progress is provided by each Progress section because a Home may
 * reference Progress from another project.
 */
@Component({
  selector: 'app-project-canvas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ArchivedRegion,
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    ProjectSectionFrame,
    SectionRemovalDialog,
    ShortcutFrame,
    ShortcutPicker,
  ],
  providers: [ProjectPageStore, ShortcutStore],
  templateUrl: './project-canvas.html',
  styleUrl: './project-canvas.scss',
  // Quick Add's menu closes on Escape from anywhere on the canvas, which is what a menu
  // opened with the pointer needs — the keystroke rarely lands inside the menu itself. The
  // More menu declares its own, in the header that owns it.
  host: { '(document:keydown.escape)': 'closeAdd()' },
})
export class ProjectCanvas {
  readonly projectId = input.required<ProjectId>();
  /** §27: a canvas is a page. Every read and write this store makes names it. */
  readonly pageId = input.required<ProjectPageId>();
  readonly projectLayoutMode = input.required<ProjectLayoutMode>();
  /** Shortcut placement is a Home-only root capability (§27). */
  readonly shortcutsAllowed = input.required<boolean>();
  /** Whether the Archived region may offer a Restore at all — the shell knows, not the canvas. */
  readonly restoreBlocked = input<boolean>(false);
  /** Progress may have moved. Called, not emitted: `NgComponentOutlet` has no output API. */
  readonly onProjectDataChange = input<() => void>(() => {});
  /** The work hierarchy may have moved — a Sub-Projects section created a child. */
  readonly onProjectHierarchyChange = input<() => void>(() => {});

  readonly store = inject(ProjectPageStore);
  readonly registry = SECTION_REGISTRY;
  readonly addOpen = signal(false);
  readonly shortcutPickerOpen = signal(false);
  readonly canvasMounted = signal(true);
  readonly shortcutStore = inject(ShortcutStore);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly settings = inject(PrototypeSettings);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  /**
   * §34's Todos links arrive at a container, not just at a page. The canvas handles the fragment
   * itself rather than through the router's global anchor scrolling, because the app scrolls its
   * own region and a canvas is loaded asynchronously — a scroll attempted at navigation time
   * lands before the section exists.
   */
  private readonly fragment = toSignal(inject(ActivatedRoute).fragment, { initialValue: null });
  /** Set when the reader collapses the very section this visit opened for them. */
  private readonly releasedTarget = signal<SectionId | null>(null);
  private lastTargetKey: string | null = null;

  /**
   * The container this visit is aimed at — **only** once this page's own sections have loaded and
   * one of them is it. A fragment naming something else is never turned into a selector.
   */
  readonly targetSectionId = computed<SectionId | null>(() => {
    const requested = requestedSectionId(this.fragment());
    if (requested === null) return null;
    return this.store.sections().some(({ id }) => id === requested) ? requested : null;
  });

  /** A fragment this page cannot honour. The canvas stays entirely usable; it just says so. */
  readonly targetMissing = computed(
    () => requestedSectionId(this.fragment()) !== null && !this.store.loading() && this.targetSectionId() === null,
  );

  /** The transient open state handed to one frame: released as soon as the reader collapses it. */
  readonly transientTargetId = computed<SectionId | null>(() => {
    const target = this.targetSectionId();
    return target === null || target === this.releasedTarget() ? null : target;
  });

  /**
   * §28's mode, gated by §47's `gridProjectLayout`. The project keeps whatever it has
   * stored — the flag decides what is *rendered*, so turning grid off is a rendering
   * experiment rather than a data migration, and turning it back on restores the project's
   * own choice.
   */
  readonly layoutMode = computed<ProjectLayoutMode>(() =>
    this.settings.flags().gridProjectLayout ? this.projectLayoutMode() : 'flow',
  );

  constructor() {
    // Re-loads when the page changes, which the column does without re-creating this
    // component, and which the shell also does when the route moves to another project.
    effect(() => {
      const projectId = this.projectId();
      const pageId = this.pageId();
      this.addOpen.set(false);
      this.shortcutPickerOpen.set(false);
      void this.store.load(projectId, pageId);
    });
    this.watchNavigationTarget();
  }

  /**
   * Arrival: expand the target for this visit, put the reader at its heading, and scroll it into
   * view. Registered from an effect so it waits for the data, and run after the next render so it
   * waits for the DOM — the frame has to have drawn its content before the heading can be focused.
   *
   * `lastTargetKey` is what stops it running twice for one arrival, and what makes a *new* target
   * or a page change a fresh arrival rather than a repeat of the old one.
   */
  private watchNavigationTarget(): void {
    effect(() => {
      const pageId = this.pageId();
      const target = this.targetSectionId();
      const key = target === null ? null : `${pageId}:${target}`;
      if (key === this.lastTargetKey) return;
      this.lastTargetKey = key;
      // A new target — or none — starts with no release: the previous one belonged to a
      // container the reader has navigated away from.
      this.releasedTarget.set(null);
      if (target === null) return;
      afterNextRender(() => this.revealTarget(target), { injector: this.injector });
    });
  }

  private revealTarget(sectionId: SectionId): void {
    const wrapper = [...this.host.nativeElement.querySelectorAll('[data-section-id]')].find(
      (element) => element.getAttribute('data-section-id') === sectionId,
    ) as HTMLElement | undefined;
    if (wrapper === undefined) return;
    // Optional: jsdom has no layout, and a canvas that could not scroll must still focus.
    wrapper.scrollIntoView?.({ block: 'start' });
    (wrapper.querySelector('[data-section-title]') as HTMLElement | null)?.focus({ preventScroll: true });
  }

  definitionFor(type: string) {
    return definitionFor(type);
  }

  toggleAdd(): void {
    this.addOpen.update((open) => !open);
  }

  closeAdd(): void {
    this.addOpen.set(false);
    this.shortcutPickerOpen.set(false);
  }

  toggleEditMode(): void {
    const editing = !this.store.editMode();
    this.store.setEditMode(editing);
    if (!editing) {
      this.addOpen.set(false);
      this.shortcutPickerOpen.set(false);
    }
  }

  async drop(event: CdkDragDrop<unknown>): Promise<void> {
    const droppedPageId = this.pageId();
    const data = event.item.data as { kind?: string; id?: string } | string;
    const isShortcut = typeof data !== 'string' && data.kind === 'shortcut';
    const id = (typeof data === 'string' ? data : data.id) as string;
    const persisted = isShortcut
      ? await this.store.moveShortcut(id as SectionShortcutId, event.currentIndex)
      : await this.store.moveSection(id as SectionId, event.currentIndex);
    if (!persisted && this.pageId() === droppedPageId) {
      // Mixed-orientation CDK moves DOM nodes directly. A rejected write must destroy that
      // physical order before recreating the canvas from the canonical store array.
      this.canvasMounted.set(false);
      this.changeDetector.detectChanges();
      this.canvasMounted.set(true);
      this.changeDetector.detectChanges();
    }
  }

  async add(type: string): Promise<void> {
    const definition = definitionFor(type);
    if (definition === undefined) return;
    await this.store.addSection(definition);
    this.addOpen.set(false);
  }

  openShortcutPicker(): void {
    if (!this.shortcutsAllowed()) return;
    this.addOpen.set(false);
    this.shortcutPickerOpen.set(true);
    void this.shortcutStore.load(this.projectId(), this.pageId());
  }

  closeShortcutPicker(): void {
    this.shortcutPickerOpen.set(false);
  }

  shortcutAdded(): void {
    this.shortcutPickerOpen.set(false);
    void this.shortcutStore.refresh(this.projectId(), this.pageId());
  }

  collapseShortcut(event: { id: SectionShortcutId; collapsed: boolean }): void {
    void this.store.setCollapsedShortcut(event.id, event.collapsed);
  }

  resizeShortcut(event: { id: SectionShortcutId; columnSpan: SectionColumnSpan }): void {
    void this.store.setColumnSpanShortcut(event.id, event.columnSpan);
  }

  removeShortcut(id: SectionShortcutId): void {
    void this.store.removeShortcut(id);
  }

  /**
   * Both halves of §31's remove, once the dialog has asked which one the user meant.
   * `cascade` archives the section **and** its rows — undoable from Archived, in one click —
   * and `reassign` hands the rows to another container of the same type, then archives the
   * emptied section.
   */
  cascadeAndRemove(id: SectionId): void {
    void this.store.removeSection(id, { policy: 'cascade' });
  }

  reassignAndRemove(id: SectionId, reassignToSectionId: SectionId): void {
    void this.store.removeSection(id, { policy: 'reassign', reassignToSectionId });
  }

  renameSection(event: { id: SectionId; title: string | null }): void {
    void this.store.renameSection(event.id, event.title);
  }

  collapse(event: { id: SectionId; collapsed: boolean }): void {
    // Collapsing the container this visit opened is the reader saying "I am done with it": the
    // transient override is released and the canonical operation runs, exactly as on any other
    // frame. Arriving wrote nothing; this is the first write either way.
    if (event.id === this.targetSectionId()) this.releasedTarget.set(event.id);
    void this.store.setCollapsed(event.id, event.collapsed);
  }

  resize(event: { id: SectionId; columnSpan: SectionColumnSpan }): void {
    void this.store.setColumnSpan(event.id, event.columnSpan);
  }

  saveConfig(event: { id: SectionId; config: SectionConfig }): void {
    void this.store.updateConfig(event.id, event.config);
  }

  projectDataChanged(): void {
    this.store.notifyProjectDataChanged();
    this.onProjectDataChange()();
  }

  projectHierarchyChanged(): void {
    this.store.notifyProjectHierarchyChanged();
    this.onProjectHierarchyChange()();
  }
}

/** The section id a fragment names, if it names one at all. Ids are never trusted as selectors. */
const requestedSectionId = (fragment: string | null): SectionId | null => {
  if (fragment === null || !fragment.startsWith('section-')) return null;
  const id = fragment.slice('section-'.length);
  return id === '' ? null : (id as SectionId);
};
