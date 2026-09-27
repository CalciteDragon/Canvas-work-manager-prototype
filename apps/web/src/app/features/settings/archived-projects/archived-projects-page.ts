import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, inject, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ProjectId, ProjectRestoreStatus } from '@cwm/contracts';
import { ArchivedProjectsStore } from './archived-projects-store';

/** Settings recovery works independently of a project route or enabled Archive page. */
@Component({
  selector: 'app-archived-projects-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  providers: [ArchivedProjectsStore],
  templateUrl: './archived-projects-page.html',
  styleUrl: './archived-projects-page.scss',
})
export class ArchivedProjectsPage {
  protected readonly store = inject(ArchivedProjectsStore);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly changeDetector = inject(ChangeDetectorRef);

  constructor() { void this.store.load(); }

  protected choose(id: ProjectId, event: Event): void {
    this.store.chooseStatus(id, (event.target as HTMLSelectElement).value as ProjectRestoreStatus | '');
  }

  protected async restore(id: ProjectId): Promise<void> {
    const focused = this.host.nativeElement.contains(document.activeElement) &&
      (document.activeElement as HTMLElement).hasAttribute('data-archived-restore');
    const restored = await this.store.restore(id);
    if (!restored || !focused) return;
    this.changeDetector.detectChanges();
    // A successful refresh removes the row. Put keyboard focus on the next action, or the
    // page heading when it was the last one. A failed refresh leaves the button in place.
    if (!this.store.items().some(({ project }) => project.id === id)) {
      const next = this.host.nativeElement.querySelector('[data-archived-restore]') as HTMLElement | null;
      (next ?? this.heading()?.nativeElement)?.focus();
    }
  }
}
