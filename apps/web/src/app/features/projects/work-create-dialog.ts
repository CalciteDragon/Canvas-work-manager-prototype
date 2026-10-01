import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender,
  computed, effect, inject, input, output, signal,
} from '@angular/core';
import type { ProjectId } from '@cwm/contracts';

/** One live parent choice in the root's work hierarchy. */
export interface WorkCreateParent {
  readonly id: ProjectId;
  readonly name: string;
  readonly depth: number;
  readonly completed: boolean;
}

/** Presentational workstream creation dialog; the shell supplies the write callback. */
@Component({
  selector: 'app-work-create-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './work-create-dialog.html',
  styleUrl: './work-create-dialog.scss',
})
export class WorkCreateDialog {
  readonly parents = input.required<readonly WorkCreateParent[]>();
  readonly create = input.required<(parentId: ProjectId, name: string) => Promise<string | null>>();
  readonly closed = output<void>();
  readonly selectedParentId = signal<ProjectId | null>(null);
  readonly name = signal('');
  readonly pending = signal(false);
  readonly error = signal<string | null>(null);
  readonly parentNote = signal<string | null>(null);
  readonly selectedParentName = signal('');
  readonly parentOptions = computed(() => {
    const parents = this.parents();
    // Keep an in-flight selection represented natively until its own request settles.
    const selectedId = this.selectedParentId();
    if (this.pending() && selectedId !== null && !parents.some((parent) => parent.id === selectedId)) {
      return [...parents, { id: selectedId, name: this.selectedParentName(), depth: 0, completed: false }];
    }
    return parents;
  });
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private closedAlready = false;
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));
    effect(() => this.reconcileParent());
    afterNextRender(() => {
      this.host.nativeElement.querySelector<HTMLInputElement>('[data-create-work-name]')?.focus();
    });
  }

  /** Reset a vanished choice only after an in-flight write has answered. */
  private reconcileParent(): void {
    const parents = this.parents();
    if (this.pending() || this.closedAlready || this.destroyed) return;
    const selectedId = this.selectedParentId();
    const selected = parents.find((parent) => parent.id === selectedId);
    if (selected) {
      this.selectedParentName.set(selected.name);
      return;
    }
    if (selectedId !== null) {
      this.parentNote.set(`${this.selectedParentName()} is no longer available; choose another parent.`);
    }
    this.selectedParentId.set(parents[0]?.id ?? null);
    this.selectedParentName.set(parents[0]?.name ?? '');
  }

  parentLabel(parent: WorkCreateParent): string {
    return '\u00a0\u00a0'.repeat(parent.depth) + parent.name + (parent.completed ? ' (completed)' : '');
  }

  selectParent(event: Event): void {
    if (this.pending()) return;
    const selected = this.parents().find((parent) => parent.id === (event.target as HTMLSelectElement).value);
    if (!selected) return;
    this.selectedParentId.set(selected.id);
    this.selectedParentName.set(selected.name);
    this.parentNote.set(null);
  }

  setName(event: Event): void {
    if (!this.pending()) this.name.set((event.target as HTMLInputElement).value);
  }

  async submit(): Promise<void> {
    if (this.pending() || this.closedAlready || this.destroyed) return;
    const parentId = this.selectedParentId();
    if (parentId === null) return;
    this.pending.set(true);
    this.error.set(null);
    afterNextRender(() => {
      if (this.pending() && !this.destroyed) {
        this.host.nativeElement.querySelector<HTMLElement>('[data-work-create-dialog]')?.focus();
      }
    }, { injector: this.injector });
    try {
      const error = await this.create()(parentId, this.name().trim());
      if (this.destroyed) return;
      if (error === null) {
        this.closedAlready = true;
        this.closed.emit();
      } else this.error.set(error);
    } catch (error) {
      if (!this.destroyed) this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.pending.set(false);
      this.reconcileParent();
    }
  }

  close(): void {
    if (this.pending() || this.closedAlready || this.destroyed) return;
    this.closedAlready = true;
    this.closed.emit();
  }

  keydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key !== 'Tab') return;
    const dialog = this.host.nativeElement.querySelector<HTMLElement>('[data-work-create-dialog]');
    const focusable = [...this.host.nativeElement.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled])',
    )];
    const first = focusable[0];
    const last = focusable.at(-1);
    const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
    if (!first || !last) {
      event.preventDefault();
      dialog?.focus();
    } else if (activeIndex === -1 || (event.shiftKey && activeIndex === 0) || (!event.shiftKey && activeIndex === focusable.length - 1)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  }
}
