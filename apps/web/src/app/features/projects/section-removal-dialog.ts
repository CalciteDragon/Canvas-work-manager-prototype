import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { nameOf, type OwnedDataKind, type SectionId } from '@cwm/contracts';
import type { SectionRemovalPrompt } from './project-page-store';

/**
 * Singular and plural per owned kind. A lookup rather than a string operation — **not**
 * because dropping the final `s` gets the wrong answer (it does not, for either value) but
 * because a `Record<OwnedDataKind, …>` stops compiling when `OwnedDataKind` gains a member,
 * which is the same reason `containerTypeFor` derives from the ownership map.
 */
const ROW_NOUN: Record<OwnedDataKind, { one: string; many: string }> = {
  tasks: { one: 'task', many: 'tasks' },
  reflections: { one: 'reflection', many: 'reflections' },
};

/**
 * §31's remove, once ownership has made it a question rather than a confirmation. A view
 * and an empty container never reach this — they are removed directly; a container still
 * holding **live** rows has to say what becomes of them
 * (docs/decisions/2026-09-what-undo-means-for-an-archived-row.md).
 *
 * **The prose is the UI's, not the domain's.** The domain's sentence answers an agent: it
 * names an id, says "1 tasks", and explains the policy vocabulary rather than the choice.
 * The store hands over the parts — the name, the count, the owned kind — and this composes
 * a question a person can answer.
 *
 * Its own component rather than more of `ProjectCanvas`: the canvas's stylesheet is already at
 * its budget, and a dialog with two answers and a target picker is a self-contained thing.
 */
@Component({
  selector: 'app-section-removal-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-section-removal-dialog]': '""' },
  templateUrl: './section-removal-dialog.html',
  styleUrl: './section-removal-dialog.scss',
})
export class SectionRemovalDialog {
  readonly prompt = input.required<SectionRemovalPrompt>();
  readonly pending = input(false);

  readonly cancelled = output<void>();
  readonly cascadeChosen = output<void>();
  readonly reassignChosen = output<SectionId>();

  /** Unset until the user picks: the first offered container is the default answer. */
  readonly targetId = signal<SectionId | null>(null);
  readonly chosenTarget = computed(() => this.targetId() ?? (this.prompt().targets[0]?.id as SectionId));
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  constructor() {
    afterNextRender(() => {
      this.host.nativeElement.querySelector<HTMLButtonElement>('[data-section-removal-cancel]')?.focus();
    }, { injector: this.injector });
  }

  cancel(): void {
    if (!this.pending()) this.cancelled.emit();
  }

  reassign(): void {
    if (!this.pending()) this.reassignChosen.emit(this.chosenTarget());
  }

  cascade(): void {
    if (!this.pending()) this.cascadeChosen.emit();
  }

  selectTarget(event: Event): void {
    if (!this.pending()) this.targetId.set((event.target as HTMLSelectElement).value as SectionId);
  }

  keydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...this.host.nativeElement.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    )];
    if (focusable.length === 0) {
      event.preventDefault();
      this.host.nativeElement.querySelector<HTMLElement>('[data-section-removal-dialog]')?.focus();
      return;
    }
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
    if (activeIndex === -1) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && activeIndex === 0) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && activeIndex === focusable.length - 1) {
      event.preventDefault();
      first.focus();
    }
  }

  /** `1 task`, never the domain's `1 tasks`. Pluralisation is a UI concern. */
  readonly rowCountLabel = computed(() => {
    const { rowCount, ownedKind } = this.prompt();
    const noun = ROW_NOUN[ownedKind];
    return `${rowCount} ${rowCount === 1 ? noun.one : noun.many}`;
  });

  /** The plural noun the two action labels use — the person is looking at tasks, not rows. */
  readonly rowNoun = computed(() => ROW_NOUN[this.prompt().ownedKind].many);

  /**
   * Names, disambiguated only where they collide. Sections keep no uniqueness rule (two may
   * share a name deliberately), and every untitled Task List resolves to `Task List` — so
   * without this the friction note's second half survives naming: three identical options.
   *
   * `position + 1`, not an index into `targets`: `position` is absolute across *all* section
   * types while `targets` is filtered to one, so an index would name a canvas position the
   * section is not at. A cardinal, not an ordinal — `4th` needs suffix logic with the
   * 11/12/13 exception, which is a rule to get wrong for a label nobody reads twice.
   */
  readonly targetOptions = computed(() => {
    const targets = this.prompt().targets;
    const names = targets.map((target) => nameOf(target));
    return targets.map((target, index) => ({
      id: target.id,
      label:
        names.filter((name) => name === names[index]).length > 1
          ? `${names[index]} (position ${target.position + 1} on the canvas)`
          : names[index]!,
    }));
  });
}
