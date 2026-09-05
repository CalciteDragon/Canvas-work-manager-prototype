import { SCHEMA_VERSION, type PrototypeDocument } from '@cwm/contracts';
import { validateDocumentIntegrity } from '@cwm/repositories';

/**
 * The one-off version-2 → version-3 converter (§14, §26–27).
 *
 * Version 3 splits projects into roots and sub-projects and gives every project a page that
 * owns its sections. Version 2 had neither, so a real `.prototype/data.json` cannot simply be
 * re-parsed — and by this point a real file is worth keeping, which is the whole reason this
 * exists rather than a reset.
 *
 * **It is a converter, not a migration runner.** One version to one version, called
 * explicitly, registered nowhere. The next cutover writes its own or resets; a framework for
 * a chain of one is not a thing this prototype should own (§71, §80).
 *
 * The v2 shape is read as plain data rather than re-declared as a Zod schema. Re-declaring it
 * would put a second definition of every entity in the repository (§11) to describe a shape
 * nothing writes any more. Only the *output* is validated — which is the direction that
 * matters, because the output is what gets written to disk.
 */

/** What version 2 called a project. Only the fields the conversion reads are named. */
interface LegacyProject {
  id: string;
  parentProjectId?: string;
  [key: string]: unknown;
}

interface LegacySection {
  id: string;
  projectId: string;
  [key: string]: unknown;
}

interface LegacyDocument {
  schemaVersion: number;
  projects: LegacyProject[];
  sections: LegacySection[];
  [key: string]: unknown;
}

/** The version this converter reads. */
const SOURCE_VERSION = 2;

/**
 * Derived from the project id rather than generated, so running the converter twice over the
 * same input produces the same document — which is what makes a re-run safe to attempt after
 * a half-finished one.
 */
const canonicalPageId = (projectId: string): string => `page-${projectId}`;

const asLegacyDocument = (input: unknown): LegacyDocument => {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new TypeError('input is not a prototype document');
  }
  const candidate = input as Partial<LegacyDocument>;
  if (typeof candidate.schemaVersion !== 'number') {
    throw new TypeError('input is not a prototype document: it has no schemaVersion');
  }
  if (!Array.isArray(candidate.projects) || !Array.isArray(candidate.sections)) {
    throw new TypeError('input is not a prototype document: projects and sections are required');
  }
  return candidate as LegacyDocument;
};

export interface UpgradeResult {
  document: PrototypeDocument;
  /** False when the input was already at the current version — the no-op case. */
  changed: boolean;
}

export const upgradeProjectPages = (input: unknown): UpgradeResult => {
  const legacy = asLegacyDocument(input);

  // Already converted: validated rather than trusted, so a corrupt v3 file is still caught,
  // but returned untouched. Re-running the converter is a safe thing to do.
  if (legacy.schemaVersion === SCHEMA_VERSION) {
    return { document: validateDocumentIntegrity(legacy), changed: false };
  }

  if (legacy.schemaVersion !== SOURCE_VERSION) {
    throw new RangeError(
      `cannot convert schema version ${legacy.schemaVersion}: this converter reads version ${SOURCE_VERSION} and writes version ${SCHEMA_VERSION}`,
    );
  }

  // A timestamp has to come from somewhere for records that did not exist before. The owning
  // project's own timestamps are the honest answer: its canvas is exactly as old as it is.
  const projects = legacy.projects.map((project): LegacyProject & { kind: 'root' | 'subproject' } => ({
    ...project,
    // A parent is what made something nested in version 2, and it is what makes something a
    // unit of work in version 3 — so the split needs no guessing and loses nothing.
    kind: project.parentProjectId === undefined ? 'root' : 'subproject',
  }));

  const projectPages = projects.map((project) => ({
    id: canonicalPageId(project.id),
    projectId: project.id,
    kind: project.kind === 'root' ? 'home' : 'work',
    enabled: true,
    createdAt: project['createdAt'],
    updatedAt: project['updatedAt'],
  }));

  // Every version-2 section belonged to a project and a project had one canvas, so every
  // section lands on that project's new canonical page. Nothing else about it changes.
  const sections = legacy.sections.map((section) => ({ ...section, pageId: canonicalPageId(section.projectId) }));

  const converted = {
    ...legacy,
    schemaVersion: SCHEMA_VERSION,
    projects,
    projectPages,
    sections,
    // Reserved empty by the cutover, so Slice 25.4's shortcut operations need no second
    // destructive load break.
    sectionShortcuts: [],
  };

  // **Before anything is written.** A conversion that produced an unloadable document and
  // saved it anyway would have destroyed the file it was asked to preserve.
  return { document: validateDocumentIntegrity(converted), changed: true };
};
