import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import type { ProjectId, ProjectLayoutMode } from '@cwm/contracts';
import { PrototypeSettings } from '../../core/config/prototype-settings';
import { WORK_MANAGER_GATEWAY } from '../../core/gateway/work-manager-gateway';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * §28's experiment switch for the project the route is currently on.
 *
 * **The one panel control that writes through `WORK_MANAGER_GATEWAY`**, because
 * `projectLayoutMode` is a domain field on the project — not prototype rigging. A
 * `/prototype/*` route for it would put a domain write on the development namespace.
 *
 * The consequence is honest and worth knowing while using the panel: this control alone is
 * subject to the latency and failure injection the panel itself sets.
 */
@Component({
  selector: 'app-project-layout-control',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!settings.flags().gridProjectLayout) {
      <p data-layout-flag-off class="dev-panel__hint">
        Turned off by the <code>gridProjectLayout</code> flag — every canvas renders as flow.
      </p>
    } @else if (projectId() === null) {
      <p data-layout-no-project class="dev-panel__hint">
        Open a project to switch its layout. This is a per-project experiment (§28).
      </p>
    } @else {
      <div class="dev-panel__choices">
        @for (mode of modes; track mode) {
          <button
            data-panel-layout
            type="button"
            [attr.data-mode]="mode"
            [attr.aria-pressed]="current() === mode"
            [disabled]="saving()"
            (click)="choose(mode)"
          >
            {{ mode }}
          </button>
        }
      </div>
      <p class="dev-panel__hint">
        Writes through the work-manager gateway, so latency and failure injection apply here.
      </p>
      @if (error(); as message) {
        <p data-layout-error class="dev-panel__error" role="alert">{{ message }}</p>
      }
    }
  `,
  styleUrl: './dev-panel-controls.scss',
})
export class ProjectLayoutControl {
  readonly projectId = input.required<ProjectId | null>();

  private readonly gateway = inject(WORK_MANAGER_GATEWAY);
  protected readonly settings = inject(PrototypeSettings);

  protected readonly current = signal<ProjectLayoutMode | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly modes: ProjectLayoutMode[] = ['flow', 'grid'];

  constructor() {
    effect(() => {
      const id = this.projectId();
      this.error.set(null);
      this.current.set(null);
      if (id === null || !this.settings.flags().gridProjectLayout) return;
      void this.read(id);
    });
  }

  private async read(id: ProjectId): Promise<void> {
    try {
      this.current.set((await this.gateway.projects.get(id)).projectLayoutMode);
    } catch (error) {
      this.error.set(messageOf(error));
    }
  }

  protected async choose(mode: ProjectLayoutMode): Promise<void> {
    const id = this.projectId();
    if (id === null || this.saving() || this.current() === mode) return;

    this.saving.set(true);
    this.error.set(null);
    try {
      this.current.set((await this.gateway.projects.update(id, { projectLayoutMode: mode })).projectLayoutMode);
      // The project page reads the mode off the project it loaded, so the canvas only
      // re-renders on a fresh read. Reloading is the panel's standing answer to that.
      location.reload();
    } catch (error) {
      this.error.set(messageOf(error));
    } finally {
      this.saving.set(false);
    }
  }
}
