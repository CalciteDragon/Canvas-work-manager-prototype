import {
  UndoReceiptSchema,
  UndoRecordIdSchema,
  UndoRecordSchema,
  type ProjectId,
  type UndoOperation,
  type UndoReceipt,
  type UndoRecord,
  type UndoRecordId,
} from '@cwm/contracts';
import type { UndoRecordRepository } from '@cwm/repositories';
import type { ActorContext } from './actor';
import type { Clock } from './clock';
import type { IdGenerator } from './ids';

/** A record can be undone for 24 hours after the removal it reverses. */
export const UNDO_RECORD_LIFETIME_MS = 24 * 60 * 60 * 1000;

/** A workspace keeps at most this many records, consumed ones included. */
export const UNDO_RECORD_LIMIT = 50;

export interface UndoRecordEntry {
  projectId: ProjectId;
  /** What the receipt says the operation was, e.g. `Removed the Backlog section`. */
  label: string;
  operation: UndoOperation;
}

/**
 * **The one seam a mutation uses to become undoable.** Called from inside the mutation's own
 * unit of work, exactly as `ActivityService.record` is: it never opens a unit and asserts no
 * grant — its caller already did — so the record commits or rolls back with the canonical
 * writes it reverses, and the receipt is only real once the caller's unit resolves.
 */
export interface UndoRecorder {
  record(actor: ActorContext, entry: UndoRecordEntry): Promise<UndoReceipt>;
}

export interface RepositoryUndoRecorderDependencies {
  undoRecords: UndoRecordRepository;
  clock: Clock;
  ids: IdGenerator;
}

/** The section a record's operation names — the key supersession and pruning group by. */
export const subjectSectionOf = (record: UndoRecord): string => {
  switch (record.operation.type) {
    case 'section.remove':
      return record.operation.section.id;
  }
};

/**
 * Stores one record and prunes the acting workspace to the retention bounds in the same unit
 * (docs/decisions/2026-09-section-removal-undo-records.md, rule 3).
 */
export class RepositoryUndoRecorder implements UndoRecorder {
  constructor(private readonly dependencies: RepositoryUndoRecorderDependencies) {}

  async record(actor: ActorContext, entry: UndoRecordEntry): Promise<UndoReceipt> {
    const { undoRecords, clock, ids } = this.dependencies;
    const now = clock.now();
    const expires = clock.now();
    expires.setTime(now.getTime() + UNDO_RECORD_LIFETIME_MS);

    const existing = (await undoRecords.list({ workspaceId: actor.workspaceId })).sort((a, b) => a.sequence - b.sequence);
    // Before pruning, so a sequence is never reused while a lower one could still exist.
    const sequence = (existing.at(-1)?.sequence ?? 0) + 1;

    const record = UndoRecordSchema.parse({
      id: UndoRecordIdSchema.parse(ids.next('undo')),
      workspaceId: actor.workspaceId,
      projectId: entry.projectId,
      actor: actor.actor,
      // Omitted rather than `undefined`, so the record in memory is the record written to disk.
      ...(actor.actor === 'user' ? { actorUserId: actor.userId } : {}),
      ...(actor.actor === 'agent' ? { actorAgentConnectionId: actor.agentConnectionId } : {}),
      sequence,
      label: entry.label,
      createdAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      operation: entry.operation,
    });

    for (const id of this.pruned(existing, now.getTime())) await undoRecords.remove(id);
    await undoRecords.insert(record);

    return UndoReceiptSchema.parse({
      undoId: record.id,
      operation: record.operation.type,
      label: record.label,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
    });
  }

  /**
   * Expired records first, then the lowest sequences until 49 remain, so the new record makes
   * exactly `UNDO_RECORD_LIMIT`. Pruning a record also prunes every lower-sequence record for the
   * same section: those are already superseded by it, and must not outlive the record that
   * supersedes them and start answering again.
   */
  private pruned(existing: readonly UndoRecord[], nowMs: number): Set<UndoRecordId> {
    const doomed = new Set<UndoRecordId>();
    const prune = (victim: UndoRecord): void => {
      doomed.add(victim.id);
      for (const record of existing) {
        if (record.sequence < victim.sequence && subjectSectionOf(record) === subjectSectionOf(victim)) doomed.add(record.id);
      }
    };

    for (const record of existing) if (nowMs >= Date.parse(record.expiresAt)) prune(record);
    for (const record of existing) {
      if (existing.length - doomed.size <= UNDO_RECORD_LIMIT - 1) break;
      if (!doomed.has(record.id)) prune(record);
    }
    return doomed;
  }
}
