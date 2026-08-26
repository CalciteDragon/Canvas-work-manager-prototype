import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SCHEMA_VERSION } from '@cwm/contracts';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('Canvas Work Manager');

  /**
   * Proves the `@cwm/contracts` workspace package resolves through the Angular builder
   * and the dev server, not merely through the type-checker. Delete this once the app
   * imports contracts for real work (Slice 6).
   */
  protected readonly contractsSchemaVersion = SCHEMA_VERSION;
}
