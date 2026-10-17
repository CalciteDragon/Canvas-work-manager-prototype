import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, inject, input, output, signal, viewChild } from '@angular/core';
import type { Project } from '@cwm/contracts';
import { LiftFocus } from '../../shared/lifts/lift-focus';
import { LiftStack } from '../../shared/lifts/lift-stack';

/** Modal confirmation for the existing archive write, including a refused write's return. */
@Component({
  selector: 'app-project-archive-confirm',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-archive-confirm.html',
})
export class ProjectArchiveConfirm {
  readonly project = input.required<Project>();
  readonly opener = input.required<HTMLElement>();
  readonly archive = input.required<() => Promise<boolean>>();
  readonly closed = output<void>();
  readonly pending = signal(false);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly stack = inject(LiftStack);
  private focus: LiftFocus | null = null;
  private release: (() => void) | null = null;
  private destroyed = false;
  private finished = false;

  constructor() {
    afterNextRender(() => {
      this.focus = new LiftFocus(this.opener(), () => document.querySelector<HTMLElement>('main'));
      this.release = this.stack.open(() => this.finish());
      this.dialog().nativeElement.showModal();
      this.focus.enter(this.dialog().nativeElement.querySelector<HTMLElement>('[data-project-archive-cancel]'));
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.release?.();
      this.dialog().nativeElement.close();
      this.focus?.restore(this.dialog().nativeElement);
    });
  }

  async confirm(): Promise<void> {
    if (this.pending() || this.finished) return;
    this.pending.set(true);
    try { await this.archive()(); }
    finally { if (!this.destroyed) this.finish(); }
  }

  close(): void {
    if (!this.pending()) this.finish();
  }

  keydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(); }
  }

  private finish(): void {
    if (this.finished || this.destroyed) return;
    this.finished = true;
    this.dialog().nativeElement.close();
    this.focus?.restore(this.dialog().nativeElement);
    this.closed.emit();
  }
}
