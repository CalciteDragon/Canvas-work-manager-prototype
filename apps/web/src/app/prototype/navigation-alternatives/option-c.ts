import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SpecimenModel, type SpecimenNode } from './specimen-model';
import { SpecimenTree, type KeyboardModel, type SpecimenActivation } from './specimen-tree';

/**
 * Slice 81 R1, option C (disposable): work in the tree, pages in the header. The tree holds
 * roots and workstreams only; on a root page it marks the project `aria-current="location"`,
 * because the page itself is current in the header's tab row (`OptionCTabs`). C amends the
 * decision three times (R1).
 */
@Component({
  selector: 'app-option-c',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SpecimenTree],
  template: `<app-specimen-tree label="Workspace" [nodes]="nodes()" [keys]="keys()" [openActionId]="openActionId()"
    (toggled)="model.setExpanded($event.id, $event.expanded)" (acted)="acted.emit($event)" />`,
})
export class OptionC {
  protected readonly model = inject(SpecimenModel);
  readonly keys = input<KeyboardModel>('links');
  readonly openActionId = input<string | null>(null);
  readonly acted = output<SpecimenActivation>();

  protected readonly nodes = computed<SpecimenNode[]>(() => {
    const { before, settings } = this.model.destinationRows();
    const current = this.model.currentRoot();
    const onRootPage = this.model.currentPageKind() !== null;
    const roots: SpecimenNode[] =
      this.model.projectsStateRows() ??
      this.model.rootList().map(({ project: root }) => {
        const isCurrent = current?.id === root.id;
        const children = [...this.model.workRows(root), ...(isCurrent ? this.model.rootControls(root).filter((row) => row.action?.type === 'add-workstream') : [])];
        const id = `project:${root.id}`;
        return {
          id,
          kind: 'link',
          label: root.name,
          at: `/projects/${root.id}`,
          current: isCurrent && onRootPage ? 'location' : undefined,
          muted: root.status === 'archived',
          mark: root.status === 'archived' ? 'Archived' : undefined,
          ...(children.length > 0 ? { children, expanded: this.model.isExpanded(id, isCurrent) } : {}),
        };
      });
    return [
      ...before,
      { id: 'group:projects', kind: 'group', label: 'Projects', children: [this.model.newProjectRow, ...roots], expanded: this.model.isExpanded('group:projects', true) },
      settings,
    ];
  });
}

/** Option C's tab row in the project header: the root's pages, then "Pages of X…". */
@Component({
  selector: 'app-option-c-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    @if (model.currentRoot(); as root) {
      <nav class="option-c-tabs" data-specimen-page-tabs [attr.aria-label]="root.name + ' pages'">
        <ul class="option-c-tabs__list">
          @for (tab of tabs(); track tab.id) {
            <li>
              @if (tab.kind === 'link') {
                <a class="option-c-tabs__tab" [class.option-c-tabs__tab--current]="tab.current" [routerLink]="[]" [queryParams]="{ at: tab.at }"
                  queryParamsHandling="merge" [attr.aria-current]="tab.current ?? null">{{ tab.label }}</a>
              } @else {
                <span class="option-c-tabs__note">{{ tab.label }}</span>
              }
            </li>
          }
          <li>
            <button type="button" class="button button--ghost option-c-tabs__settings" data-specimen-action="page-settings"
              [attr.aria-expanded]="openActionId() === settingsRow().id" (click)="open($event)">{{ settingsRow().label }}</button>
          </li>
        </ul>
      </nav>
    }
  `,
  styles: `
    .option-c-tabs__list { display: flex; flex-wrap: wrap; gap: var(--space-1); margin: 0; padding: 0; list-style: none; }
    .option-c-tabs__tab { display: inline-flex; align-items: center; padding: var(--space-1) var(--space-3); border-block-end: var(--border-focus) solid transparent; color: var(--color-text-muted); text-decoration: none; }
    .option-c-tabs__tab--current { border-block-end-color: var(--color-accent); color: var(--color-text); font-weight: var(--font-weight-semibold); }
    .option-c-tabs__note { padding: var(--space-1) var(--space-3); color: var(--color-text-muted); }
    @media (forced-colors: active) { .option-c-tabs__tab--current { border-block-end-color: Highlight; } }
    @media (hover: none), (any-pointer: coarse) { .option-c-tabs__tab, .option-c-tabs__settings { min-height: var(--size-hit-target); } }
  `,
})
export class OptionCTabs {
  protected readonly model = inject(SpecimenModel);
  readonly openActionId = input<string | null>(null);
  readonly acted = output<SpecimenActivation>();

  protected readonly tabs = computed<SpecimenNode[]>(() => {
    const root = this.model.currentRoot();
    return root === null ? [] : this.model.pageRows(root, { includeFirst: true });
  });

  protected readonly settingsRow = computed(() => this.model.rootControls(this.model.currentRoot()!)[0]!);

  protected open(event: MouseEvent): void {
    this.acted.emit({ node: this.settingsRow(), opener: event.currentTarget as HTMLElement });
  }
}
