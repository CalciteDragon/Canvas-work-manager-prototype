import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, inject, input, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router } from '@angular/router';
import type { ProjectPage } from '@cwm/contracts';
import type { ProjectPlaceRequest } from '../../core/shell/navigation-context';
import { Icon } from '../../shared/components/icon/icon';
import { FailureMessage } from '../../shared/feedback/failure-message';
import type { Failure } from '../../shared/feedback/failure';
import { LiftFocus } from '../../shared/lifts/lift-focus';
import { LiftStack } from '../../shared/lifts/lift-stack';
import { OPTIONAL_PROJECT_PAGE_DEFINITIONS, type OptionalProjectPageKind } from './project-page-registry';

let nextId = 0;

/**
 * A root's page settings (§23, Slice 74), opened by a handler rather than an invoker (Slice 81,
 * R2): the navigation tree's pencil menu or the header's More asks `ProjectWorkspaceShell`, which
 * renders this in a deferred block. It opens itself once rendered with `showPopover({ source })`,
 * the menu's button as `source`, and `position-anchor: auto` so it sits under that button; from
 * the phone drawer there is no source and it is a sheet at the top of the viewport.
 *
 * The page writes stay non-optimistic, as the column's gear was: a checkbox shows the confirmed
 * state until the context read changes `pages`. Escape and a navigation return focus to the
 * request's `returnFocus`; a light dismiss leaves focus where the person put it. Every way of
 * closing reports `closed` once, and the shell then removes this component.
 */
@Component({
  selector: 'app-page-settings-popover',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, FailureMessage],
  templateUrl: './page-settings-popover.html',
  styleUrl: './page-settings-popover.scss',
})
export class PageSettingsPopover {
  /** The menu's button, or `null` from the phone drawer, and where focus returns. */
  readonly request = input.required<ProjectPlaceRequest>();
  /** Every root page, including disabled records: the controls need both states. */
  readonly pages = input.required<readonly ProjectPage[]>();
  readonly pageWritePending = input(false);
  readonly pageWriteError = input<Failure | null>(null);
  readonly pageWriteRetryKind = input<OptionalProjectPageKind | null>(null);
  readonly pageToggleRequested = output<{ kind: OptionalProjectPageKind; enabled: boolean }>();
  readonly retryPageRequested = output<void>();
  /** Escape, a light dismiss, another lift or a navigation closed it. Sent once. */
  readonly closed = output<void>();

  protected readonly titleId = `page-settings-title-${++nextId}`;
  protected readonly optionalPageDefinitions = OPTIONAL_PROJECT_PAGE_DEFINITIONS;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private release: (() => void) | null = null;
  private done = false;

  constructor() {
    const lifts = inject(LiftStack);
    afterNextRender(() => {
      this.release = lifts.open(() => this.close(false));
      const panel = this.panel();
      const source = this.request().source;
      if (source === null) panel.showPopover?.();
      else panel.showPopover?.({ source });
      panel.querySelector<HTMLElement>('input:not(:disabled)')?.focus();
    });
    inject(DestroyRef).onDestroy(() => this.release?.());
    inject(Router).events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationStart) this.close(true);
    });
  }

  protected toggled(event: Event): void {
    if ((event as ToggleEvent).newState === 'closed') this.finish();
  }

  protected keydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    this.close(true);
  }

  private close(restore: boolean): void {
    if (this.done) return;
    const panel = this.panel();
    if (restore) new LiftFocus(this.request().returnFocus, () => document.querySelector<HTMLElement>('main')).restore(panel);
    panel.hidePopover?.();
    this.finish();
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.release?.(); this.release = null;
    this.closed.emit();
  }

  protected pageEnabled(kind: OptionalProjectPageKind): boolean {
    // A failed native click leaves `pages` unchanged; reading the write state re-checks the view
    // when the write settles, so Angular reapplies the confirmed `checked` value.
    this.pageWritePending();
    this.pageWriteError();
    this.pageWriteRetryKind();
    return this.pages().some((page) => page.kind === kind && page.enabled);
  }

  protected requestPageToggle(kind: OptionalProjectPageKind, event: Event): void {
    const control = event.target as HTMLInputElement;
    if (!this.pageWritePending()) this.pageToggleRequested.emit({ kind, enabled: control.checked });
    // Non-optimistic: back to the confirmed value until the context read repaints it.
    control.checked = this.pageEnabled(kind);
  }

  private panel = (): HTMLElement => this.host.querySelector('[data-project-page-manager]')!;
}
