import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { Theme } from '@cwm/contracts';
import {
  FAILURE_RATES,
  NETWORK_DELAYS,
  PrototypeSettings,
  type PrototypeFlags,
} from '../../core/config/prototype-settings';
import { ThemeService } from '../../core/theme/theme-service';
import { DevPanelStore } from './dev-panel-store';
import { ProjectLayoutControl } from './project-layout-control';

/** §47's six, with the two that gate something today marked as live. */
interface FlagRow {
  key: keyof PrototypeFlags;
  label: string;
  /** An inert flag gates a feature a later slice builds. Saying so beats implying otherwise. */
  gates: string | null;
}

const FLAG_ROWS: readonly FlagRow[] = [
  { key: 'gridProjectLayout', label: 'Grid project layout', gates: 'Project canvas grid mode (§28)' },
  { key: 'nestedProjects', label: 'Nested projects', gates: 'Sidebar hierarchy (§23)' },
  { key: 'subtasks', label: 'Subtasks', gates: null },
  { key: 'manualProgress', label: 'Manual progress', gates: null },
  { key: 'aiSummarySections', label: 'AI summary sections', gates: null },
  { key: 'agentConfirmations', label: 'Agent confirmations', gates: null },
];

/**
 * §46's control set, in one component so the overlay and `/prototype/state` cannot drift
 * into two versions of the same panel.
 *
 * Agent Connection — §46's tenth control — is absent on purpose: agent connections do not
 * exist until Slice 13, and a control over nothing is the aspirational UI AGENTS.md §2
 * forbids.
 */
@Component({
  selector: 'app-dev-panel-controls',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProjectLayoutControl],
  styleUrl: './dev-panel-controls.scss',
  templateUrl: './dev-panel-controls.html',
})
export class DevPanelControls {
  protected readonly store = inject(DevPanelStore);
  protected readonly settings = inject(PrototypeSettings);
  private readonly themeService = inject(ThemeService);

  protected readonly theme = this.themeService.theme;
  protected readonly delays = NETWORK_DELAYS;
  protected readonly failureRates = FAILURE_RATES;
  protected readonly flagRows = FLAG_ROWS;
  protected readonly themes: Theme[] = ['dark', 'light'];
  protected readonly providers: Array<'mock' | 'real'> = ['mock', 'real'];

  protected readonly noteDraft = signal('');
  protected readonly noteSaved = signal(false);

  /** Layout Mode needs a project; off a project page there is nothing to switch. */
  protected readonly projectId = computed(() => this.store.currentProjectId());

  constructor() {
    void this.store.load();
  }

  protected delayLabel(milliseconds: number): string {
    if (milliseconds === 0) return 'none';
    return milliseconds < 1000 ? `${milliseconds} ms` : `${milliseconds / 1000} s`;
  }

  protected ratePercent(rate: number): string {
    return `${Math.round(rate * 100)}%`;
  }

  protected setTheme(theme: Theme): void {
    this.themeService.set(theme);
  }

  protected setDay(event: Event): void {
    void this.store.setSimulatedDay((event.target as HTMLInputElement).value);
  }

  protected async saveNote(): Promise<void> {
    const note = this.noteDraft().trim();
    if (note === '') return;
    if (await this.store.addNote(note)) {
      this.noteDraft.set('');
      this.noteSaved.set(true);
    }
  }

  protected onNoteInput(event: Event): void {
    this.noteDraft.set((event.target as HTMLTextAreaElement).value);
    this.noteSaved.set(false);
  }
}
