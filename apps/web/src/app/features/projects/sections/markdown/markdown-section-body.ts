import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender,
  computed, inject, input, signal, viewChild,
} from '@angular/core';
import { nameOf, type ProjectSection, type SectionConfig } from '@cwm/contracts';
import { MarkdownRenderer } from '../../../../shared/components/markdown-renderer/markdown-renderer';
import { writeFailure, type Failure } from '../../../../shared/feedback/failure';
import { readMarkdownConfig } from './markdown-config';
import { MarkdownDraftStore } from './markdown-draft-store';
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
  /** A kept draft offered back by this editing session (Slice 79, L3-012), or `null`. */
  readonly offered = signal<string | null>(null);
  /** Bumped by Discard draft: the editor seeds once, so a fresh one is keyed in. */
  readonly editorKey = signal(0);
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
  private readonly drafts = inject(MarkdownDraftStore);
  private readonly editor = viewChild(MarkdownSourceEditor);
  private destroyed = false;

  constructor() {
    // Navigation or removal of the host keeps a changed draft, read before the editor goes.
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      const editor = this.editor();
      if (this.editing() && editor) this.keep(editor.draft());
    });
  }

  /**
   * Each Edit creates a new editor seeded from the kept draft, with the base it started from so
   * §30's "changed elsewhere" note still guards an agent's edit, or else from the stored source.
   */
  edit(): void {
    if (this.destroyed || this.pending() || !this.canEdit()) return;
    const kept = this.drafts.take(this.section().id);
    const offered = kept !== null && kept.draft !== this.source() ? kept : null;
    this.base.set(offered?.base ?? this.source()); this.offered.set(offered?.draft ?? null);
    this.failure.set(null); this.editing.set(true);
  }

  /** Discard draft: forget it and start a fresh editor from the current stored source. */
  discard(): void {
    if (this.destroyed || this.pending()) return;
    this.drafts.forget(this.section().id);
    this.base.set(this.source()); this.offered.set(null); this.editorKey.update((key) => key + 1);
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
      this.drafts.forget(this.section().id); this.closeEditor(); this.pending.set(false);
    } else { this.failure.set(failure); this.pending.set(false); }
  }

  /** Cancel keeps a changed draft for the next Edit (Slice 79); an unchanged one is let go. */
  cancel(draft: string): void {
    if (this.destroyed || this.pending()) return;
    this.keep(draft); this.closeEditor();
  }

  private keep(draft: string): void {
    if (draft !== this.base() && draft !== this.source()) this.drafts.keep(this.section().id, { draft, base: this.base() });
  }

  private closeEditor(): void {
    this.editing.set(false); this.failure.set(null);
    afterNextRender(() => {
      if (!this.destroyed && !this.editing()) this.host.nativeElement.querySelector<HTMLButtonElement>('[data-markdown-edit]')?.focus();
    }, { injector: this.injector });
  }
}
