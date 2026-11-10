import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { SpecimenNode } from './specimen-model';

export type KeyboardModel = 'links' | 'tree';

/** The pressed row and the element to anchor a lift to. */
export interface SpecimenActivation {
  node: SpecimenNode;
  opener: HTMLElement;
}

/**
 * Slice 81's specimens (R1, disposable): one row renderer for every option, in either of Q4's
 * keyboard models. `links` is disclosure navigation: nested lists of links, a separate expand
 * button with `aria-expanded`, everything in the Tab order. `tree` is an ARIA treeview: links
 * as `treeitem`s, one Tab stop (roving `tabindex`), arrows, Home, End and type-ahead.
 */
@Component({
  selector: 'app-specimen-tree',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, RouterLink],
  templateUrl: './specimen-tree.html',
  styleUrl: './specimen-tree.scss',
})
export class SpecimenTree {
  readonly nodes = input.required<SpecimenNode[]>();
  readonly keys = input<KeyboardModel>('links');
  /** The treeview's accessible name. */
  readonly label = input('Navigation');
  /** The action row whose lift is open, for its `aria-expanded`. */
  readonly openActionId = input<string | null>(null);

  readonly toggled = output<{ id: string; expanded: boolean }>();
  readonly acted = output<SpecimenActivation>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** The roving tab stop in the tree model; `null` means the current item, else the first row. */
  private readonly activeId = signal<string | null>(null);

  protected readonly flat = computed(() => flatten(this.nodes()));
  protected readonly tabStop = computed(() => {
    const ids = this.flat().filter((node) => node.kind !== 'note').map((node) => node.id);
    const active = this.activeId();
    if (active !== null && ids.includes(active)) return active;
    return this.flat().find((node) => node.current !== undefined)?.id ?? ids[0] ?? null;
  });

  /** Node ids hold colons; an element id that `querySelector('#…')` can find does not. */
  protected domId(prefix: string, id: string): string {
    return `${prefix}-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  }

  protected indent(depth: number): number {
    // Indentation stops growing after four levels; the breadcrumb carries the full path (R3).
    return Math.min(depth, 4) - 1;
  }

  protected tabIndexOf(node: SpecimenNode): number | null {
    if (this.keys() !== 'tree') return null;
    return node.id === this.tabStop() ? 0 : -1;
  }

  protected toggle(node: SpecimenNode, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.toggled.emit({ id: node.id, expanded: !node.expanded });
  }

  protected act(node: SpecimenNode, event: Event): void {
    event.preventDefault();
    this.acted.emit({ node, opener: event.currentTarget as HTMLElement });
  }

  protected focusin(event: FocusEvent): void {
    const id = (event.target as HTMLElement).closest<HTMLElement>('[data-node-id]')?.dataset['nodeId'];
    if (id !== undefined && this.keys() === 'tree') this.activeId.set(id);
  }

  protected keydown(event: KeyboardEvent): void {
    if (this.keys() !== 'tree') return;
    const items = [...this.host.nativeElement.querySelectorAll<HTMLElement>('[role="treeitem"]')];
    const index = items.indexOf(event.target as HTMLElement);
    if (index === -1) return;
    const item = items[index]!;
    const node = this.flat().find((candidate) => candidate.id === item.dataset['nodeId']);
    const level = Number(item.getAttribute('aria-level'));
    const move = (target: HTMLElement | undefined) => {
      if (target === undefined) return;
      event.preventDefault();
      target.focus();
    };
    switch (event.key) {
      case 'ArrowDown': return move(items[index + 1]);
      case 'ArrowUp': return move(items[index - 1]);
      case 'Home': return move(items[0]);
      case 'End': return move(items[items.length - 1]);
      case 'ArrowRight':
        if (node?.children === undefined) return;
        if (!node.expanded) return this.toggle(node, event);
        return move(items[index + 1]);
      case 'ArrowLeft':
        if (node?.children !== undefined && node.expanded) return this.toggle(node, event);
        return move(items.slice(0, index).reverse().find((candidate) => Number(candidate.getAttribute('aria-level')) === level - 1));
      case 'Enter':
      case ' ':
        // A link follows itself on Enter; a row that is not a link is pressed here.
        if (item.tagName === 'A' && event.key === 'Enter') return;
        event.preventDefault();
        item.click();
        return;
      default:
        if (event.key.length === 1 && /\S/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const key = event.key.toLocaleLowerCase();
          const order = [...items.slice(index + 1), ...items.slice(0, index)];
          move(order.find((candidate) => candidate.textContent?.trim().toLocaleLowerCase().startsWith(key)));
        }
    }
  }
}

const flatten = (nodes: SpecimenNode[]): SpecimenNode[] =>
  nodes.flatMap((node) => [node, ...(node.children !== undefined && node.expanded ? flatten(node.children) : [])]);
