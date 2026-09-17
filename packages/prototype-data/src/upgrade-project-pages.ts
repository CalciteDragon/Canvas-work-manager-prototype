/**
 * The version-2 → version-3 converter (§14, §26–27), **frozen at its version-3 output**.
 *
 * Version 3 splits projects into roots and sub-projects and gives every project a page that
 * owns its sections. Version 2 had neither, so a real `.prototype/data.json` cannot simply be
 * re-parsed — and by this point a real file is worth keeping, which is the whole reason this
 * exists rather than a reset.
 *
 * **It is a converter, not a migration runner.** One version to one version, called
 * explicitly, registered nowhere. `upgrade-cli.ts` runs it and then `upgradeOperationHistory` in a
 * fixed order; that is a chain of two named steps, not a registry
 * (docs/decisions/2026-09-schema-version-4-conversion.md).
 *
 * Both shapes are read and returned as plain data rather than declared as Zod schemas: a
 * hand-written version-2 or version-3 schema would be a second definition of every entity (§11)
 * describing shapes nothing writes any more. The output is therefore **not** validated here —
 * `validateDocumentIntegrity` checks the *current* schema, which a version-3 document no longer
 * matches — and the version-3 → version-4 step validates the final document before the CLI writes
 * a byte, which is where the guarantee this step used to give now lives.
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
 * The version this converter writes — a literal, not `SCHEMA_VERSION`, so a later schema bump
 * cannot silently change what a version-2 file becomes.
 */
export const V3_SCHEMA_VERSION = 3;

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

/** An opaque version-3 document: plain JSON, deliberately untyped (see above). */
export type Version3Document = Record<string, unknown> & { schemaVersion: typeof V3_SCHEMA_VERSION };

export interface UpgradeProjectPagesResult {
  document: Version3Document;
  /** False when the input was already at version 3 — the no-op case. */
  changed: boolean;
}

export const upgradeProjectPages = (input: unknown): UpgradeProjectPagesResult => {
  const legacy = asLegacyDocument(input);

  // Already at version 3: returned untouched, so re-running this step is safe.
  if (legacy.schemaVersion === V3_SCHEMA_VERSION) {
    return { document: legacy as unknown as Version3Document, changed: false };
  }

  if (legacy.schemaVersion !== SOURCE_VERSION) {
    throw new RangeError(
      `cannot convert schema version ${legacy.schemaVersion}: this converter reads version ${SOURCE_VERSION} and writes version ${V3_SCHEMA_VERSION}`,
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
    schemaVersion: V3_SCHEMA_VERSION,
    projects,
    projectPages,
    sections,
    // Reserved empty by the cutover, so Slice 25.4's shortcut operations need no second
    // destructive load break.
    sectionShortcuts: [],
  };

  return { document: converted as Version3Document, changed: true };
};
