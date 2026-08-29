import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import type { ProjectId, ProjectLayoutMode } from '@cwm/contracts';
import { PrototypeSettings } from '../../core/config/prototype-settings';
import { DevPanelControls } from './dev-panel-controls';
import { StateInspectorStore } from './state-inspector-store';

/**
 * §68's "seed/state inspector". It renders §46's controls — the same component the
 * Ctrl/Cmd+Shift+D overlay uses, so there is never a second version of a control — and
 * adds the one thing the overlay has no room for: §28's per-project layout list, which
 * needs every project rather than the one the route is on.
 */
@Component({
  selector: 'app-state-inspector-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DevPanelControls],
  providers: [StateInspectorStore],
  template: `
    <main class="state-inspector">
      <header>
        <p class="state-inspector__eyebrow">Development panel</p>
        <h1>Prototype state</h1>
        <p>
          The same controls as the Ctrl/Cmd+Shift+D panel, plus §28's layout experiment
          across every project.
        </p>
      </header>

      <app-dev-panel-controls />

      <h2>Layout experiment</h2>
      <p>Compare flow and grid with the projects already in the prototype.</p>

      @if (!settings.flags().gridProjectLayout) {
        <p data-layout-flag-off class="state-inspector__deferral">
          The <code>gridProjectLayout</code> flag is off, so every canvas renders as flow.
          Turn it on above to run the experiment.
        </p>
      } @else {

      @if (store.loading()) {
        <p data-state-loading>Loading projects…</p>
      } @else {
        @if (store.error(); as error) {
          <p data-state-error class="state-inspector__error" role="alert">{{ error }}</p>
        }

        @if (store.projects().length === 0 && store.error() === null) {
          <p data-state-empty>No visible projects are available for comparison.</p>
        } @else {
          <div class="state-inspector__projects">
            @for (project of store.projects(); track project.id) {
              <fieldset
                class="state-inspector__project"
                [attr.aria-busy]="store.isSaving(project.id)"
              >
                <legend>{{ project.icon }} {{ project.name }}</legend>
                @for (mode of modes; track mode) {
                  <button
                    data-layout-control
                    type="button"
                    [attr.data-project-id]="project.id"
                    [value]="mode"
                    [attr.aria-pressed]="project.projectLayoutMode === mode"
                    [disabled]="store.isSaving(project.id)"
                    (click)="changeLayout(project.id, mode)"
                  >
                    {{ mode }}
                  </button>
                }
              </fieldset>
            }
          </div>
        }
      }
      }
    </main>
  `,
  styleUrl: './state-inspector-page.scss',
})
export class StateInspectorPage {
  readonly store = inject(StateInspectorStore);
  readonly settings = inject(PrototypeSettings);
  readonly modes: ProjectLayoutMode[] = ['flow', 'grid'];

  constructor() {
    void this.store.load();
  }

  changeLayout(id: ProjectId, mode: ProjectLayoutMode): void {
    void this.store.setLayout(id, mode);
  }
}
