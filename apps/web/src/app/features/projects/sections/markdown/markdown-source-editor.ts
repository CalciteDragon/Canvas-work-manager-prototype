import {
  ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, inject,
  input, output, signal, viewChild, type OnInit,
} from '@angular/core';
import { MarkdownRenderer } from '../../../../shared/components/markdown-renderer/markdown-renderer';

/** A fresh, presentational source draft for one editing session. */
@Component({
  selector: 'app-markdown-source-editor',
  imports: [MarkdownRenderer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './markdown-source-editor.html',
  styleUrl: './markdown-source-editor.scss',
})
export class MarkdownSourceEditor implements OnInit {
  readonly initialSource = input.required<string>();
  readonly name = input.required<string>();
  readonly pending = input(false);
  readonly failed = input(false);
  readonly changedElsewhere = input(false);
  readonly saveBlocked = input(false);
  readonly saveRequested = output<string>();
  readonly cancelRequested = output<void>();
  readonly ready = output<void>();
  readonly draft = signal('');
  readonly preview = signal(false);
  private readonly source = viewChild<ElementRef<HTMLTextAreaElement>>('source');
  private readonly injector = inject(Injector);

  constructor() {
    afterNextRender(() => this.ready.emit());
  }

  /** Seed once: a live section update never replaces a draft already being written. */
  ngOnInit(): void { this.draft.set(this.initialSource()); }

  /** The owning body invokes this when the new editor reports that its view is ready. */
  focusSource(): void { this.source()?.nativeElement.focus(); }

  setDraft(event: Event): void {
    if (this.pending()) return;
    this.draft.set((event.target as HTMLTextAreaElement).value);
  }

  togglePreview(): void {
    if (this.pending()) return;
    this.preview.update((preview) => !preview);
    if (!this.preview()) afterNextRender(() => this.focusSource(), { injector: this.injector });
  }

  requestSave(): void {
    if (!this.pending() && !this.saveBlocked()) this.saveRequested.emit(this.draft());
  }

  requestCancel(): void {
    if (!this.pending()) this.cancelRequested.emit();
  }
}
