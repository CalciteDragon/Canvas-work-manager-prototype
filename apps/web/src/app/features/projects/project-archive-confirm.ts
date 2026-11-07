import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, afterRenderEffect, computed, inject, input, output, signal, viewChild } from '@angular/core';
import type { Project, ProjectId } from '@cwm/contracts';
import { liveDescendantIds, liveDescendantsOf, type LiveDescendant } from './live-descendants';
import { WORKSPACE_TREE } from './workspace-tree';
import { LiftFocus } from '../../shared/lifts/lift-focus';
import { LiftStack } from '../../shared/lifts/lift-stack';

/**
 * Modal confirmation for the archive write, including a refused write's return. Over live
 * workstreams it lists them, nested, with their statuses (Slice 80, R10), and a press names **the
 * ids on screen**, so what the person sees is what the domain is told; a live frame while it is open
 * updates both together. An empty list means none, or that the tree cannot say, and the domain
 * decides. The workstreams are `workstreams` when given (stories, tests), else `liveDescendantsOf` the
 * shell's `WORKSPACE_TREE`, read here rather than passed through the header so that none of it
 * reaches the initial bundle.
 */
@Component({
  selector: 'app-project-archive-confirm',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
  templateUrl: './project-archive-confirm.html',
  styleUrl: './project-archive-confirm.scss',
})
export class ProjectArchiveConfirm {
  readonly project = input.required<Project>();
  readonly workstreams = input<readonly LiveDescendant[] | null>(null);
  private readonly store = inject(WORKSPACE_TREE, { optional: true });
  protected readonly workstreamNodes = computed(() => this.workstreams() ?? (this.store ? liveDescendantsOf(this.store) : []));
  private readonly workstreamIds = computed(() => liveDescendantIds(this.workstreamNodes()));
  protected readonly count = computed(() => this.workstreamIds().length);
  /** A live status in the restore choice's casing ("On hold"), kept here so it stays in this chunk. */
  protected readonly statusLabel = ({ status }: Project): string =>
    status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ');
  readonly opener = input.required<HTMLElement>();
  readonly archive = input.required<(workstreamIds: ProjectId[]) => Promise<boolean>>();
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
    // The tree can change while the dialog is open (a live frame), which can take the list's region
    // away with focus in it; focus then goes to Cancel rather than falling out of the dialog.
    let listed: boolean | null = null;
    afterRenderEffect(() => {
      const now = this.count() > 0;
      if (listed !== null && listed !== now) this.dialog().nativeElement.querySelector<HTMLElement>('[data-project-archive-cancel]')?.focus();
      listed = now;
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
    try { await this.archive()(this.workstreamIds()); }
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
