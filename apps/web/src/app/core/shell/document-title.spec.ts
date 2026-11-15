import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter } from '@angular/router';
import type { ProjectId } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { routes } from '../../app.routes';
import { DocumentTitle } from './document-title';
import { NavigationContext, type ProjectPlace } from './navigation-context';

@Component({ template: '' })
class Blank {}

const ROOT = { id: 'project-home' as ProjectId, name: 'Home renovation', status: 'active' as const };
const KITCHEN = { id: 'project-kitchen' as ProjectId, name: 'Kitchen', status: 'active' as const };
const CABINETS = { id: 'project-cabinets' as ProjectId, name: 'Cabinets', status: 'active' as const };

const ready = (overrides: Partial<ProjectPlace> = {}): ProjectPlace => ({
  projectId: ROOT.id,
  status: 'ready',
  root: ROOT,
  ancestors: [],
  current: ROOT,
  pages: [{ kind: 'todos', label: 'Todos' }],
  currentKind: 'home',
  addBlockedReason: null,
  ...overrides,
});

const setup = async () => {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'app', component: Blank, title: 'Home' },
        { path: 'settings/agents', component: Blank, title: 'AI & Agents · Settings' },
        { path: 'projects/:projectId/pages/:pageKind', component: Blank },
        { path: 'projects/:projectId', component: Blank },
        { path: '**', component: Blank, title: 'Page not found' },
      ]),
      { provide: TitleStrategy, useExisting: DocumentTitle },
    ],
  });
  const router = TestBed.inject(Router);
  const context = TestBed.inject(NavigationContext);
  const title = () => TestBed.inject(Title).getTitle();
  const go = async (url: string) => { await router.navigateByUrl(url); TestBed.tick(); };
  const publish = (place: ProjectPlace) => { context.publish(place); TestBed.tick(); };
  return { go, publish, title };
};

describe('DocumentTitle (Slice 81, L7-019, Q6 (a))', () => {
  it('names a static route most specific first, then the product', async () => {
    const { go, title } = await setup();
    await go('/app');
    expect(title()).toBe('Home · Canvas Work Manager');
    await go('/settings/agents');
    expect(title()).toBe('AI & Agents · Settings · Canvas Work Manager');
    await go('/nowhere');
    expect(title()).toBe('Page not found · Canvas Work Manager');
  });

  it('names a root page by its page and its project once the shell publishes the loaded place', async () => {
    const { go, publish, title } = await setup();
    await go('/app');
    await go('/projects/project-home/pages/todos');
    publish({ ...ready(), status: 'loading', root: null, current: null, pages: [], currentKind: 'todos' });
    expect(title()).toBe('Home · Canvas Work Manager');
    publish(ready({ currentKind: 'todos' }));
    expect(title()).toBe('Todos · Home renovation · Canvas Work Manager');
  });

  it('names the root’s first page by the project alone (Q5 (d))', async () => {
    const { go, publish, title } = await setup();
    await go('/projects/project-home');
    publish(ready());
    expect(title()).toBe('Home renovation · Canvas Work Manager');
  });

  it('names a workstream, then its root', async () => {
    const { go, publish, title } = await setup();
    await go('/projects/project-cabinets');
    publish(ready({ projectId: CABINETS.id, ancestors: [ROOT, KITCHEN], current: CABINETS, currentKind: null }));
    expect(title()).toBe('Cabinets · Home renovation · Canvas Work Manager');
  });

  it('follows a live rename', async () => {
    const { go, publish, title } = await setup();
    await go('/projects/project-home');
    publish(ready());
    publish(ready({ root: { ...ROOT, name: 'House renovation' }, current: { ...ROOT, name: 'House renovation' } }));
    expect(title()).toBe('House renovation · Canvas Work Manager');
  });

  it('has its own title for a project that failed to load or is not available', async () => {
    const { go, publish, title } = await setup();
    await go('/projects/project-gone');
    publish({ ...ready(), projectId: 'project-gone' as ProjectId, status: 'missing', root: null, current: null, pages: [] });
    expect(title()).toBe('Project not available · Canvas Work Manager');
  });

  it('ignores a place published for another project than the route’s', async () => {
    const { go, publish, title } = await setup();
    await go('/app');
    await go('/projects/project-kitchen');
    publish(ready());
    expect(title()).toBe('Home · Canvas Work Manager');
  });

  it('leaves the project when the route does', async () => {
    const { go, publish, title } = await setup();
    await go('/projects/project-home');
    publish(ready());
    await go('/settings/agents');
    expect(title()).toBe('AI & Agents · Settings · Canvas Work Manager');
  });
});

describe('the route map’s titles', () => {
  it('gives every static route a title and the project routes none (theirs come from the place)', () => {
    const titles = Object.fromEntries(routes.filter(route => route.redirectTo === undefined).map(route => [route.path, route.title]));
    expect(titles).toEqual({
      app: 'Home',
      'projects/:projectId/pages/:pageKind': undefined,
      'projects/:projectId': undefined,
      calendar: 'Calendar',
      search: 'Search',
      settings: 'Settings',
      'settings/agents': 'AI & Agents · Settings',
      'settings/archived-projects': 'Archived projects · Settings',
      'prototype/design': 'Design Lab',
      'prototype/state': 'Prototype state',
      '**': 'Page not found',
    });
  });
});
