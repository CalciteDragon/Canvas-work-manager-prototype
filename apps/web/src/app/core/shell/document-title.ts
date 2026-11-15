import { Injectable, Injector, effect, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { TitleStrategy, type RouterStateSnapshot } from '@angular/router';
import { NavigationContext, type ProjectPlace } from './navigation-context';

const PRODUCT = 'Canvas Work Manager';
const SEPARATOR = ' · ';

/** What the route says the title is: a static route's own words, or the project it names. */
type RouteTitle = { readonly kind: 'static'; readonly title: string } | { readonly kind: 'project'; readonly projectId: string };

/**
 * The document title, most specific first (Slice 81, Q6 (a), L7-019):
 * "Todos · Home renovation · Canvas Work Manager".
 *
 * Static routes carry their words in the route's `title` (`app.routes.ts`). Project routes carry
 * none: the names arrive after the async load, so an effect rebuilds the title whenever the
 * `NavigationContext` publishes a `ready` place for the route's project, which also follows a live
 * rename. Until then the previous title stays, so a load draws no interim word. A root's first page
 * is named by its project alone (Q5 (d)); a workstream by itself, then its root.
 * See docs/decisions/2026-11-document-titles-and-skip-link.md.
 */
@Injectable({ providedIn: 'root' })
export class DocumentTitle extends TitleStrategy {
  private readonly title = inject(Title);
  // Read lazily: the context injects `Router`, which injects this strategy, so an eager inject is a cycle.
  private readonly injector = inject(Injector);
  private readonly route = signal<RouteTitle | null>(null);

  constructor() {
    super();
    effect(() => {
      const route = this.route();
      if (route === null) return;
      const words = route.kind === 'static' ? route.title : placeTitle(this.injector.get(NavigationContext).place(), route.projectId);
      if (words !== null) this.title.setTitle(words === '' ? PRODUCT : `${words}${SEPARATOR}${PRODUCT}`);
    });
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const title = this.buildTitle(snapshot);
    if (title !== undefined) { this.route.set({ kind: 'static', title }); return; }
    let leaf = snapshot.root;
    while (leaf.firstChild) leaf = leaf.firstChild;
    const projectId = leaf.paramMap.get('projectId');
    this.route.set(projectId === null ? { kind: 'static', title: '' } : { kind: 'project', projectId });
  }
}

function placeTitle(place: ProjectPlace | null, projectId: string): string | null {
  if (place === null || place.projectId !== projectId) return null;
  if (place.status === 'missing') return 'Project not available';
  if (place.status !== 'ready' || place.current === null || place.root === null) return null;
  if (place.current.id !== place.root.id) return [place.current.name, place.root.name].join(SEPARATOR);
  const page = place.pages.find(candidate => candidate.kind === place.currentKind);
  return page === undefined ? place.root.name : [page.label, place.root.name].join(SEPARATOR);
}
