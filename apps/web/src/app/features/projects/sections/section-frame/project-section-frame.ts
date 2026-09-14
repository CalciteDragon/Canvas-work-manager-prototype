import { CdkDragHandle } from '@angular/cdk/drag-drop';
import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { nameOf, type ProjectSection, type SectionConfig, type SectionId } from '@cwm/contracts';
import type { SectionContentInputs } from '../section-contract';
import type { SectionDefinition } from '../registry';
import { CanvasIcon } from '../../canvas-chrome/canvas-icon';

/**
 * §31's always-available section chrome. It emits intent and never touches a gateway, so one
 * frame can carry the affordances for every registered section type.
 */
@Component({
  selector: 'app-project-section-frame',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkDragHandle, NgComponentOutlet, CanvasIcon],
  templateUrl: './project-section-frame.html',
  styleUrl: './project-section-frame.scss',
})
export class ProjectSectionFrame {
  readonly section = input.required<ProjectSection>();
  readonly definition = input.required<SectionDefinition>();
  readonly movePending = input(false);
  readonly moveAllowed = input(true);
  readonly projectDataRevision = input.required<number>();
  readonly projectHierarchyRevision = input.required<number>();
  /**
   * Open for this visit only, because something navigated to this container (§34's Todos
   * links land on a section that may be collapsed).
   */
  readonly transientlyExpanded = input<boolean>(false);
  /** The promise result lets the frame retain its draft when a rename is refused. */
  readonly rename = input.required<(id: SectionId, title: string | null) => Promise<boolean>>();

  readonly collapseToggled = output<{ id: SectionId; collapsed: boolean }>();
  readonly moveRequested = output<'previous' | 'next'>();
  readonly removeRequested = output<SectionId>();
  readonly configChanged = output<{ id: SectionId; config: SectionConfig }>();
  readonly projectDataChanged = output<void>();
  readonly projectHierarchyChanged = output<void>();

  readonly configOpen = signal(false);
  readonly editingName = signal(false);
  readonly nameDraft = signal('');
  readonly renamePending = signal(false);
  readonly name = computed(() => nameOf(this.section()));
  readonly effectiveCollapsed = computed(() => this.section().collapsed && !this.transientlyExpanded());
  readonly override = computed(() => this.section().title?.trim() ?? '');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  private readonly emitConfig = (config: SectionConfig): void => {
    this.configChanged.emit({ id: this.section().id, config });
  };
  private readonly emitProjectDataChange = (): void => this.projectDataChanged.emit();
  private readonly emitProjectHierarchyChange = (): void => this.projectHierarchyChanged.emit();

  readonly contentInputs = computed<SectionContentInputs>(() => ({
    section: this.section(),
    onConfigChange: this.emitConfig,
    onProjectDataChange: this.emitProjectDataChange,
    onProjectHierarchyChange: this.emitProjectHierarchyChange,
    projectDataRevision: this.projectDataRevision(),
    projectHierarchyRevision: this.projectHierarchyRevision(),
    readOnly: false,
  }));

  constructor() {
    effect(() => {
      const current = this.override();
      if (!this.editingName()) this.nameDraft.set(current);
    });
  }

  toggleCollapsed(): void {
    this.collapseToggled.emit({ id: this.section().id, collapsed: !this.effectiveCollapsed() });
  }

  toggleConfig(): void {
    this.configOpen.update((open) => !open);
  }

  beginRename(): void {
    if (this.renamePending()) return;
    this.nameDraft.set(this.override());
    this.editingName.set(true);
    afterNextRender(() => {
      const input = this.host.nativeElement.querySelector<HTMLInputElement>('[data-section-name]');
      input?.focus();
      input?.select();
    }, { injector: this.injector });
  }

  cancelRename(): void {
    if (this.renamePending()) return;
    this.nameDraft.set(this.override());
    this.editingName.set(false);
  }

  async saveRename(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (this.renamePending() || !this.editingName()) return;
    const trimmed = input.value.trim();
    const next = trimmed === '' ? null : trimmed;
    if ((next ?? '') === this.override()) {
      this.nameDraft.set(this.override());
      this.editingName.set(false);
      return;
    }

    this.nameDraft.set(input.value);
    this.renamePending.set(true);
    let saved = false;
    try {
      saved = await this.rename()(this.section().id, next);
    } catch {
      saved = false;
    } finally {
      this.renamePending.set(false);
    }
    if (saved) {
      this.editingName.set(false);
    } else {
      this.nameDraft.set(input.value);
      afterNextRender(
        () => this.host.nativeElement.querySelector<HTMLInputElement>('[data-section-name]')?.focus(),
        { injector: this.injector },
      );
    }
  }

  moveKeydown(event: KeyboardEvent): void {
    if (this.movePending() || !this.moveAllowed()) {
      event.preventDefault();
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      this.moveRequested.emit('previous');
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      this.moveRequested.emit('next');
    }
  }
}
