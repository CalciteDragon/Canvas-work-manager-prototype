import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender,
  computed, inject, input, signal,
} from '@angular/core';
import { nameOf, type ProjectSection, type SectionConfig } from '@cwm/contracts';
import { MarkdownRenderer } from '../../../../shared/components/markdown-renderer/markdown-renderer';
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
  readonly save = input.required<(config: SectionConfig) => Promise<boolean>>();
  readonly readOnly = input(false);
  readonly editing = signal(false);
  readonly pending = signal(false);
  readonly failed = signal(false);
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
    this.base.set(this.source()); this.failed.set(false); this.editing.set(true);
  }

  /** Replace config once; a refused write leaves the editor and its draft mounted. */
  async saveDraft(draft: string): Promise<void> {
    if (this.destroyed || this.pending() || !this.editing() || !this.canEdit()) return;
    if (draft === this.source()) { this.closeEditor(); return; }
    this.pending.set(true); this.failed.set(false);
    let saved = false;
    try { saved = await this.save()({ markdown: draft }); }
    catch { /* The normal canvas callback resolves false; an unexpected refusal keeps the draft too. */ }
    if (this.destroyed) return;
    if (saved) {
      // Source may already be patched by our own write. Close in this same turn, before
      // dropping pending, so no intermediate render announces a false external change.
      this.closeEditor(); this.pending.set(false);
    } else { this.failed.set(true); this.pending.set(false); }
  }

  cancel(): void {
    if (this.destroyed || this.pending()) return;
    this.closeEditor();
  }

  private closeEditor(): void {
    this.editing.set(false); this.failed.set(false);
    afterNextRender(() => {
      if (!this.destroyed && !this.editing()) this.host.nativeElement.querySelector<HTMLButtonElement>('[data-markdown-edit]')?.focus();
    }, { injector: this.injector });
  }
}
