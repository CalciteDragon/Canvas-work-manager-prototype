import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, inject, input, output, signal, type OutputEmitterRef } from '@angular/core';
import { Icon } from '../../../shared/components/icon/icon';
import { menuKeys } from '../../../shared/lifts/menu-keys';

let nextId = 0;

/**
 * The navigation tree's pencil (Slice 81, decision 3): an icon button named "Edit project" and its
 * small `popover="auto"` menu, "Pages of <root>…" and "Add workstream". Presentational: an item
 * closes the menu, returns focus to the pencil and emits the pencil, which the handler uses as the
 * lift's anchor and focus return (R2). The same two items are also in the header's More.
 *
 * Its tooltip is the sidebar's (`data-tooltip`, see `Sidebar`). It needs no `LiftStack`: it holds
 * no draft, and as a `popover="auto"` it already closes every other auto popover, and they it.
 *
 * The menu **stops Escape's propagation**: `menuKeys` only prevents its default, and the phone
 * drawer closes on any Escape that reaches it, so inside the drawer Escape closes only this menu.
 */
@Component({
  selector: 'app-edit-project-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  templateUrl: './edit-project-menu.html',
})
export class EditProjectMenu {
  /** The root the two actions belong to, named in "Pages of <root>…" and Add's description. */
  readonly rootName = input.required<string>();
  /** Why Add workstream is unavailable (an archived root); it stays focusable with this reason. */
  readonly addBlockedReason = input<string | null>(null);

  readonly pageSettingsRequested = output<HTMLElement>();
  readonly addWorkstreamRequested = output<HTMLElement>();

  protected readonly menuId = `edit-project-menu-${++nextId}`;
  protected readonly open = signal(false);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);

  protected toggled(event: Event): void {
    this.open.set((event as ToggleEvent).newState === 'open');
    if (this.open()) this.afterRender(() => this.open() && this.items()[0]?.focus());
    else this.restoreFocus();
  }

  protected keydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') event.stopPropagation();
    menuKeys(event, this.items(), () => this.close());
  }

  /**
   * An item: the menu closes and focus is back on the pencil, where a lift the item opens anchors;
   * the request goes after that render, so a handler never sees the menu open.
   */
  protected choose(request: OutputEmitterRef<HTMLElement>, blocked = false): void {
    if (blocked) return;
    this.close();
    this.afterRender(() => request.emit(this.pencil()));
  }

  private close(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.menu().hidePopover();
    this.restoreFocus();
  }

  /** Back to the pencil, unless a light dismiss already sent focus somewhere the person chose. */
  private restoreFocus(): void {
    const active = document.activeElement;
    if (active !== null && active !== document.body && !this.menu().contains(active)) return;
    // Its tooltip stays down, so the next Escape reaches the drawer, not the tooltip.
    this.pencil().setAttribute('data-tooltip-hidden', '');
    this.pencil().focus();
  }

  private afterRender(callback: () => void): void {
    afterNextRender(callback, { injector: this.injector });
  }

  private pencil = (): HTMLElement => this.host.querySelector('[data-edit-project]')!;
  private menu = (): HTMLElement => this.host.querySelector('[data-edit-project-menu]')!;
  private items = (): HTMLElement[] => [...this.menu().querySelectorAll<HTMLElement>('[role="menuitem"]')];
}
