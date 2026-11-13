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
import type { ProjectId } from '@cwm/contracts';
import type { ProjectPlace } from '../navigation-context';
import type { ProjectTreeNode } from '../shell-store';
import { Icon } from '../../../shared/components/icon/icon';
import type { Failure } from '../../../shared/feedback/failure';
import { FailureMessage } from '../../../shared/feedback/failure-message';
import { EditProjectMenu } from './edit-project-menu';
import { ProjectTreeItem } from './project-tree-item';
import { rootLevelOf } from './tree-model';

/**
 * §23's sidebar. **Presentational**: it takes the project tree and the load's outcome as
 * inputs and injects neither the store nor the gateway, which is what keeps §19's
 * `Page → Store → Gateway` chain from quietly becoming `Component → Gateway`. §81's
 * "create project" is an output for the same reason — `AppShell` asks `ShellStore`.
 *
 * **Tooltips** (Slice 81, decision 3): an icon-only control carries its name in `data-tooltip`,
 * which `_controls.scss` draws on hover and keyboard focus (no `title`, so the name is not
 * announced twice). WCAG 1.4.13: the label is part of the control's box, so the pointer can move
 * onto it, and Escape on a control whose label shows hides it (`data-tooltip-hidden`) without
 * moving focus, keeping that Escape from the phone drawer. Escape only reaches a focused control,
 * so the dismissal lasts until focus leaves it. One
 * delegated listener here covers the chevron and the pencil.
 */
@Component({
  selector: 'app-sidebar',
  host: { '(keydown.escape)': 'hideTooltip($event)', '(focusout)': 'resetTooltip($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProjectTreeItem, EditProjectMenu, RouterLink, RouterLinkActive, Icon, FailureMessage],
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
   * A project shell has registered its handlers (`NavigationContext.hasHandlers`). Without one
   * the pencil is not drawn: a control that can do nothing is absent (R2).
   */
  readonly projectActions = input(false);
  /**
   * The pencil's "Pages of <root>…", with the pencil as the lift's anchor and focus return.
   * `AppShell` leaves both requests unbound until step 6 registers the handlers that answer them;
   * until then no handler means no pencil.
   */
  readonly pageSettingsRequested = output<HTMLElement>();
  /** The pencil's "Add workstream", with the pencil. */
  readonly addWorkstreamRequested = output<HTMLElement>();

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
  /**
   * Workstream disclosures (Q4 (a)): which rows are open. A place change opens the current item's
   * ancestors and keeps the person's own choices in the same root; another root starts afresh.
   */
  protected readonly expanded = signal<ReadonlySet<ProjectId>>(new Set());
  private expandedRootId: ProjectId | null = null;
  protected readonly addBlockedReason = computed(() => this.projectPlace()?.addBlockedReason ?? null);
  protected readonly createOpen = signal(false);
  /** Survives the form closing, so a failed creation can hand the name back. */
  protected readonly draftName = signal('');
  /** A blank name was refused here, beside the field, before anything was sent (Slice 75). */
  protected readonly nameRefused = signal(false);

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('newName');
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /** The top level, without navigating (B's back-chevron, Slice 81). */
  showTopLevel(): void {
    this.upState.set(true);
  }

  /** The chevron: the top level, with focus kept in the tree on the current root's row there. */
  protected goUp(): void {
    const rootId = this.rootLevel()?.root.id;
    this.showTopLevel();
    afterNextRender(() => this.host.querySelector<HTMLElement>(`[data-project-id="${rootId}"] a`)?.focus(), { injector: this.injector });
  }

  protected hideTooltip(event: Event): void {
    const target = event.target as HTMLElement;
    if (!target.hasAttribute?.('data-tooltip') || target.hasAttribute('data-tooltip-hidden')) return;
    target.setAttribute('data-tooltip-hidden', '');
    event.stopPropagation();
  }

  protected resetTooltip(event: Event): void {
    (event.target as HTMLElement).removeAttribute?.('data-tooltip-hidden');
  }

  protected toggleWork(id: ProjectId): void {
    const open = new Set(this.expanded());
    if (!open.delete(id)) open.add(id);
    this.expanded.set(open);
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
    // A loaded place opens its ancestors: the person's own choices stay within a root.
    effect(() => {
      const place = this.projectPlace();
      const rootId = this.rootLevel()?.root.id ?? null;
      untracked(() => {
        const open = new Set(rootId === this.expandedRootId ? this.expanded() : []);
        for (const { id } of place?.status === 'ready' ? place.ancestors : []) open.add(id);
        this.expandedRootId = rootId;
        this.expanded.set(open);
      });
    });
    const host = this.host;
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
