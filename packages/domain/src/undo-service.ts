import { nameOf, UndoRecordSchema, type UndoRecord, type UndoRecordId, type UndoResult } from '@cwm/contracts';
import type {
  ProjectPageRepository,
  ProjectRepository,
  ReflectionRepository,
  SectionRepository,
  SectionShortcutRepository,
  TaskRepository,
  UndoRecordRepository,
  UnitOfWork,
} from '@cwm/repositories';
import { assertPermitted, assertValidActor, type ActorContext } from './actor';
import type { ActivityService } from './activity-service';
import type { Clock } from './clock';
import { EntityNotFoundError, undoRefusal } from './errors';
import { executeSectionRemovalUndo } from './section-removal-undo';
import { executeSectionAddUndo, executeSectionMoveUndo, executeSectionUpdateUndo } from './section-edit-undo';
import { undoRecordBelongsToActor } from './undo-recorder';

/** Repository interfaces, `ActivityService` and a clock — deliberately no section, task or reflection service. */
export interface UndoServiceDependencies {
  undoRecords: UndoRecordRepository;
  sections: SectionRepository;
  shortcuts: SectionShortcutRepository;
  pages: ProjectPageRepository;
  projects: ProjectRepository;
  tasks: TaskRepository;
  reflections: ReflectionRepository;
  activity: ActivityService;
  clock: Clock;
  unitOfWork: UnitOfWork;
}

/**
 * **Executes one stored Undo record**, scoped to the actor that created it, under a current
 * `projects.write` grant, in one unit of work (docs/decisions/2026-09-section-removal-undo-records.md).
 *
 * Composes only `ActivityService` — the ordinary writing-service edge — and repository
 * interfaces. It depends on no section, task or reflection service and never calls a public
 * method that opens a unit: the inverse lives in shared function modules, so the service graph
 * stays acyclic.
 *
 * This is not Archive Restore. `SectionService.restoreSection` is durable, needs no receipt and
 * appends; Undo is short-lived, exact-actor, consumed once, and puts the section back between
 * the neighbours it left.
 */
export class UndoService {
  constructor(private readonly dependencies: UndoServiceDependencies) {}

  /**
   * Executes the receipt `undoId` for `actor`, or refuses: `EntityNotFoundError` when the record is
   * absent or not this exact actor's, `PermissionDeniedError` without `projects.write`, and a
   * `DomainRuleError` from `undoRefusal` (consumed, expired, blocked, conflict, unavailable) that
   * writes nothing and leaves the record usable.
   */
  async undo(actor: ActorContext, undoId: UndoRecordId): Promise<UndoResult> {
    assertValidActor(actor);
    // Before any read, so a connection without the grant learns nothing about the record.
    assertPermitted(actor, 'projects.write');

    return this.dependencies.unitOfWork.run(async () => {
      const { undoRecords, clock, activity } = this.dependencies;
      const record = await undoRecords.find(undoId);
      // One not-found for absent, foreign and someone else's: anything else would confirm the id.
      if (record === null || !undoRecordBelongsToActor(record, actor)) throw new EntityNotFoundError('undoRecord', undoId);

      if (record.consumedAt !== undefined) {
        throw undoRefusal(
          { reason: 'undo_consumed', undoId: record.id, consumedAt: record.consumedAt },
          `this ${OPERATION_NOUN[record.operation.type]} was already undone at ${record.consumedAt}`,
        );
      }
      const now = clock.now();
      if (now.getTime() >= Date.parse(record.expiresAt)) {
        throw undoRefusal(
          { reason: 'undo_expired', undoId: record.id, expiresAt: record.expiresAt },
          record.operation.type === 'section.remove'
            ? `this removal Undo expired at ${record.expiresAt}; Archive can still restore the section`
            : `this ${OPERATION_NOUN[record.operation.type]} Undo expired at ${record.expiresAt}; make the change again by hand instead`,
        );
      }

      const result = await this.execute(record);

      await undoRecords.update(UndoRecordSchema.parse({ ...record, consumedAt: now.toISOString() }));
      await activity.record(actor, {
        action: activityActionFor(record.operation.type),
        entityType: 'project',
        entityId: record.projectId,
        projectId: record.projectId,
        summary: undoSummary(record, result),
      });
      return result;
    });
  }

  /** Per-type dispatch. A `switch` with an exhaustive default, not a registry. */
  private execute(record: UndoRecord): Promise<UndoResult> {
    const { operation } = record;
    switch (operation.type) {
      case 'section.remove':
        return executeSectionRemovalUndo(this.dependencies, this.dependencies.clock, record, operation);
      case 'section.add':
        return executeSectionAddUndo(this.dependencies, this.dependencies.clock, record, operation);
      case 'section.move':
        return executeSectionMoveUndo(this.dependencies, this.dependencies.clock, record, operation);
      case 'section.update':
        return executeSectionUpdateUndo(this.dependencies, this.dependencies.clock, record, operation);
      default: {
        const unknown: never = operation;
        throw new TypeError(`no Undo executor for "${String(unknown)}"`);
      }
    }
  }
}

/** How refusal text names each operation, so a removal still reads "this removal". */
const OPERATION_NOUN: Record<UndoRecord['operation']['type'], string> = {
  'section.remove': 'removal',
  'section.add': 'section addition',
  'section.move': 'section move',
  'section.update': 'section settings update',
};

const activityActionFor = (operation: UndoRecord['operation']['type']):
  | 'project.section_removal_undone'
  | 'project.section_addition_undone'
  | 'project.section_move_undone'
  | 'project.section_update_undone' => {
  switch (operation) {
    case 'section.remove': return 'project.section_removal_undone';
    case 'section.add': return 'project.section_addition_undone';
    case 'section.move': return 'project.section_move_undone';
    case 'section.update': return 'project.section_update_undone';
    default: {
      const unknown: never = operation;
      throw new TypeError(`no activity action for ${String(unknown)}`);
    }
  }
};

const undoSummary = (record: UndoRecord, result: UndoResult): string => {
  switch (result.operation) {
    case 'section.add': {
      const operation = record.operation.type === 'section.add' ? record.operation : undefined;
      return `Undid adding the ${operation === undefined ? 'section' : nameOf(operation.section)} section`;
    }
    case 'section.remove': return `Undid removing the ${nameOf(result.section)} section`;
    case 'section.move': return `Undid moving the ${nameOf(result.section)} section`;
    case 'section.update': return `Undid updating the ${nameOf(result.section)} section`;
    default: {
      const unknown: never = result;
      throw new TypeError(`no Undo summary for ${String(unknown)}`);
    }
  }
};
