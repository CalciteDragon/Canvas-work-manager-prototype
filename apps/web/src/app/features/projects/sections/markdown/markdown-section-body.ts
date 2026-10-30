import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender,
  computed, inject, input, signal,
} from '@angular/core';
import { nameOf, type ProjectSection, type SectionConfig } from '@cwm/contracts';
import { MarkdownRenderer } from '../../../../shared/components/markdown-renderer/markdown-renderer';
import { writeFailure, type Failure } from '../../../../shared/feedback/failure';
import { readMarkdownConfig } from './markdown-config';
import { MarkdownSourceEditor } from './markdown-source-editor';

/** Lazy rendering and explicit authoring; the canvas supplies the awaited config write. */
@Component({
  selector: 'app-markdown-section-body',
  imports: [MarkdownRenderer, MarkdownSourceEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './markdown-section-body.html',
  styleUrl: './markdown-section-body.scss',
})
export class MarkdownSectionBody {
  readonly section = input.required<ProjectSection>();
  /** Resolves `null` when saved, or the failure the editor shows (Slice 78). */
  readonly save = input.required<(config: SectionConfig) => Promise<Failure | null>>();
  readonly readOnly = input(false);
  readonly editing = signal(false);
  readonly pending = signal(false);
  readonly failure = signal<Failure | null>(null);
  readonly base = signal('');
  readonly content = computed(() => readMarkdownConfig(this.section().config));
  readonly source = computed(() => {
    const content = this.content();
    return content.state === 'ok' ? content.markdown : '';
  });
  readonly name = computed(() => nameOf(this.section()));
  readonly canEdit = computed(() => !this.readOnly() && this.content().state !== 'unreadable');
  readonly changedElsewhere = computed(() => this.editing() && !this.pending() && this.canEdit() && this.source() !== this.base());
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private destroyed = false;

  constructor() { inject(DestroyRef).onDestroy(() => { this.destroyed = true; }); }

  /** Each Edit creates a new editor seeded from the current stored source. */
  edit(): void {
    if (this.destroyed || this.pending() || !this.canEdit()) return;
    this.base.set(this.source()); this.failure.set(null); this.editing.set(true);
  }

  /** Replace config once; a refused write leaves the editor and its draft mounted. */
  async saveDraft(draft: string): Promise<void> {
    if (this.destroyed || this.pending() || !this.editing() || !this.canEdit()) return;
    if (draft === this.source()) { this.closeEditor(); return; }
    this.pending.set(true); this.failure.set(null);
    let failure: Failure | null;
    try { failure = await this.save()({ markdown: draft }); }
    // The canvas callback resolves its failure; an unexpected throw keeps the draft too.
    catch (error) { failure = writeFailure(error, `Couldn’t save “${this.name()}”. Try again.`); }
    if (this.destroyed) return;
    if (failure === null) {
      // Source may already be patched by our own write. Close in this same turn, before
      // dropping pending, so no intermediate render announces a false external change.
      this.closeEditor(); this.pending.set(false);
    } else { this.failure.set(failure); this.pending.set(false); }
  }

  cancel(): void {
    if (this.destroyed || this.pending()) return;
    this.closeEditor();
  }

  private closeEditor(): void {
    this.editing.set(false); this.failure.set(null);
    afterNextRender(() => {
      if (!this.destroyed && !this.editing()) this.host.nativeElement.querySelector<HTMLButtonElement>('[data-markdown-edit]')?.focus();
    }, { injector: this.injector });
  }
}
