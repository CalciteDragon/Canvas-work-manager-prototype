import { A11yModule } from '@angular/cdk/a11y';
import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { ThemeService } from '../theme/theme-service';
import { ShellStore } from './shell-store';
import { Sidebar } from './sidebar/sidebar';
import { TopBar } from './top-bar/top-bar';

/**
 * Slice 58's phone breakpoint, below which the sidebar becomes a drawer. The canvas's existing
 * single-column breakpoint, so a 768 px tablet keeps the inline sidebar.
 *
 * Mirrors the `48rem` media queries in `app-shell.scss` and `top-bar.scss`. A custom property
 * cannot appear in a query condition, so the three carry the literal and point at each other.
 */
export const SHELL_NARROW_QUERY = '(max-width: 48rem)';

/**
 * A plain primary activation of a link inside `within`: what a tap, a click or Enter on a link
 * produces. A modified or middle click opens elsewhere and leaves this page where it was, and
 * a button — the Projects toggle, New project, the form — is not a destination.
 */
const isPlainLinkActivation = (event: MouseEvent, within: HTMLElement): boolean => {
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return false;
  const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
  return link !== null && within.contains(link);
};

/**
 * §23's layout: top bar across, sidebar beside, routed workspace in the middle — and, below
 * `SHELL_NARROW_QUERY`, the same single sidebar as a modal navigation drawer behind a Menu
 * (Slice 58, docs/decisions/2026-09-phone-navigation-drawer.md).
 *
 * It owns `ShellStore` and hands the pieces down as inputs, so §19's
 * `Page → Store → Gateway` holds and the sidebar and top bar stay presentational. Whether the
 * drawer is open is this component's own UI state, not the store's (§20).
 *
 * Every focus move runs after the render that follows its state change. This app is zoneless:
 * the Menu, the `inert` attributes and the reopened create form only exist once that render has
 * happened, and a synchronous `focus()` on a still-inert or not-yet-rendered element silently
 * does nothing.
 */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [A11yModule, RouterOutlet, Sidebar, TopBar],
  providers: [ShellStore],
  styleUrl: './app-shell.scss',
  templateUrl: './app-shell.html',
})
export class AppShell {
  protected readonly store = inject(ShellStore);
  private readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);

  private readonly drawer = viewChild.required<ElementRef<HTMLElement>>('drawer');
  private readonly main = viewChild.required<ElementRef<HTMLElement>>('main');
  private readonly topBar = viewChild.required(TopBar);

  private readonly drawerOpenState = signal(false);
  /** Below `SHELL_NARROW_QUERY`. Stays `false` where there is no `matchMedia` (jsdom). */
  protected readonly narrow = signal(false);
  /** The drawer is a dialog only while narrow *and* open; at desktop width it does not exist. */
  protected readonly drawerOpen = computed(() => this.narrow() && this.drawerOpenState());

  /**
   * §19: the store decided, the page navigates. A failure has already been recorded on
   * `createError`, which the sidebar renders beside its form — and there it also reopens the
   * form and takes focus back, so an open drawer simply stays open around it.
   */
  protected async createProject(name: string): Promise<void> {
    const projectId = await this.store.createProject(name);
    if (projectId === null) return;
    await this.router.navigate(['/projects', projectId]);
    if (this.drawerOpen()) this.closeDrawerThen(() => this.main().nativeElement.focus());
  }

  constructor() {
    // The one place the persona's theme preference reaches the DOM. An effect rather than
    // a call inside load(), so the store stays ignorant of anything to do with rendering.
    effect(() => {
      const identity = this.store.identity();
      if (identity !== null) this.theme.seedFrom(identity);
    });

    void this.store.load();

    const query = globalThis.matchMedia?.(SHELL_NARROW_QUERY);
    if (query !== undefined) {
      this.narrow.set(query.matches);
      const onChange = (event: { matches: boolean }): void => this.onNarrowChange(event.matches);
      query.addEventListener('change', onChange);
      // The `MediaQueryList` outlives this component; an unremoved listener is a closure over it.
      inject(DestroyRef).onDestroy(() => query.removeEventListener('change', onChange));
    }
  }

  protected openDrawer(): void {
    this.drawerOpenState.set(true);
    // Explicitly, as `DevPanel` does: `cdkTrapFocusAutoCapture` resolves on zone stability and
    // never fires zoneless. The trap still keeps Tab inside once focus is there.
    this.afterRender(() => this.drawer().nativeElement.focus());
  }

  /** Escape, Close and the backdrop: the drawer goes and focus returns to the Menu that opened it. */
  protected dismissDrawer(): void {
    if (!this.drawerOpen()) return;
    this.closeDrawerThen(() => this.topBar().focusMenu());
  }

  /**
   * A delegated listener, so every link the sidebar renders — the recursive project tree
   * included — closes the drawer without the sidebar knowing it is in one. It closes on the
   * route already current too, where the router emits no navigation to listen for. The chosen
   * link is about to be hidden, so focus goes to the workspace it opened.
   */
  protected onDrawerClick(event: MouseEvent): void {
    if (!this.drawerOpen() || !isPlainLinkActivation(event, this.drawer().nativeElement)) return;
    this.closeDrawerThen(() => this.main().nativeElement.focus());
  }

  private closeDrawerThen(focus: () => void): void {
    this.drawerOpenState.set(false);
    this.afterRender(focus);
  }

  /**
   * A resize resets the drawer to closed either way, so no dialog state outlives the layout it
   * belonged to. What needs care is focus: whatever held it may be about to disappear.
   */
  private onNarrowChange(narrow: boolean): void {
    const drawer = this.drawer().nativeElement;
    // Read now, synchronously: after the render the element may already have been removed.
    const active = this.document.activeElement;
    const inDrawer = active !== null && drawer.contains(active);
    const onDrawerChrome = active === drawer || (active?.hasAttribute('data-shell-drawer-close') ?? false);
    this.drawerOpenState.set(false);
    this.narrow.set(narrow);
    if (narrow && inDrawer) {
      // The inline sidebar is about to become a hidden, inert drawer.
      this.afterRender(() => this.topBar().focusMenu());
    } else if (!narrow && onDrawerChrome) {
      // Close and the dialog container do not exist at desktop width; a sidebar link still does.
      this.afterRender(() => drawer.querySelector<HTMLElement>('[data-nav-item]')?.focus());
    }
  }

  private afterRender(callback: () => void): void {
    afterNextRender(callback, { injector: this.injector });
  }
}
