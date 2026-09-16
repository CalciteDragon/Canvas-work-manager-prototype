import {
  nameOf,
  ProjectSectionSchema,
  SectionAddUndoOperationSchema,
  SectionMoveUndoOperationSchema,
  SectionUpdateUndoOperationSchema,
  type ProjectPage,
  type ProjectId,
  type ProjectSection,
  type SectionAddUndoOperation,
  type SectionFieldChange,
  type SectionMoveUndoOperation,
  type SectionUpdateUndoOperation,
  type UndoConflict,
  type UndoConflictNextStep,
  type UndoRecord,
  type UndoResult,
} from '@cwm/contracts';
import type {
  ProjectPageRepository,
  ProjectRepository,
  ReflectionRepository,
  SectionRepository,
  SectionShortcutRepository,
  TaskRepository,
  UndoRecordRepository,
} from '@cwm/repositories';
import type { Clock } from './clock';
import { EntityNotFoundError, undoRefusal } from './errors';
import { findHighestWriteBlocker } from './project-visibility';
import { listPlacements, renumberPlacements, resolveRestoreIndex, type RestoreStrategy } from './page-placements';
import { sameUndoRecordActor, subjectSectionOf } from './undo-recorder';

/** Repository-only dependencies shared by the three explicit section-edit inverses. */
export interface SectionEditUndoRepositories {
  undoRecords: UndoRecordRepository;
  sections: SectionRepository;
  shortcuts: SectionShortcutRepository;
  pages: ProjectPageRepository;
  projects: ProjectRepository;
  tasks: TaskRepository;
  reflections: ReflectionRepository;
}

type SectionEditOperation = SectionAddUndoOperation | SectionMoveUndoOperation | SectionUpdateUndoOperation;

/** Builds the strict inverse stored for an explicit add. */
export const captureSectionAdd = (section: ProjectSection): SectionAddUndoOperation =>
  SectionAddUndoOperationSchema.parse({ version: 1, type: 'section.add', section });

/** Builds the strict inverse stored for a completed move. */
export const captureSectionMove = (input: Omit<SectionMoveUndoOperation, 'version' | 'type'>): SectionMoveUndoOperation =>
  SectionMoveUndoOperationSchema.parse({ version: 1, type: 'section.move', ...input });

/** Builds the strict inverse stored for the fields that actually changed. */
export const captureSectionUpdate = (input: Omit<SectionUpdateUndoOperation, 'version' | 'type'>): SectionUpdateUndoOperation =>
  SectionUpdateUndoOperationSchema.parse({ version: 1, type: 'section.update', ...input });

const titleValue = (section: ProjectSection): string | null => section.title ?? null;

/** Stable, editable state for the add inverse; position and timestamps are intentionally absent. */
const substantiveSection = (section: ProjectSection): unknown => ({
  id: section.id,
  projectId: section.projectId,
  pageId: section.pageId,
  type: section.type,
  title: titleValue(section),
  columnSpan: section.columnSpan,
  collapsed: section.collapsed,
  config: section.config,
});

/** JSON equality with object-key order ignored and array order retained. */
export const sameValue = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => sameValue(value, right[index]));
  }
  const leftKeys = Object.keys(left as Record<string, unknown>).sort();
  const rightKeys = Object.keys(right as Record<string, unknown>).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && sameValue(
    (left as Record<string, unknown>)[key],
    (right as Record<string, unknown>)[key],
  ));
};

const nextStepFor = (problem: UndoConflict['problem'], supersededBy?: SupersedingActor): UndoConflictNextStep => {
  switch (problem) {
    case 'missing':
      return 'nothing-to-undo';
    case 'superseded':
      // The later receipt is a repair only for the actor that owns it.
      return supersededBy === 'self' ? 'use-later-receipt' : 'redo-by-hand';
    case 'field-changed':
    case 'archived-differently':
      return 'use-later-receipt';
    case 'archived-subject':
    case 'archive-state-changed':
      return 'restore-state-and-retry';
    case 'shortcut-reference':
    case 'new-dependent':
      return 'remove-reference-and-retry';
    case 'moved':
    case 'page-changed':
    case 'reparented':
      return 'move-back-and-retry';
    case 'not-archived':
      return 'nothing-to-undo';
    default: {
      const unknown: never = problem;
      throw new TypeError(`no next step for ${String(unknown)}`);
    }
  }
};

/** Who the superseding record belongs to, relative to the actor holding the refused receipt. */
type SupersedingActor = NonNullable<UndoConflict['supersededBy']>;

/** `self` when the caller also holds the later receipt; otherwise the other party's actor kind. */
const supersedingActorOf = (record: UndoRecord, newer: UndoRecord): SupersedingActor =>
  sameUndoRecordActor(record, newer) ? 'self' : newer.actor;

const makeConflict = (
  entityType: UndoConflict['entityType'],
  id: string,
  problem: UndoConflict['problem'],
  title?: string,
  supersededBy?: SupersedingActor,
): UndoConflict => ({
  entityType,
  id,
  ...(problem === 'missing' || title === undefined ? {} : { title }),
  problem,
  nextStep: nextStepFor(problem, supersededBy),
  ...(problem === 'superseded' ? { supersededBy: supersededBy ?? 'self' } : {}),
});

/** The subject's current name, else the add snapshot's, else its id — a missing section has no name to show. */
const titleOf = (operation: SectionEditOperation, section: ProjectSection | null): string => {
  if (section !== null) return nameOf(section);
  return operation.type === 'section.add' ? nameOf(operation.section) : `section [${operation.sectionId}]`;
};

const conflictMessage = (operation: SectionEditOperation, section: ProjectSection | null, conflicts: readonly UndoConflict[]): string => {
  const shown = conflicts.slice(0, 5);
  const text = shown.map((conflict) => {
    const title = conflict.title === undefined ? '' : ` "${conflict.title}"`;
    return `${conflict.problem}: ${conflict.entityType}${title} [${conflict.id}] — ${nextStepText(conflict.nextStep)}`;
  }).join('; ');
  const more = conflicts.length > shown.length ? `; and ${conflicts.length - shown.length} more` : '';
  return `undo_conflict: Undo for the ${operation.type.replace('section.', '')} operation on ${titleOf(operation, section)} was refused: ${text}${more}`;
};

const nextStepText = (nextStep: UndoConflictNextStep): string => {
  switch (nextStep) {
    case 'redo-by-hand':
    case 'redo-by-hand-or-archive':
      return 'the later change belongs to another connection, so make the change again by hand';
    case 'move-back-and-retry':
      return 'move it back to the recorded page or section, then retry Undo';
    case 'restore-state-and-retry':
      return 'restore the subject to the recorded live state, then retry Undo';
    case 'restore-or-move-dependent-and-retry':
      return 'restore or move the dependent item to its recorded state, then retry Undo';
    case 'remove-reference-and-retry':
      return 'remove the reference or dependent item, then retry Undo';
    case 'use-later-receipt-or-archive':
      return 'use the later receipt if available, or recover retained content from Archive';
    case 'use-later-receipt':
      return 'use the later receipt if available, or make the change again by hand';
    case 'nothing-to-undo':
      return 'there is nothing left to undo';
    case 'nothing-to-restore':
      return 'Undo cannot recreate this state; use Archive when retained content is available';
  }
};

const projectAndPage = async (
  repositories: SectionEditUndoRepositories,
  record: UndoRecord,
  operation: SectionEditOperation,
): Promise<{ page: ProjectPage | null; conflicts: UndoConflict[] }> => {
  const project = await repositories.projects.find(record.projectId);
  if (project === null) throw new EntityNotFoundError('project', record.projectId);
  const blocker = await findHighestWriteBlocker(repositories.projects, project.id);
  if (blocker !== undefined) {
    const blockingProject = await repositories.projects.find(blocker);
    const blockingProjectTitle = blockingProject?.name ?? blocker;
    throw undoRefusal(
      { reason: 'undo_blocked', undoId: record.id, blockingProjectId: blocker, blockingProjectTitle },
      `project "${blockingProjectTitle}" [${blocker}] is archived; reactivate it before undoing this operation`,
    );
  }
  const pageId = operation.type === 'section.add' ? operation.section.pageId : operation.pageId;
  const page = await repositories.pages.find(pageId);
  if (page === null || page.projectId !== record.projectId) {
    return {
      page: null,
      conflicts: [makeConflict('section', operation.type === 'section.add' ? operation.section.id : operation.sectionId, 'page-changed')],
    };
  }
  return { page, conflicts: [] };
};

/** The superseding record, so the conflict can name whose it is — not merely that one exists. */
const newerRecord = async (
  repositories: SectionEditUndoRepositories,
  record: UndoRecord,
  operation: SectionEditOperation,
  overlaps?: Set<SectionFieldChange['field']>,
): Promise<UndoRecord | null> => {
  const supersedes = (other: UndoRecord): boolean => {
    if (other.sequence <= record.sequence || subjectSectionOf(other) !== (operation.type === 'section.add' ? operation.section.id : operation.sectionId)) return false;
    switch (operation.type) {
      case 'section.add':
        return true;
      case 'section.move':
        return other.operation.type === 'section.move' || other.operation.type === 'section.add' || other.operation.type === 'section.remove';
      case 'section.update':
        if (other.operation.type === 'section.add' || other.operation.type === 'section.remove') return true;
        return other.operation.type === 'section.update' && overlaps !== undefined && other.operation.changes.some((change) => overlaps.has(change.field));
    }
  };
  const records = await repositories.undoRecords.list({ workspaceId: record.workspaceId });
  // The *latest* superseding record, not merely one: it is the change a person would see on the
  // canvas, so it is the one whose actor the conflict should name.
  return records.reduce<UndoRecord | null>(
    (latest, other) => (!supersedes(other) ? latest : latest === null || other.sequence > latest.sequence ? other : latest),
    null,
  );
};

const addReferences = async (
  repositories: SectionEditUndoRepositories,
  projectId: ProjectId,
  sectionId: string,
): Promise<UndoConflict[]> => {
  const [tasks, reflections, shortcuts] = await Promise.all([
    repositories.tasks.list({ projectId, includeArchived: true }),
    repositories.reflections.list({ projectId, includeArchived: true }),
    repositories.shortcuts.list(),
  ]);
  const conflicts: UndoConflict[] = [];
  for (const task of tasks) {
    if (task.sectionId === sectionId || task.archivedWithSectionId === sectionId) {
      conflicts.push(makeConflict('task', task.id, 'new-dependent', task.title.trim() || 'Untitled task'));
    }
  }
  for (const reflection of reflections) {
    if (reflection.sectionId === sectionId || reflection.archivedWithSectionId === sectionId) {
      conflicts.push(makeConflict('reflection', reflection.id, 'new-dependent', reflection.title?.trim() || 'Untitled reflection'));
    }
  }
  for (const shortcut of shortcuts) {
    if (shortcut.sourceSectionId === sectionId) conflicts.push(makeConflict('shortcut', shortcut.id, 'shortcut-reference'));
  }
  return conflicts;
};

const sectionConflict = (
  current: ProjectSection | null,
  expected: ProjectSection,
  problem: UndoConflict['problem'],
  supersededBy?: SupersedingActor,
): UndoConflict =>
  makeConflict('section', expected.id, problem, current === null ? undefined : nameOf(current), supersededBy);

const collectAddConflicts = async (
  repositories: SectionEditUndoRepositories,
  record: UndoRecord,
  operation: SectionAddUndoOperation,
  current: ProjectSection | null,
): Promise<UndoConflict[]> => {
  const conflicts: UndoConflict[] = [];
  if (current === null) conflicts.push(sectionConflict(null, operation.section, 'missing'));
  else if (current.archivedAt !== undefined) conflicts.push(sectionConflict(current, operation.section, 'archived-subject'));
  else if (!sameValue(substantiveSection(current), substantiveSection(operation.section))) conflicts.push(sectionConflict(current, operation.section, 'field-changed'));
  const newer = await newerRecord(repositories, record, operation);
  if (newer !== null) {
    conflicts.push(sectionConflict(current, operation.section, 'superseded', supersedingActorOf(record, newer)));
  }
  if (current !== null) conflicts.push(...await addReferences(repositories, operation.section.projectId, operation.section.id));
  return conflicts;
};

const valueForChange = (section: ProjectSection, field: SectionFieldChange['field']): unknown => {
  switch (field) {
    case 'title': return titleValue(section);
    case 'config': return section.config;
    case 'collapsed': return section.collapsed;
    case 'columnSpan': return section.columnSpan;
  }
};

const collectSharedSectionConflicts = async (
  repositories: SectionEditUndoRepositories,
  record: UndoRecord,
  operation: SectionMoveUndoOperation | SectionUpdateUndoOperation,
  current: ProjectSection | null,
): Promise<UndoConflict[]> => {
  const conflicts: UndoConflict[] = [];
  if (current === null) conflicts.push(makeConflict('section', operation.sectionId, 'missing'));
  else if (current.archivedAt !== undefined) conflicts.push(makeConflict('section', operation.sectionId, 'archived-subject', nameOf(current)));
  else if (current.projectId !== operation.projectId || current.pageId !== operation.pageId) conflicts.push(makeConflict('section', operation.sectionId, 'page-changed', nameOf(current)));

  if (
    operation.type === 'section.update' && current !== null && current.archivedAt === undefined &&
    operation.changes.some((change) => !sameValue(valueForChange(current, change.field), change.after))
  ) {
    conflicts.push(makeConflict('section', operation.sectionId, 'field-changed', nameOf(current)));
  }

  const overlaps = operation.type === 'section.update' ? new Set(operation.changes.map((change) => change.field)) : undefined;
  const newer = await newerRecord(repositories, record, operation, overlaps);
  if (newer !== null) {
    conflicts.push(makeConflict(
      'section',
      operation.sectionId,
      'superseded',
      current === null ? undefined : nameOf(current),
      supersedingActorOf(record, newer),
    ));
  }
  return conflicts;
};

const throwConflicts = (record: UndoRecord, operation: SectionEditOperation, section: ProjectSection | null, conflicts: UndoConflict[]): void => {
  if (conflicts.length === 0) return;
  throw undoRefusal(
    { reason: 'undo_conflict', undoId: record.id, conflicts },
    conflictMessage(operation, section, conflicts).replace(/^undo_conflict: /, ''),
  );
};

/** Executes the inverse of an explicit add without touching rows, shortcuts or later content. */
export const executeSectionAddUndo = async (
  repositories: SectionEditUndoRepositories,
  clock: Clock,
  record: UndoRecord,
  operation: SectionAddUndoOperation,
): Promise<UndoResult> => {
  const { page, conflicts: pageConflicts } = await projectAndPage(repositories, record, operation);
  const current = await repositories.sections.find(operation.section.id);
  const conflicts = [...pageConflicts, ...await collectAddConflicts(repositories, record, operation, current)];
  throwConflicts(record, operation, current, conflicts);
  if (page === null) throw new EntityNotFoundError('page', operation.section.pageId);
  const placements = await listPlacements(repositories, page.id);
  const index = placements.findIndex((placement) => placement.kind === 'section' && placement.value.id === operation.section.id);
  if (index < 0) {
    throwConflicts(record, operation, current, [makeConflict('section', operation.section.id, 'page-changed', nameOf(current ?? operation.section))]);
  }
  await repositories.sections.remove(operation.section.id);
  await renumberPlacements(repositories, clock, placements.filter((_, placementIndex) => placementIndex !== index));
  return {
    undoId: record.id,
    operation: 'section.add',
    outcome: 'removed',
    sectionId: operation.section.id,
    projectId: operation.section.projectId,
    pageId: operation.section.pageId,
  };
};

/** Executes the inverse of a field-aware settings update and preserves every untouched field. */
export const executeSectionUpdateUndo = async (
  repositories: SectionEditUndoRepositories,
  clock: Clock,
  record: UndoRecord,
  operation: SectionUpdateUndoOperation,
): Promise<UndoResult> => {
  const { conflicts: pageConflicts } = await projectAndPage(repositories, record, operation);
  const current = await repositories.sections.find(operation.sectionId);
  const conflicts = [...pageConflicts, ...await collectSharedSectionConflicts(repositories, record, operation, current)];
  throwConflicts(record, operation, current, conflicts);
  if (current === null) throw new EntityNotFoundError('section', operation.sectionId);
  const next = { ...current } as ProjectSection;
  for (const change of operation.changes) {
    if (change.field === 'title') {
      if (change.before === null) delete next.title;
      else next.title = change.before;
    } else if (change.field === 'config') {
      next.config = structuredClone(change.before);
    } else if (change.field === 'collapsed') {
      next.collapsed = change.before;
    } else {
      next.columnSpan = change.before;
    }
  }
  const restored = ProjectSectionSchema.parse({ ...next, updatedAt: clock.now().toISOString() });
  await repositories.sections.update(restored);
  return { undoId: record.id, operation: 'section.update', outcome: 'restored', section: restored };
};

/** Executes the inverse of a move against the current combined section/shortcut order. */
export const executeSectionMoveUndo = async (
  repositories: SectionEditUndoRepositories,
  clock: Clock,
  record: UndoRecord,
  operation: SectionMoveUndoOperation,
): Promise<UndoResult> => {
  const { page, conflicts: pageConflicts } = await projectAndPage(repositories, record, operation);
  const current = await repositories.sections.find(operation.sectionId);
  const conflicts = [...pageConflicts, ...await collectSharedSectionConflicts(repositories, record, operation, current)];
  throwConflicts(record, operation, current, conflicts);
  if (current === null) throw new EntityNotFoundError('section', operation.sectionId);
  if (page === null) throw new EntityNotFoundError('page', operation.pageId);

  const placements = await listPlacements(repositories, page.id);
  const without = placements.filter((placement) => !(placement.kind === 'section' && placement.value.id === operation.sectionId));
  const { index, strategy }: { index: number; strategy: RestoreStrategy } = resolveRestoreIndex(operation.placementBefore, without);
  const restored = ProjectSectionSchema.parse({ ...current, position: index, updatedAt: clock.now().toISOString() });
  await repositories.sections.update(restored);
  const ordered = [...without];
  ordered.splice(index, 0, { kind: 'section', value: restored });
  await renumberPlacements(repositories, clock, ordered, { kind: 'section', id: operation.sectionId });
  return {
    undoId: record.id,
    operation: 'section.move',
    outcome: 'restored',
    section: (await repositories.sections.find(operation.sectionId)) ?? restored,
    placement: { pageId: page.id, index, strategy, pageEnabled: page.enabled },
  };
};
