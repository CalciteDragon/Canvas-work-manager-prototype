import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, afterRenderEffect, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Project } from '@cwm/contracts';
import { liveChildrenOf } from './live-children';
import { WORKSPACE_TREE } from './workspace-tree';
import { LiftFocus } from '../../shared/lifts/lift-focus';
import { LiftStack } from '../../shared/lifts/lift-stack';

/**
 * Modal confirmation for the existing archive write, including a refused write's return. Over
 * live workstreams it is the **blocked** form instead (Slice 79, L4-008): the domain refuses to
 * archive over one, so each is a link to its page with its status, following one closes the
 * dialog, and Close is the only button. None means the tree cannot say otherwise, and the commit
 * form lets the domain decide. The workstreams are `liveChildren` when given (stories, tests),
 * else `liveChildrenOf` the shell's `WORKSPACE_TREE`, read here rather than passed through the
 * header so that none of it reaches the initial bundle.
 */
@Component({
  selector: 'app-project-archive-confirm',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './project-archive-confirm.html',
})
export class ProjectArchiveConfirm {
  readonly project = input.required<Project>();
  readonly liveChildren = input<readonly Project[] | null>(null);
  private readonly store = inject(WORKSPACE_TREE, { optional: true });
  protected readonly blockedBy = computed(() => this.liveChildren() ?? (this.store ? liveChildrenOf(this.store) : []));
  /** A live status in the restore choice's casing ("On hold"), kept here so it stays in this chunk. */
  protected readonly statusLabel = ({ status }: Project): string =>
    status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ');
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
    // The tree can change while the dialog is open (a live frame), swapping the form and the
    // focused button with it; focus then goes to the new form's one dismiss button.
    let blocked: boolean | null = null;
    afterRenderEffect(() => {
      const now = this.blockedBy().length > 0;
      if (blocked !== null && blocked !== now) this.dialog().nativeElement.querySelector<HTMLElement>('[data-project-archive-cancel]')?.focus();
      blocked = now;
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
