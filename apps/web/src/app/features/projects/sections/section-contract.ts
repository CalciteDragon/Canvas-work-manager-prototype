import type { ProjectSection, SectionConfig } from '@cwm/contracts';

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
  onConfigChange: (config: SectionConfig) => void;
}

/** The shape a content component must accept. Enforced structurally by the registry. */
export interface SectionContentComponent {
  readonly section: unknown;
  readonly onConfigChange: unknown;
}
