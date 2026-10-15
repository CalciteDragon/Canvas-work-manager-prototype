import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

/** §67's token-level Depth specimens; inert lifts do not change product overlay behaviour. */
@Component({
  selector: 'app-design-lab-plane-panels',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './plane-panels.html',
  styleUrls: ['./panels.scss', './plane-panels.scss'],
})
export class PlanePanels {
  protected readonly moved = signal(false);
  protected play(): void { this.moved.update((value) => !value); }
}
