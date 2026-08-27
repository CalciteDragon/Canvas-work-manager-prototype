import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { Project } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { shellTestProviders } from '../../gateway/testing/shell-test-providers';
import type { ProjectTreeNode } from '../shell-store';
import { Sidebar } from './sidebar';

const AT = '2026-08-01T16:00:00.000Z';

const node = (id: string, name: string, children: ProjectTreeNode[] = []): ProjectTreeNode => ({
  project: {
    id,
    workspaceId: 'workspace-demo',
    name,
    status: 'active',
    projectLayoutMode: 'flow',
    createdAt: AT,
    updatedAt: AT,
  } as unknown as Project,
  children,
});

const render = async (inputs: { projectTree?: ProjectTreeNode[]; error?: string | null } = {}) => {
  TestBed.configureTestingModule({ imports: [Sidebar], providers: shellTestProviders() });
  const fixture: ComponentFixture<Sidebar> = TestBed.createComponent(Sidebar);
  fixture.componentRef.setInput('projectTree', inputs.projectTree ?? []);
  fixture.componentRef.setInput('error', inputs.error ?? null);
  await fixture.whenStable();
  return { fixture, element: fixture.nativeElement as HTMLElement };
};

const textOf = (element: HTMLElement, selector: string) =>
  [...element.querySelectorAll(selector)].map((node) => node.textContent?.trim());

describe('Sidebar', () => {
  it('lists §23’s destinations, in §23’s order', async () => {
    const { element } = await render();

    expect(textOf(element, '[data-nav-item]')).toEqual(['Home', 'Projects', 'Calendar', 'Search', 'Settings']);
  });

  // Asserted on the rendered href, not on a `routerLink` attribute: routerLink is an input
  // and is never reflected into the DOM, so a `[routerLink]` selector would match nothing.
  it('points each destination at its §68 route', async () => {
    const { element } = await render({ projectTree: [node('project-1', 'Personal workspace')] });

    const hrefs = Object.fromEntries(
      [...element.querySelectorAll('a[data-nav-item], a[data-project]')].map((anchor) => [
        anchor.textContent?.trim(),
        anchor.getAttribute('href'),
      ]),
    );

    expect(hrefs).toMatchObject({
      Home: '/app',
      Calendar: '/calendar',
      Search: '/search',
      Settings: '/settings',
      'Personal workspace': '/projects/project-1',
    });
  });

  // §68 defines `/projects/:projectId` and no `/projects`, so the group header navigates
  // nowhere. A `<div (click)>` would satisfy "not a link" while being unreachable by
  // keyboard, which is why the tag and aria-expanded are pinned.
  it('makes Projects a keyboard-operable group header rather than a link', async () => {
    const { fixture, element } = await render({ projectTree: [node('project-1', 'Personal workspace')] });
    const header = element.querySelector<HTMLElement>('[data-projects-toggle]');

    expect(header?.tagName).toBe('BUTTON');
    expect(header?.getAttribute('href')).toBeNull();
    expect(header?.getAttribute('aria-expanded')).toBe('true');

    header?.click();
    await fixture.whenStable();
    expect(element.querySelector('[data-projects-toggle]')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('renders all three levels of the nested-projects seed inline', async () => {
    const { element } = await render({
      projectTree: [
        node('project-renovation', 'Home renovation', [
          node('project-kitchen', 'Kitchen', [node('project-cabinets', 'Cabinets')]),
          node('project-garden', 'Garden'),
        ]),
      ],
    });

    expect(textOf(element, '[data-project]')).toEqual(['Home renovation', 'Kitchen', 'Cabinets', 'Garden']);
    const cabinets = element.querySelector('[data-project-id="project-cabinets"]');
    expect(cabinets?.closest('[data-project-id="project-kitchen"]')).not.toBeNull();
  });

  it('says so when there are no projects, rather than leaving a gap', async () => {
    const { element } = await render({ projectTree: [] });

    expect(element.querySelector('[data-projects-empty]')?.textContent).toContain('No projects');
  });

  it('shows a failed load instead of spinning forever', async () => {
    const { element } = await render({ error: 'could not reach the prototype host' });

    expect(element.querySelector('[data-projects-error]')?.textContent).toContain('could not reach');
  });
});
