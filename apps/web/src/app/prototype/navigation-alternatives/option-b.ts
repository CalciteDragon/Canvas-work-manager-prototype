import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { SpecimenModel, type SpecimenNode } from './specimen-model';
import { SpecimenTree, type KeyboardModel, type SpecimenActivation } from './specimen-tree';

/**
 * Slice 81 R1, option B (disposable): a focused tree that drills in. Outside a project the
 * sidebar lists destinations and roots. Inside one it shows "‹ All projects", the root's name
 * with "Pages of X…" and "Add workstream", its pages and its workstream hierarchy; other roots
 * are one level up. Going up does not navigate, so there the current root is marked as the
 * location rather than the page (a specimen call, noted in the summary).
 */
@Component({
  selector: 'app-option-b',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SpecimenTree],
  template: `<app-specimen-tree label="Workspace" [nodes]="nodes()" [keys]="keys()" [openActionId]="openActionId()"
    (toggled)="model.setExpanded($event.id, $event.expanded)" (acted)="act($event)" />`,
})
export class OptionB {
  protected readonly model = inject(SpecimenModel);
  readonly keys = input<KeyboardModel>('links');
  readonly openActionId = input<string | null>(null);
  readonly acted = output<SpecimenActivation>();

  /** Which level the drawer or sidebar shows; arriving in a project drills in. */
  private readonly level = signal<'top' | 'root'>('top');

  constructor() {
    effect(() => {
      const inProject = this.model.place().kind === 'project';
      untracked(() => this.level.set(inProject ? 'root' : 'top'));
    });
  }

  protected act(activation: SpecimenActivation): void {
    if (activation.node.action?.type === 'all-projects') this.level.set('top');
    else this.acted.emit(activation);
  }

  protected readonly nodes = computed<SpecimenNode[]>(() => {
    const root = this.model.currentRoot();
    if (this.level() === 'root' && root !== null) {
      const firstHasRow = this.model.home() !== 'd';
      return [
        { id: 'all-projects', kind: 'action', label: '‹ All projects', action: { type: 'all-projects' } },
        {
          id: `project:${root.id}`,
          kind: 'link',
          label: root.name,
          at: `/projects/${root.id}`,
          current: this.model.rootRowIsCurrent(root, firstHasRow) ? 'page' : undefined,
          muted: root.status === 'archived',
          mark: root.status === 'archived' ? 'Archived' : undefined,
        },
        ...this.model.rootControls(root),
        ...this.model.pageRows(root),
        ...this.model.workRows(root),
      ];
    }
    const { before, settings } = this.model.destinationRows();
    const roots: SpecimenNode[] =
      this.model.projectsStateRows() ??
      this.model.rootList().map(({ project }) => ({
        id: `project:${project.id}`,
        kind: 'link',
        label: project.name,
        at: `/projects/${project.id}`,
        current: root?.id === project.id ? 'location' : undefined,
        muted: project.status === 'archived',
        mark: project.status === 'archived' ? 'Archived' : undefined,
      }));
    return [
      ...before,
      { id: 'group:projects', kind: 'group', label: 'Projects', children: [this.model.newProjectRow, ...roots], expanded: this.model.isExpanded('group:projects', true) },
      settings,
    ];
  });
}
