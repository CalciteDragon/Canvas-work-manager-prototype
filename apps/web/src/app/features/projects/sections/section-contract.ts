import type { ProjectSection, SectionConfig } from '@cwm/contracts';
import type { Failure } from '../../../shared/feedback/failure';

/**
 * What every section content component receives. It is an interface rather than a base
 * class so a section stays a plain standalone component — §31 gives the frame the chrome
 * and leaves the content component "only its feature".
 *
 * `onConfigChange` is a callback rather than an `output()` because the frame renders
 * content through `NgComponentOutlet`, which has an inputs record and no bindings input.
 * (`ViewContainerRef.createComponent({ bindings: [outputBinding(…)] })` could bind a real
 * output; rejected because it trades a declarative template for imperative component
 * creation to carry one callback.)
 *
 * The callback's identity must be **stable**. `NgComponentOutlet` applies its inputs from
 * `ngDoCheck` and calls `setInput` for every key on every change-detection pass; only
 * `setInput`'s internal `Object.is` check stops that from re-rendering the content
 * component each cycle. An arrow written inline in a template is a new identity every
 * pass, which in a zoneless app is a self-feeding loop — so the frame passes a
 * class-property arrow, and builds this record in a `computed()`.
 */
export interface SectionContentInputs extends Record<string, unknown> {
  section: ProjectSection;
  /**
   * Resolves `null` when saved, or the save's `Failure`, which the section shows on its own
   * editor: a config save never reaches the canvas-level alert (Slice 78, L4-018).
   */
  onConfigChange: (config: SectionConfig) => Promise<Failure | null>;
  onProjectDataChange: () => void;
  projectDataRevision: number;
  projectHierarchyRevision: number;
  /** A shortcut is a read-only projection of this same content component (§27). */
  readOnly: boolean;
  /** Canonical source navigation for shortcut rows; null in owners and picker previews. */
  sourceLink: { route: string[]; fragment: string } | null;
}

/** A shortcut's content is read-only (§27), so a config write from it is refused before sending. */
export const READ_ONLY_CONFIG: Failure = { sentence: 'This section is read-only here.', reason: null };

/**
 * The members a content component must declare. `SectionDefinition.component` is typed
 * against this, so a section registered without an `onConfigChange` input fails to compile
 * rather than failing at `setInput` in the browser.
 */
export interface SectionContentComponent {
  readonly section: unknown;
  readonly onConfigChange: unknown;
  readonly onProjectDataChange: unknown;
  readonly projectDataRevision: unknown;
  readonly projectHierarchyRevision: unknown;
  readonly readOnly: unknown;
  readonly sourceLink: unknown;
}
