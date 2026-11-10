import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import type { ProjectTreeNode } from '../../core/shell/shell-store';
import { SpecimenModel, type SpecimenNode } from './specimen-model';
import { SpecimenTree, type KeyboardModel, type SpecimenActivation } from './specimen-tree';

/**
 * Slice 81 R1, option A (disposable): one expanded tree in the sidebar. Home, Calendar, Search,
 * then Projects as a group label with New project; each root has its own disclosure (L7-022).
 * The current root opens to its pages, then its workstreams to full depth, then "Pages of X…"
 * and "Add workstream"; other roots stay as the person left them.
 */
@Component({
  selector: 'app-option-a',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SpecimenTree],
  template: `<app-specimen-tree label="Workspace" [nodes]="nodes()" [keys]="keys()" [openActionId]="openActionId()"
    (toggled)="model.setExpanded($event.id, $event.expanded)" (acted)="acted.emit($event)" />`,
})
export class OptionA {
  protected readonly model = inject(SpecimenModel);
  readonly keys = input<KeyboardModel>('links');
  readonly openActionId = input<string | null>(null);
  readonly acted = output<SpecimenActivation>();

  protected readonly nodes = computed<SpecimenNode[]>(() => {
    const { before, settings } = this.model.destinationRows();
    const roots = this.model.projectsStateRows() ?? this.model.rootList().map((root) => this.rootRow(root));
    const projects: SpecimenNode = {
      id: 'group:projects',
      kind: 'group',
      label: 'Projects',
      children: [this.model.newProjectRow, ...roots],
      expanded: this.model.isExpanded('group:projects', true),
    };
    return [...before, projects, settings];
  });

  private rootRow({ project: root }: ProjectTreeNode): SpecimenNode {
    const isCurrent = this.model.currentRoot()?.id === root.id;
    const firstHasRow = this.model.home() !== 'd';
    const children = [...this.model.pageRows(root), ...this.model.workRows(root), ...(isCurrent ? this.model.rootControls(root) : [])];
    const id = `project:${root.id}`;
    return {
      id,
      kind: 'link',
      label: root.name,
      at: `/projects/${root.id}`,
      current: this.model.rootRowIsCurrent(root, firstHasRow) ? 'page' : undefined,
      muted: root.status === 'archived',
      mark: root.status === 'archived' ? 'Archived' : undefined,
      ...(children.length > 0 || this.model.rootPagesMode() === 'b' ? { children, expanded: this.model.isExpanded(id, isCurrent) } : {}),
    };
  }
}
