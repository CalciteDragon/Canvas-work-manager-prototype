import { CdkDragHandle } from '@angular/cdk/drag-drop';
import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import {
  SectionColumnSpanSchema,
  nameOf,
  type ProjectSection,
  type SectionColumnSpan,
  type SectionConfig,
  type SectionId,
} from '@cwm/contracts';
import type { SectionContentInputs } from '../section-contract';
import type { SectionDefinition } from '../registry';

/**
 * §31's frame: drag handle, title, collapse, configuration, size, duplicate, remove. Every
 * section renders inside this, and the content component handles only its own feature.
 *
 * The frame is **chrome only** — it emits intent and never touches a gateway, which is what
 * lets one component carry the affordances for every section type.
 *
 * §32's Edit Layout Mode gates layout, configuration, and destructive controls while
 * leaving collapse and section content usable in the normal workspace.
 */
@Component({
  selector: 'app-project-section-frame',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkDragHandle, NgComponentOutlet],
  templateUrl: './project-section-frame.html',
  styleUrl: './project-section-frame.scss',
})
export class ProjectSectionFrame {
  readonly section = input.required<ProjectSection>();
  readonly definition = input.required<SectionDefinition>();
  readonly editMode = input.required<boolean>();
  readonly projectDataRevision = input.required<number>();
  readonly projectHierarchyRevision = input.required<number>();
  /**
   * Open **for this visit only**, because something navigated to this container (§34's Todos
   * links land on a section that may be collapsed).
   *
   * It is an input rather than a mutation because arrival must write nothing: the section object
   * handed to the content store stays the canonical record, and `collapsed` on it still says
   * what is persisted. Everything the frame draws reads `effectiveCollapsed` instead, so the
   * chrome, the ARIA state and the collapse button cannot disagree with the content.
   */
  readonly transientlyExpanded = input<boolean>(false);

  readonly collapseToggled = output<{ id: SectionId; collapsed: boolean }>();
  readonly resized = output<{ id: SectionId; columnSpan: SectionColumnSpan }>();
  readonly duplicateRequested = output<SectionId>();
  readonly removeRequested = output<SectionId>();
  readonly configChanged = output<{ id: SectionId; config: SectionConfig }>();
  /** `null` clears the override, which is what makes the placeholder the real default. */
  readonly renamed = output<{ id: SectionId; title: string | null }>();
  readonly projectDataChanged = output<void>();
  readonly projectHierarchyChanged = output<void>();

  readonly configOpen = signal(false);
  readonly columnSpans = [...SectionColumnSpanSchema.values];
  /**
   * `name`, not `title`: after this phase `section().title` is the *override* and this is
   * the resolved name, and the frame now edits the first beside the second. Two things
   * called `title` meaning different things in one component is a week-old confusion.
   */
  readonly name = computed(() => nameOf(this.section()));

  /** What the frame actually draws: collapsed, unless this visit has opened it. */
  readonly effectiveCollapsed = computed(() => this.section().collapsed && !this.transientlyExpanded());

  /** The persisted override, as the control shows it — empty means "use the default". */
  readonly override = computed(() => this.section().title?.trim() ?? '');

  /**
   * A class-property arrow, so its identity never changes. `NgComponentOutlet` applies its
   * inputs from `ngDoCheck` and calls `setInput` for each key on every change-detection
   * pass; only `setInput`'s `Object.is` check stops that from marking the content component
   * dirty every cycle, and an inline arrow would defeat it.
   */
  private readonly emitConfig = (config: SectionConfig): void => {
    this.configChanged.emit({ id: this.section().id, config });
  };

  private readonly emitProjectDataChange = (): void => this.projectDataChanged.emit();
  private readonly emitProjectHierarchyChange = (): void => this.projectHierarchyChanged.emit();

  /** Computed for the same reason: an object literal in the template is a new identity too. */
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
      if (!this.editMode()) this.configOpen.set(false);
    });
  }

  /**
   * Intent, read off what the user can see. A transiently opened section shows "Collapse", and
   * clicking it means collapse — even though the canonical record already says so, which is what
   * makes the click the moment the override is released rather than a no-op.
   */
  toggleCollapsed(): void {
    this.collapseToggled.emit({ id: this.section().id, collapsed: !this.effectiveCollapsed() });
  }

  toggleConfig(): void {
    this.configOpen.update((open) => !open);
  }

  /**
   * Takes the **element**, not its value, because it has to put the control back on the
   * persisted name while a non-optimistic write is in flight. An Angular property binding
   * writes to the DOM only when the bound *expression* changes: on an already-untitled
   * section whitespace normalises to `null` while the expression stays `''`, and a rejected
   * rename does not change it either — so without this the field would keep showing a name
   * nothing persisted.
   */
  rename(input: HTMLInputElement): void {
    const trimmed = input.value.trim();
    const next = trimmed === '' ? null : trimmed;
    input.value = this.override();
    this.renamed.emit({ id: this.section().id, title: next });
  }

  resize(value: string): void {
    const columnSpan = SectionColumnSpanSchema.safeParse(Number(value));
    if (columnSpan.success)
      this.resized.emit({ id: this.section().id, columnSpan: columnSpan.data });
  }
}
