import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender,
  computed, effect, inject, input, output, signal, untracked, viewChild,
} from '@angular/core';
import { isSubproject, type Project, type UpdateProjectInput } from '@cwm/contracts';
import { LiftFocus } from '../../shared/lifts/lift-focus';
import { LiftStack } from '../../shared/lifts/lift-stack';
import { FailureMessage } from '../../shared/feedback/failure-message';
import type { Failure } from '../../shared/feedback/failure';

/** A refused save the header has no reason for. */
const NOT_SAVED: Failure = { sentence: 'The project details could not be saved.', reason: null };

/** A single-commit project details draft with field-level live refresh and guarded dismissal. */
@Component({
  selector: 'app-project-details-dialog',
  imports: [FailureMessage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-details-dialog.html',
  styleUrl: './project-details-dialog.scss',
})
export class ProjectDetailsDialog {
  readonly project = input.required<Project>();
  readonly opener = input.required<HTMLElement>();
  readonly save = input.required<(patch: Pick<UpdateProjectInput, 'name' | 'description' | 'targetDate'>) => Promise<boolean>>();
  /** The header's project write failure (Slice 78): its sentence here, the reason under Details. */
  readonly writeError = input<Failure | null>(null);
  protected readonly saveFailure = computed(() => this.writeError() ?? NOT_SAVED);
  readonly closed = output<void>();
  readonly name = signal('');
  readonly description = signal('');
  readonly targetDate = signal('');
  readonly pending = signal(false);
  readonly discarding = signal(false);
  readonly error = signal<string | null>(null);
  readonly failed = signal(false);
  readonly isWorkUnit = computed(() => isSubproject(this.project()));
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly injector = inject(Injector);
  private readonly stack = inject(LiftStack);
  private base = { name: '', description: '', targetDate: '' };
  private initialized = false;
  private destroyed = false;
  private finished = false;
  private focus: LiftFocus | null = null;
  private release: (() => void) | null = null;

  constructor() {
    effect(() => {
      const project = this.project();
      untracked(() => {
        const fresh = { name: project.name, description: project.description ?? '', targetDate: project.targetDate ?? '' };
        for (const field of ['name', 'description', 'targetDate'] as const) {
          if (!this.initialized || this[field]() === this.base[field]) {
            this[field].set(fresh[field]);
            this.base[field] = fresh[field];
          }
        }
        this.initialized = true;
      });
    });
    afterNextRender(() => {
      this.focus = new LiftFocus(this.opener(), () => document.querySelector<HTMLElement>('main'));
      this.release = this.stack.open(() => this.finish());
      this.dialog().nativeElement.showModal();
      this.focus.enter(this.dialog().nativeElement.querySelector<HTMLElement>('input'));
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.release?.();
      const dialog = this.dialog().nativeElement;
      dialog.close();
      this.focus?.restore(dialog);
    });
  }

  setField(field: 'name' | 'description' | 'targetDate', event: Event): void {
    if (!this.pending()) this[field].set((event.target as HTMLInputElement).value);
  }

  clearDate(): void {
    if (!this.pending()) this.targetDate.set('');
  }

  async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.pending() || this.finished) return;
    this.error.set(null);
    if (!this.name().trim()) { this.error.set('A project name is required.'); return; }
    const patch = this.patch();
    if (!Object.keys(patch).length) { this.finish(); return; }
    this.pending.set(true);
    this.failed.set(false);
    try {
      if (await this.save()(patch)) {
        if (!this.destroyed) this.finish();
      } else if (!this.destroyed) this.failed.set(true);
    } catch (error) {
      if (!this.destroyed) this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.pending.set(false);
    }
  }

  requestClose(): void {
    if (this.pending() || this.finished) return;
    if (Object.keys(this.patch()).length) {
      this.discarding.set(true);
      afterNextRender(() => this.dialog().nativeElement.querySelector<HTMLElement>('[data-project-keep-editing]')?.focus(), { injector: this.injector });
    } else this.finish();
  }

  keepEditing(): void {
    this.discarding.set(false);
    this.dialog().nativeElement.querySelector<HTMLElement>('input')?.focus();
  }

  discard(): void {
    if (!this.pending()) this.finish();
  }

  keydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.requestClose(); }
  }

  backdrop(event: MouseEvent): void {
    const dialog = this.dialog().nativeElement;
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) this.requestClose();
  }

  private patch(): Pick<UpdateProjectInput, 'name' | 'description' | 'targetDate'> {
    const patch: Pick<UpdateProjectInput, 'name' | 'description' | 'targetDate'> = {};
    if (this.name().trim() !== this.base.name) patch.name = this.name().trim();
    if (this.description().trim() !== this.base.description) patch.description = this.description().trim() || null;
    if (this.targetDate() !== this.base.targetDate) patch.targetDate = this.targetDate() || null;
    return patch;
  }

  private finish(): void {
    if (this.finished || this.destroyed) return;
    this.finished = true;
    this.dialog().nativeElement.close();
    this.focus?.restore(this.dialog().nativeElement);
    this.closed.emit();
  }
}
