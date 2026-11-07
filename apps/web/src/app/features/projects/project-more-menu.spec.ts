import { TestBed } from '@angular/core/testing';
import { ProjectSchema, type Project } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { ProjectMoreMenu } from './project-more-menu';

const AT = '2026-10-16T10:00:00.000Z';
const CABINETS = { id: 'project-cabinets', workspaceId: 'workspace-demo', kind: 'subproject', parentProjectId: 'project-kitchen', name: 'Cabinets', status: 'archived', projectLayoutMode: 'flow', createdAt: AT, updatedAt: AT };
const render = (project: Project) => {
  const fixture = TestBed.createComponent(ProjectMoreMenu);
  fixture.componentRef.setInput('project', project);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
};

describe('ProjectMoreMenu on an archived project (Slice 80, R5)', () => {
  it('has no status buttons on a marked project: a control that can only be refused is absent', () => {
    const element = render(ProjectSchema.parse({ ...CABINETS, archivedWithProject: { projectId: 'project-kitchen', status: 'active' } }));

    expect(element.querySelector('[data-project-status-option]')).toBeNull();
    expect(element.querySelector('[data-project-edit-details]')).not.toBeNull();
    expect(element.querySelector('[data-project-open-archive]')).not.toBeNull();
  });

  it('keeps them on an unmarked archived project', () => {
    const element = render(ProjectSchema.parse(CABINETS));

    expect(element.querySelectorAll('[data-project-status-option]')).toHaveLength(4);
  });
});
