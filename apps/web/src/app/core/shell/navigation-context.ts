import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import type { ProjectId, ProjectPageKind, ProjectStatus } from '@cwm/contracts';

/** A project on the current place's path, as the navigation tree draws it: plain view data. */
export interface PlaceProject {
  readonly id: ProjectId;
  readonly name: string;
  readonly status: ProjectStatus;
}

/** One of the root's enabled pages that this build can draw (§23, Slice 74's Archive while current). */
export interface PlacePage {
  readonly kind: ProjectPageKind;
  readonly label: string;
}

/**
 * Where the person is inside a project, as the routed project shell knows it (Slice 81, R2). The
 * shell owns the project's state (§20); this is the copy the global navigation tree reads.
 *
 * - `loading`: the route names `projectId` and its load has not answered. The context keeps the
 *   previous place's rows, so a move between the two project route configs draws no empty frame.
 * - `ready`: everything below is the loaded project's.
 * - `missing`: a failed or not-found load. No root, no pages, nothing current.
 */
export interface ProjectPlace {
  /** The project the route names, known before its load answers. */
  readonly projectId: ProjectId;
  readonly status: 'loading' | 'ready' | 'missing';
  readonly root: PlaceProject | null;
  /** Root first, immediate parent last; empty on a root. */
  readonly ancestors: readonly PlaceProject[];
  /** The routed project once loaded; it may be archived, or hidden under an archived ancestor (Q11). */
  readonly current: PlaceProject | null;
  /** The root's enabled, renderable pages, without the first page, which the root's own row opens (Q5 (d)). */
  readonly pages: readonly PlacePage[];
  /** The page kind the route shows; `null` on a workstream, or while unknown. */
  readonly currentKind: ProjectPageKind | null;
  /** Why Add workstream is unavailable here (an archived root), or `null`. */
  readonly addBlockedReason: string | null;
}

/** What a tree trigger hands a handler (R2): the anchor for a lift, and where focus returns. */
export interface ProjectPlaceRequest {
  /** The menu's button at desktop width; `null` from the phone drawer, which is closed first. */
  readonly source: HTMLElement | null;
  readonly returnFocus: HTMLElement;
}

/** The project shell's commands for the tree's triggers. Handlers, not signals: nothing replays. */
export interface ProjectPlaceHandlers {
  openPageSettings(request: ProjectPlaceRequest): void;
  openAddWorkstream(request: ProjectPlaceRequest): void;
}

/**
 * Slice 81's one navigation tree reads the project place from here (R2,
 * docs/decisions/2026-11-navigation-reads-project-place-from-a-context.md). Root-provided because
 * the tree is on every route; it holds plain view data only, makes no gateway calls and knows
 * nothing about features. `ProjectWorkspaceShell` publishes and registers; `AppShell` reads.
 *
 * **Keyed, not cleared.** `/projects/:id` and `/projects/:id/pages/:kind` are two route configs,
 * so moving between them re-creates the publishing shell. The place is replaced when the new one
 * publishes and cleared only by a `NavigationEnd` outside `/projects/`.
 */
@Injectable({ providedIn: 'root' })
export class NavigationContext {
  private readonly placeState = signal<ProjectPlace | null>(null);
  private readonly handlersState = signal<ProjectPlaceHandlers | null>(null);

  readonly place = this.placeState.asReadonly();
  /** A project shell is listening; with none, the tree draws no project triggers. */
  readonly hasHandlers = computed(() => this.handlersState() !== null);

  constructor() {
    inject(Router)
      .events.pipe(takeUntilDestroyed())
      .subscribe((event) => {
        if (event instanceof NavigationEnd && !event.urlAfterRedirects.startsWith('/projects/')) this.placeState.set(null);
      });
  }

  /**
   * The shell's place. A `loading` place keeps the previous place's rows (its root, pages and
   * path) and takes only what the route already says, so the tree keeps drawing while the load runs.
   */
  publish(place: ProjectPlace): void {
    const previous = this.placeState();
    if (place.status === 'loading' && previous !== null && previous.root !== null) {
      this.placeState.set({ ...previous, projectId: place.projectId, status: 'loading', currentKind: place.currentKind });
      return;
    }
    this.placeState.set(place);
  }

  /**
   * Registers the shell's handlers and returns the disposer for its destroy. A disposer removes
   * only its own handlers: a re-created shell registers before the old one is destroyed.
   */
  register(handlers: ProjectPlaceHandlers): () => void {
    this.handlersState.set(handlers);
    return () => {
      if (this.handlersState() === handlers) this.handlersState.set(null);
    };
  }

  /** Calls the current shell's handler; `false` when no shell is listening. */
  openPageSettings(request: ProjectPlaceRequest): boolean {
    const handlers = this.handlersState();
    handlers?.openPageSettings(request);
    return handlers !== null;
  }

  /** Calls the current shell's handler; `false` when no shell is listening. */
  openAddWorkstream(request: ProjectPlaceRequest): boolean {
    const handlers = this.handlersState();
    handlers?.openAddWorkstream(request);
    return handlers !== null;
  }
}
