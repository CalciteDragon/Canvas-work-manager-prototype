import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import type { ProjectTreeNode } from '../shell-store';
import { ProjectTreeItem } from './project-tree-item';

/**
 * §23's sidebar. **Presentational**: it takes the project tree and the load's outcome as
 * inputs and injects neither the store nor the gateway, which is what keeps §19's
 * `Page → Store → Gateway` chain from quietly becoming `Component → Gateway`. §81's
 * "create project" is an output for the same reason — `AppShell` asks `ShellStore`.
 */
@Component({
  selector: 'app-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProjectTreeItem, RouterLink, RouterLinkActive],
  styleUrl: './sidebar.scss',
  templateUrl: './sidebar.html',
})
export class Sidebar {
  readonly projectTree = input.required<ProjectTreeNode[]>();
  readonly error = input.required<string | null>();
  /**
   * A failed creation, kept apart from `error` on purpose: that one *replaces* the tree,
   * and losing every project from navigation because one write failed is a worse answer
   * than the write's own message beside the form that produced it.
   */
  readonly createError = input<string | null>(null);

  readonly createRequested = output<string>();

  /** §23: "Project hierarchy should optionally expand inline." */
  protected readonly projectsExpanded = signal(true);
  protected readonly createOpen = signal(false);
  /** Survives the form closing, so a failed creation can hand the name back. */
  protected readonly draftName = signal('');

  protected toggleProjects(): void {
    this.projectsExpanded.update((expanded) => !expanded);
  }

  protected toggleCreate(): void {
    this.createOpen.update((open) => !open);
  }

  constructor() {
    // The sidebar cannot await the write without injecting the store, so it closes the form
    // optimistically and learns the outcome from `createError`. When one arrives it puts the
    // form back with the name still in it — otherwise a failed creation costs the user their
    // typing and they have to retype it beside the error explaining why.
    effect(() => {
      if (this.createError() !== null) this.createOpen.set(true);
    });
  }

  /**
   * Closes on submit, because a form that stays open behind a successful navigation reads as
   * though nothing happened. The name is **kept**, not cleared: it is what the effect above
   * restores on failure, and a successful creation navigates away from it.
   */
  protected submitCreate(event: Event, input: HTMLInputElement): void {
    event.preventDefault();
    const name = input.value.trim();
    if (name === '') return;
    this.draftName.set(name);
    this.createOpen.set(false);
    this.createRequested.emit(name);
  }
}
