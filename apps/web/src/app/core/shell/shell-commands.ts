import { InjectionToken, type Signal } from '@angular/core';

/**
 * What a routed page may ask of the shell, and the one shell fact it may read (Slice 79, W1-001).
 * `AppShell` provides it as itself (`useExisting`), so a page injects this token and never
 * `ShellStore`: the store stays the shell's own (§20), and the drawer and the sidebar's creation
 * form stay `AppShell`'s UI state, which only it changes. A token rather than a class, because
 * every byte of the initial bundle is spoken for (§47's 1,150 kB ceiling).
 */
export interface ShellCommands {
  /** No projects at all, live or archived, after a read that answered: Home's first run. */
  readonly workspaceEmpty: Signal<boolean>;
  /** Opens the one creation form, the sidebar's, with focus in its name (the Menu first when narrow). */
  requestCreate(): void;
}

export const SHELL_COMMANDS = new InjectionToken<ShellCommands>('SHELL_COMMANDS');
