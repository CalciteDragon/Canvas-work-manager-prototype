import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  computed,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import type { ProjectPlace } from '../navigation-context';
import type { ProjectTreeNode } from '../shell-store';
import { Icon } from '../../../shared/components/icon/icon';
import type { Failure } from '../../../shared/feedback/failure';
import { FailureMessage } from '../../../shared/feedback/failure-message';
import { ProjectTreeItem } from './project-tree-item';
import { rootLevelOf } from './tree-model';

/**
 * §23's sidebar. **Presentational**: it takes the project tree and the load's outcome as
 * inputs and injects neither the store nor the gateway, which is what keeps §19's
 * `Page → Store → Gateway` chain from quietly becoming `Component → Gateway`. §81's
 * "create project" is an output for the same reason — `AppShell` asks `ShellStore`.
 */
@Component({
  selector: 'app-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProjectTreeItem, RouterLink, RouterLinkActive, Icon, FailureMessage],
  styleUrl: './sidebar.scss',
  templateUrl: './sidebar.html',
})
export class Sidebar {
  readonly projectTree = input.required<ProjectTreeNode[]>();
  /** The tree's failed read (Slice 78): it replaces the tree, politely, with Try again. */
  readonly failure = input.required<Failure | null>();
  /**
   * A read is running. With no tree yet it says "Loading projects…", never "No projects yet"
   * (L4-001); over a failure it keeps the failure and makes its Try again busy.
   */
  readonly loading = input(false);
  /**
   * A failed creation, kept apart from `failure` on purpose: that one *replaces* the tree,
   * and losing every project from navigation because one write failed is a worse answer
   * than the write's own message beside the form that produced it.
   */
  readonly createError = input<Failure | null>(null);
  /** Archived projects exist (Slice 79): an empty tree says "No active projects." and links to them. */
  readonly hasArchived = input(false);
  /**
   * Where the person is inside a project (Slice 81, R2), from `NavigationContext` through
   * `AppShell`; `null` outside one. It decides the tree's level and its current item.
   */
  readonly projectPlace = input<ProjectPlace | null>(null);

  readonly createRequested = output<string>();
  /** Try again on a failed read; `AppShell` asks `ShellStore` to read again. */
  readonly retryRequested = output<void>();

  /**
   * B's level is view state, not a route (Slice 81): set by `showTopLevel()`, reset by every
   * place change and by every link chosen in the tree, so a navigation always lands on its level.
   */
  private readonly upState = signal(false);
  /** The root level's rows, or `null` where there is none to show (outside a project, a missing one). */
  protected readonly rootLevel = computed(() => rootLevelOf(this.projectPlace(), this.projectTree()));
  protected readonly level = computed<'top' | 'root'>(() => (this.rootLevel() !== null && !this.upState() ? 'root' : 'top'));
  /** At the top level inside a project the current root is the location, not the page (R3, B's exception). */
  protected readonly locationRootId = computed(() => (this.level() === 'top' ? this.rootLevel()?.root.id ?? null : null));
  /**
   * The top level's roots: the live ones from the read, and an archived root while it is current,
   * which the read leaves out but which has to carry the location (Q11 (a)).
   */
  protected readonly topRoots = computed(() => {
    const roots = this.projectTree().map(({ project }) => ({ id: project.id, name: project.name, icon: project.icon ?? null, archived: false }));
    const current = this.rootLevel()?.root;
    if (current?.status === 'archived' && !roots.some(({ id }) => id === current.id)) roots.push({ ...current, archived: true });
    return roots;
  });
  protected readonly createOpen = signal(false);
  /** Survives the form closing, so a failed creation can hand the name back. */
  protected readonly draftName = signal('');
  /** A blank name was refused here, beside the field, before anything was sent (Slice 75). */
  protected readonly nameRefused = signal(false);

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('newName');
  private readonly injector = inject(Injector);

  /** The top level, without navigating (B's back-chevron, Slice 81). */
  showTopLevel(): void {
    this.upState.set(true);
  }

  /** Opening the form moves focus into its name (slice 72), after the render that creates it. */
  protected toggleCreate(): void {
    this.createOpen.update((open) => !open);
    this.nameRefused.set(false);
    if (this.createOpen()) afterNextRender(() => this.nameInput()?.nativeElement.focus(), { injector: this.injector });
  }

  constructor() {
    // The sidebar cannot await the write without injecting the store, so it closes the form
    // optimistically and learns the outcome from `createError`. When one arrives it puts the
    // form back with the name still in it — otherwise a failed creation costs the user their
    // typing and they have to retype it beside the error explaining why.
    //
    // Focus goes back into the name too (Slice 58): the optimistic close removed the Create
    // button that held it, so it had fallen to the document — out of the phone drawer, and
    // nowhere useful at desktop width either. After the render, because the input the form
    // reopens does not exist until then.
    effect(() => {
      if (this.createError() !== null) untracked(() => this.reopenCreate());
    });

    // Every place change resets the level; a link chosen in the tree does too, because choosing the
    // current page navigates nowhere and still has to drill back in. Captured, because a link to the
    // other project route config re-creates the routed shell inside `RouterLink`'s own handler.
    effect(() => {
      this.placeKey();
      untracked(() => this.upState.set(false));
    });
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const onClick = (event: MouseEvent): void => {
      // A plain primary activation only: a modified or middle click opens elsewhere and stays here.
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      if (event.target instanceof Element && event.target.closest('a[href]') !== null) this.upState.set(false);
    };
    host.addEventListener('click', onClick, { capture: true });
    inject(DestroyRef).onDestroy(() => host.removeEventListener('click', onClick, { capture: true }));
  }

  private readonly placeKey = computed(() => {
    const place = this.projectPlace();
    return place === null ? null : `${place.projectId}:${place.currentKind ?? ''}`;
  });

  /**
   * Puts the form back, draft and all, with focus in the name. Public because `AppShell`, which
   * sees each failure in the store, calls it too: a repeated refusal is not left to depend on
   * this input noticing the change. Idempotent.
   */
  reopenCreate(): void {
    this.createOpen.set(true);
    afterNextRender(() => this.nameInput()?.nativeElement.focus(), { injector: this.injector });
  }

  /**
   * Closes on submit, because a form that stays open behind a successful navigation reads as
   * though nothing happened. The name is **kept**, not cleared: it is what the effect above
   * restores on failure, and a successful creation navigates away from it.
   */
  protected submitCreate(event: Event, input: HTMLInputElement): void {
    event.preventDefault();
    const name = input.value.trim();
    if (name === '') {
      this.nameRefused.set(true);
      input.focus();
      return;
    }
    this.nameRefused.set(false);
    this.draftName.set(name);
    this.createOpen.set(false);
    this.createRequested.emit(name);
  }
}
