import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import type { ProjectId, ProjectLayoutMode } from '@cwm/contracts';
import { StateInspectorStore } from './state-inspector-store';

/** §28's experiment switch. Slice 12 expands this route into the full prototype panel. */
@Component({
  selector: 'app-state-inspector-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [StateInspectorStore],
  template: `
    <main class="state-inspector">
      <header>
        <p class="state-inspector__eyebrow">Development panel</p>
        <h1>Layout experiment</h1>
        <p>Compare flow and grid with the projects already in the prototype.</p>
        <p data-slice-12-deferral class="state-inspector__deferral">
          Slice 12 adds seed, state, time, and failure controls. They are not part of this
          experiment panel yet.
        </p>
      </header>

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
                  <label>
                    <input
                      data-layout-control
                      type="radio"
                      [attr.data-project-id]="project.id"
                      [attr.name]="'layout-' + project.id"
                      [value]="mode"
                      [checked]="project.projectLayoutMode === mode"
                      [disabled]="store.isSaving(project.id)"
                      (change)="changeLayout(project.id, mode)"
                    />
                    {{ mode }}
                  </label>
                }
              </fieldset>
            }
          </div>
        }
      }
    </main>
  `,
  styleUrl: './state-inspector-page.scss',
})
export class StateInspectorPage {
  readonly store = inject(StateInspectorStore);
  readonly modes: ProjectLayoutMode[] = ['flow', 'grid'];

  constructor() {
    void this.store.load();
  }

  changeLayout(id: ProjectId, mode: ProjectLayoutMode): void {
    void this.store.setLayout(id, mode);
  }
}
