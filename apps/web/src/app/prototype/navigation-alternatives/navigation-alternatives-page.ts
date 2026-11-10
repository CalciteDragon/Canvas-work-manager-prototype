import { CdkTrapFocus } from '@angular/cdk/a11y';
import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
  ElementRef,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { SHELL_NARROW_QUERY } from '../../core/shell/app-shell';
import { PROJECT_PAGE_REGISTRY, pageDefinitionFor } from '../../features/projects/project-page-registry';
import { OptionA } from './option-a';
import { OptionB } from './option-b';
import { OptionC, OptionCTabs } from './option-c';
import { DESTINATION_LABELS, SpecimenModel, type HomeNaming, type RootPagesMode, type SpecimenAction } from './specimen-model';
import type { KeyboardModel, SpecimenActivation } from './specimen-tree';

interface Crumb { label: string; at?: string; }
interface LiftContent { title: string; lines: string[]; pages?: { label: string; enabled: boolean; fixed: boolean }[]; }

/**
 * Slice 81's alternatives specimens (R1, Gate 1 style). **Disposable prototype tooling: the
 * route, this folder and its doc lines are deleted at step 3.**
 *
 * `/prototype/navigation/:option` (`a`, `b`, `c`) with `at=<app URL>` (the place shown),
 * `keys=links|tree` (Q4), `home=a|b|c|d` (Q5; default d), `q16=a|b|c` (a non-current root; default
 * b) and `menu=open` (the phone drawer starts open, for captures).
 *
 * `App` always wraps routes in `AppShell`, so the specimen is a fixed, full-viewport layer and
 * sets `inert` on the shell's own top bar and sidebar while mounted, so Tab counts and phone
 * captures measure only the specimen. Lifts open with `showPopover({ source })`, R2's probe:
 * in Chromium 151 `source` sets the implicit anchor (used once the lift says
 * `position-anchor: auto`) but does **not** exempt the opener from light dismiss, so a pointer
 * press on an open lift's opener is remembered here and its click does not reopen it.
 */
@Component({
  selector: 'app-navigation-alternatives-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkTrapFocus, NgTemplateOutlet, RouterLink, OptionA, OptionB, OptionC, OptionCTabs],
  providers: [SpecimenModel],
  templateUrl: './navigation-alternatives-page.html',
  styleUrl: './navigation-alternatives-page.scss',
})
export class NavigationAlternativesPage {
  readonly option = input<string>('a');
  readonly at = input<string | undefined>(undefined);
  readonly keys = input<string | undefined>(undefined);
  readonly home = input<string | undefined>(undefined);
  readonly q16 = input<string | undefined>(undefined);
  readonly menu = input<string | undefined>(undefined);

  protected readonly model = inject(SpecimenModel);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);

  protected readonly optionId = computed(() => (['a', 'b', 'c'].includes(this.option()) ? this.option() : 'a'));
  protected readonly keyModel = computed<KeyboardModel>(() => (this.keys() === 'tree' ? 'tree' : 'links'));
  protected readonly narrow = signal(false);
  protected readonly drawerOpen = signal(false);
  protected readonly detailsOpen = signal(false);
  protected readonly liftFor = signal<string | null>(null);
  protected readonly liftSheet = signal(false);
  protected readonly liftContent = signal<LiftContent>({ title: '', lines: [] });
  private liftReturn: HTMLElement | null = null;
  /** The opener under a pointer press that light-dismissed its own lift (see the class comment). */
  private pressedOpenFor: string | null = null;

  private readonly liftElement = viewChild.required<ElementRef<HTMLElement>>('lift');
  private readonly mainElement = viewChild.required<ElementRef<HTMLElement>>('main');
  private readonly menuButton = viewChild<ElementRef<HTMLElement>>('menuButton');

  protected readonly crumbs = computed<Crumb[]>(() => {
    const place = this.model.place();
    if (place.kind === 'destination' && place.id.startsWith('settings/')) {
      return [{ label: 'Settings', at: '/settings' }, { label: DESTINATION_LABELS[place.id] }];
    }
    const context = this.model.context();
    if (place.kind !== 'project' || context === null) return [];
    const kind = this.model.currentPageKind();
    if (kind === 'home') return [];
    if (kind !== null) return [{ label: context.root.name, at: `/projects/${context.root.id}` }, { label: pageDefinitionFor(kind)?.label ?? kind }];
    return [...context.ancestors.map((project) => ({ label: project.name, at: `/projects/${project.id}` })), { label: context.project.name }];
  });

  /** Q6 (i): the `h1` names the current item. */
  protected readonly heading = computed(() => {
    const place = this.model.place();
    if (place.kind === 'destination') return place.id === 'app' ? this.model.dashboardLabel() : DESTINATION_LABELS[place.id];
    if (place.kind === 'unknown') return 'Page not found';
    if (this.model.contextFailed()) return 'This project isn’t available';
    const context = this.model.context();
    if (context === null) return 'Loading project…';
    const kind = this.model.currentPageKind();
    return kind !== null && kind !== 'home' ? (pageDefinitionFor(kind)?.label ?? kind) : context.project.name;
  });

  constructor() {
    effect(() => {
      this.model.at.set(this.at() ?? '/app');
      this.model.home.set((['a', 'b', 'c', 'd'].includes(this.home() ?? '') ? this.home() : 'd') as HomeNaming);
      this.model.rootPagesMode.set((['a', 'b', 'c'].includes(this.q16() ?? '') ? this.q16() : 'b') as RootPagesMode);
    });

    const query = globalThis.matchMedia?.(SHELL_NARROW_QUERY);
    if (query !== undefined) {
      this.narrow.set(query.matches);
      const listener = (event: MediaQueryListEvent) => {
        this.narrow.set(event.matches);
        if (!event.matches) this.drawerOpen.set(false);
      };
      query.addEventListener('change', listener);
      inject(DestroyRef).onDestroy(() => query.removeEventListener('change', listener));
    }
    afterNextRender(() => { if (this.menu() === 'open' && this.narrow()) this.openDrawer(); });

    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const press = (event: Event) => this.pointerdown(event);
    host.addEventListener('pointerdown', press, { capture: true });
    inject(DestroyRef).onDestroy(() => host.removeEventListener('pointerdown', press, { capture: true }));

    // The shell's own chrome stays out of the Tab order and the captures while mounted.
    const chrome = ['app-shell app-top-bar', 'app-shell .side'].map((selector) => this.document.querySelector(selector)).filter((node) => node !== null);
    for (const node of chrome) node.setAttribute('inert', '');
    inject(DestroyRef).onDestroy(() => { for (const node of chrome) node.removeAttribute('inert'); });
  }

  protected openDrawer(): void {
    this.drawerOpen.set(true);
    afterNextRender(() => this.document.querySelector<HTMLElement>('[data-specimen-drawer-close]')?.focus(), { injector: this.injector });
  }

  protected closeDrawer(returnFocus = true): void {
    this.drawerOpen.set(false);
    if (returnFocus) afterNextRender(() => this.menuButton()?.nativeElement.focus(), { injector: this.injector });
  }

  /** A chosen link closes the drawer and hands focus to the content, as the shell's drawer does. */
  protected navClick(event: MouseEvent): void {
    if (!this.drawerOpen() || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (!(event.target instanceof Element) || event.target.closest('a[href]') === null) return;
    this.drawerOpen.set(false);
    afterNextRender(() => this.mainElement().nativeElement.focus(), { injector: this.injector });
  }

  protected skip(event: Event): void {
    event.preventDefault();
    this.mainElement().nativeElement.focus();
  }

  /** Capture phase, before the browser's light dismiss closes the lift on this press. */
  private pointerdown(event: Event): void {
    const id = (event.target as Element | null)?.closest<HTMLElement>('[data-node-id], [data-specimen-action]');
    const open = this.liftElement().nativeElement.matches(':popover-open');
    const nodeId = id?.dataset['nodeId'] ?? (id?.dataset['specimenAction'] === 'page-settings' ? this.liftFor() : null);
    this.pressedOpenFor = open && nodeId !== null && nodeId === this.liftFor() ? nodeId : null;
  }

  protected act({ node, opener }: SpecimenActivation): void {
    const action = node.action;
    if (action === undefined) return;
    if (this.pressedOpenFor === node.id) {
      this.pressedOpenFor = null;
      return;
    }
    if (action.type === 'retry-pages') return this.model.ensureRootPages(action.rootId);
    if (action.type === 'retry-projects') return void this.model.shell?.load();
    if (action.type === 'all-projects') return;
    const element = this.liftElement().nativeElement;
    if (element.matches(':popover-open')) {
      const same = this.liftFor() === node.id;
      element.hidePopover();
      if (same) return;
    }
    this.liftContent.set(this.contentFor(action));
    this.liftFor.set(node.id);
    if (this.drawerOpen()) {
      // From the drawer: close it first, return focus to Menu, open with no `source` as a sheet.
      this.liftReturn = this.menuButton()?.nativeElement ?? null;
      this.liftSheet.set(true);
      this.drawerOpen.set(false);
      afterNextRender(() => element.showPopover?.(), { injector: this.injector });
    } else {
      this.liftReturn = opener;
      this.liftSheet.set(false);
      element.showPopover?.({ source: opener });
    }
  }

  protected liftToggled(event: Event): void {
    if ((event as ToggleEvent).newState !== 'closed') {
      afterNextRender(() => this.liftElement().nativeElement.querySelector<HTMLElement>('[data-specimen-lift-close]')?.focus(), { injector: this.injector });
      return;
    }
    this.liftFor.set(null);
    const active = this.document.activeElement;
    if (active === null || active === this.document.body || this.liftElement().nativeElement.contains(active)) this.liftReturn?.focus();
  }

  protected closeLift(): void {
    this.liftElement().nativeElement.hidePopover?.();
  }

  private contentFor(action: Exclude<SpecimenAction, { type: 'retry-pages' | 'retry-projects' | 'all-projects' }>): LiftContent {
    switch (action.type) {
      case 'page-settings': {
        const context = this.model.context();
        const pages = context?.root.id === action.rootId ? context.rootPages : [];
        return {
          title: `Pages of ${action.rootName}`,
          lines: ['Choose which optional views appear in this project. (Specimen: nothing is saved.)'],
          pages: PROJECT_PAGE_REGISTRY.map((definition) => ({
            label: definition.kind === 'home' ? this.model.firstPageLabel() : definition.label,
            enabled: definition.kind === 'home' || pages.some((page) => page.kind === definition.kind && page.enabled),
            fixed: definition.kind === 'home',
          })),
        };
      }
      case 'add-workstream':
        return { title: 'Add workstream', lines: [`In ${action.rootName}. Parent: ${action.parentName}.`, 'The real dialog opens here.'] };
      case 'new-project':
        return { title: 'New project', lines: ['The real form opens here.'] };
    }
  }
}
