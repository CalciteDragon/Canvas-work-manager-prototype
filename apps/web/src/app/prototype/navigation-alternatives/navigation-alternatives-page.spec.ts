import { TestBed } from '@angular/core/testing';
import { ProjectPageSchema, ProjectSchema, type Project, type ProjectPage } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { shellTestProviders } from '../../core/gateway/testing/shell-test-providers';
import { ShellStore } from '../../core/shell/shell-store';
import { NavigationAlternativesPage } from './navigation-alternatives-page';

/**
 * Slice 81's disposable specimens (R1): one smoke case per option. The captures and the
 * measurements are step 2's Playwright rig; these only prove each option renders over real
 * shell data and marks exactly one current item in its navigation landmark.
 */
const AT = '2026-08-27T16:00:00.000Z';

const project = (id: string, name: string, parentProjectId?: string, status: Project['status'] = 'active'): Project =>
  ProjectSchema.parse({
    id,
    workspaceId: 'workspace-demo',
    ...(parentProjectId === undefined ? { kind: 'root' } : { kind: 'subproject', parentProjectId }),
    name,
    status,
    projectLayoutMode: 'flow',
    createdAt: AT,
    updatedAt: AT,
  });

const page = (projectId: string, kind: ProjectPage['kind'], enabled = true): ProjectPage =>
  ProjectPageSchema.parse({ id: `page-${projectId}-${kind}`, projectId, kind, enabled, createdAt: AT, updatedAt: AT });

const PROJECTS = [
  project('project-renovation', 'Home renovation'),
  project('project-kitchen', 'Kitchen', 'project-renovation'),
  project('project-cabinets', 'Cabinets', 'project-kitchen'),
  project('project-legacy', 'Legacy attic', 'project-renovation', 'archived'),
  project('project-launch', 'Website launch'),
];
const PAGES = [page('project-renovation', 'home'), page('project-renovation', 'todos'), page('project-renovation', 'archive', false), page('project-launch', 'home')];

const render = async (inputs: Record<string, string>) => {
  TestBed.configureTestingModule({
    imports: [NavigationAlternativesPage],
    providers: [...shellTestProviders({ projects: PROJECTS, pages: PAGES }), ShellStore],
  });
  await TestBed.inject(ShellStore).load();
  const fixture = TestBed.createComponent(NavigationAlternativesPage);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  await fixture.whenStable();
  // The current project's context loads after the first render.
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
};

const currentIn = (element: HTMLElement, selector: string) =>
  [...element.querySelectorAll(`${selector} [aria-current="page"]`)].map((node) => node.textContent?.trim());

describe('NavigationAlternativesPage (Slice 81 R1, disposable)', () => {
  it.each(['a', 'b', 'c'])('option %s renders over shell data and marks exactly one current item', async (option) => {
    const element = await render({ option, at: '/projects/project-cabinets' });

    expect(element.querySelector('[data-specimen-skip-link]')?.textContent?.trim()).toBe('Skip to content');
    expect(currentIn(element, '[data-specimen-nav]')).toEqual(['Cabinets']);
    // The breadcrumb ends at the current item, as text.
    expect(element.querySelector('[data-specimen-breadcrumb] [aria-current="page"]')?.textContent?.trim()).toBe('Cabinets');
  });

  it('option c marks the root page in its tab row and the project as the location in the tree', async () => {
    const element = await render({ option: 'c', at: '/projects/project-renovation/pages/todos' });

    expect(currentIn(element, '[data-specimen-page-tabs]')).toEqual(['Todos']);
    expect(currentIn(element, '[data-specimen-nav]')).toEqual([]);
    expect(element.querySelector('[data-specimen-nav] [aria-current="location"]')?.textContent).toContain('Home renovation');
  });

  it('the tree keyboard model is one tab stop in a treeview', async () => {
    const element = await render({ option: 'a', at: '/projects/project-kitchen', keys: 'tree' });

    const tree = element.querySelector('[data-specimen-nav] [role="tree"]')!;
    expect(tree).not.toBeNull();
    expect([...tree.querySelectorAll('[role="treeitem"][tabindex="0"]')].map((item) => item.textContent?.trim())).toEqual(['Kitchen']);
  });

  it('labels page settings and Add workstream with the root', async () => {
    const element = await render({ option: 'a', at: '/projects/project-kitchen' });

    expect(element.querySelector('[data-specimen-action="page-settings"]')?.textContent?.trim()).toBe('Pages of Home renovation…');
    const add = element.querySelector<HTMLElement>('[data-specimen-action="add-workstream"]')!;
    expect(add.textContent?.trim()).toBe('Add workstream');
    expect(element.querySelector(`#${add.getAttribute('aria-describedby')}`)?.textContent?.trim()).toBe('in Home renovation');
  });
});
