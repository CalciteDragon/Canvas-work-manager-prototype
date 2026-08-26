import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CONTRACTS_PACKAGE } from '@cwm/contracts';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('Canvas Work Manager');

  /**
   * Slice 1 only. Proves the `@cwm/contracts` workspace package resolves through the
   * Angular builder and the dev server, not merely through the type-checker. Delete
   * this once the app imports real contracts (Slice 6).
   */
  protected readonly contractsPackage = CONTRACTS_PACKAGE;
}
