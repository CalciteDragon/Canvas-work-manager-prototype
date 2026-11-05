import { DestroyRef, Injectable, inject } from '@angular/core';
import { LIVE_UPDATES } from '../../../../core/live/live-updates';

/** An unsaved Markdown draft and the saved source it started from (`base`, §30's "changed elsewhere"). */
export interface MarkdownDraft {
  readonly draft: string;
  readonly base: string;
}

/**
 * Slice 79 (L3-012): the Markdown drafts a Cancel or a navigation left behind, by section id,
 * for the app session only. In memory, so a reload, a reseed or a persona switch (each a
 * `location.reload()`) forgets them; `prototype.reloaded` clears them too, since seed section
 * ids are fixed and a draft would otherwise come back over fresh data. Holds strings only.
 */
@Injectable({ providedIn: 'root' })
export class MarkdownDraftStore {
  private readonly drafts = new Map<string, MarkdownDraft>();
  private era = 0;

  constructor() {
    const unsubscribe = inject(LIVE_UPDATES).subscribe((event) => {
      if (event.type === 'prototype.reloaded') { this.drafts.clear(); this.era += 1; }
    });
    inject(DestroyRef).onDestroy(unsubscribe);
  }

  /** Changes on each `prototype.reloaded`; an editor records it when it opens. */
  get generation(): number { return this.era; }

  /**
   * Keeps a draft, unless the data was reloaded since its editor opened (`generation`): a reseed
   * elsewhere clears the store before the canvas unmounts, and that editor's draft is old data.
   */
  keep(sectionId: string, draft: MarkdownDraft, generation = this.era): void {
    if (generation === this.era) this.drafts.set(sectionId, draft);
  }

  /** Hands the kept draft to the editor that reopens it; the store holds it only while no editor does. */
  take(sectionId: string): MarkdownDraft | null {
    const draft = this.drafts.get(sectionId) ?? null;
    this.drafts.delete(sectionId);
    return draft;
  }

  forget(sectionId: string): void { this.drafts.delete(sectionId); }
}
