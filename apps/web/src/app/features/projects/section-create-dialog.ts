import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { ProjectId, ProjectPageId, ShortcutSource } from '@cwm/contracts';
import type { SectionDefinition } from './sections/registry';
import { ShortcutPicker } from './shortcuts/shortcut-picker';

/** One popup for a positioned section or Home shortcut create. */
@Component({
  selector: 'app-section-create-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ShortcutPicker],
  templateUrl: './section-create-dialog.html',
  styleUrl: './section-create-dialog.scss',
})
export class SectionCreateDialog {
  readonly types = input.required<readonly SectionDefinition[]>();
  readonly projectId = input.required<ProjectId>();
  readonly pageId = input.required<ProjectPageId>();
  readonly shortcutsAllowed = input.required<boolean>();
  readonly create = input.required<(type: string, title: string | null) => Promise<string | null>>();
  readonly createShortcut = input.required<(source: ShortcutSource) => Promise<string | null>>();
  readonly closed = output<void>();

  readonly mode = signal<'section' | 'shortcut'>('section');
  readonly selectedType = signal('');
  readonly name = signal('');
  readonly pending = signal(false);
  readonly shortcutPending = signal(false);
  readonly busy = () => this.pending() || this.shortcutPending();
  readonly error = signal<string | null>(null);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  constructor() {
    afterNextRender(() => {
      this.selectedType.set(this.types()[0]?.type ?? '');
      this.host.nativeElement.querySelector<HTMLSelectElement>('[data-create-section-type]')?.focus();
    }, { injector: this.injector });
  }

  selectType(event: Event): void {
    this.selectedType.set((event.target as HTMLSelectElement).value);
  }

  setName(event: Event): void {
    this.name.set((event.target as HTMLInputElement).value);
  }

  switchToShortcut(): void {
    if (!this.shortcutsAllowed() || this.busy()) return;
    this.mode.set('shortcut');
    this.error.set(null);
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLButtonElement>('[data-create-section-mode]')?.focus(),
      { injector: this.injector },
    );
  }

  switchToSection(): void {
    if (this.busy()) return;
    this.mode.set('section');
    this.error.set(null);
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLSelectElement>('[data-create-section-type]')?.focus(),
      { injector: this.injector },
    );
  }

  async submit(): Promise<void> {
    if (this.busy() || this.mode() !== 'section') return;
    this.pending.set(true);
    this.error.set(null);
    try {
      const title = this.name().trim();
      const error = await this.create()(this.selectedType(), title === '' ? null : title);
      if (error === null) this.closed.emit();
      else this.error.set(error);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.pending.set(false);
    }
  }

  shortcutCreated(): void {
    if (!this.busy()) this.closed.emit();
  }

  shortcutPendingChanged(pending: boolean): void {
    this.shortcutPending.set(pending);
    if (pending) {
      afterNextRender(
        () => this.host.nativeElement.querySelector<HTMLElement>('[data-section-create-dialog]')?.focus(),
        { injector: this.injector },
      );
    }
  }

  close(): void {
    if (!this.busy()) this.closed.emit();
  }

  keydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...this.host.nativeElement.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    )];
    if (focusable.length === 0) {
      event.preventDefault();
      this.host.nativeElement.querySelector<HTMLElement>('[data-section-create-dialog]')?.focus();
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
}
