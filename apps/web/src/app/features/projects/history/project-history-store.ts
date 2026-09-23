import { DestroyRef, Injectable, PendingTasks, computed, inject, signal } from '@angular/core';
import {
  OperationHistoryRefusalDetailsSchema,
  isProjectRecordEvent,
  type LiveEvent,
  type OperationHistoryDirection,
  type OperationHistorySummary,
  type ProjectId,
} from '@cwm/contracts';
import { GatewayError } from '../../../core/gateway/gateway-error';
import { WORK_MANAGER_GATEWAY } from '../../../core/gateway/work-manager-gateway';
import type {
  OperationHistoryReporter,
  OperationWriteHandle,
  OperationWriteReport,
} from '../../../core/history/operation-history-reporter';
import { LIVE_UPDATES } from '../../../core/live/live-updates';
import {
  crossOwnerFeedback,
  historyControl,
  historyGoneFeedback,
  transitionRefusalFeedback,
  transitionResultFeedback,
  transitionUncertainFeedback,
  type HistoryControlView,
  type HistoryFeedback,
  type HistoryReadState,
} from './history-feedback';

/** A summary read a write is owed: one requested **after** `after`, reaching the receipt's revision. */
interface OwedRead {
  after: number;
  /** `null` for a write whose outcome is unknown (it ended without a commit); any fresh read settles it. */
  report: OperationWriteReport | null;
  /** Reads that answered below the receipt's revision; bounded so a restored document cannot spin. */
  retries: number;
}

/** How many times a same-history report re-reads for its revision before it stops holding the controls. */
const MAX_OWED_RETRIES = 3;

/**
 * **The displayed project's Undo/Redo history, for the header** (Slice 41, §§31, 61–63;
 * docs/decisions/2026-09-project-header-history-controls.md).
 *
 * Provided by `ProjectWorkspaceShell` — never `root` (§20) — and bound there to
 * `OPERATION_HISTORY_REPORTER`, so every browser writer inside the shell reports through this one
 * instance. It holds the server's summary and nothing else: no rows, sections or receipts beyond
 * the one report it is classifying. Content is reconciled by the transition's live frame, which
 * every open surface already re-reads on.
 *
 * **Freshness.** Three read states — `loading`, `ready`, `unavailable` (with Retry). A read carries
 * the generation it was requested under and is dropped if navigation, a prototype reload or
 * destruction moved on; within one history a summary with a lower `revision` than the one held is
 * dropped, so a slow read cannot roll the controls back. Reads are coalesced: one in flight, one
 * queued.
 *
 * **Ownership comes from `historyId`, never from a writer's guess.** A report whose receipt names
 * the held history owes a re-read; while nothing is held (no write yet by this actor here, or still
 * loading) every report owes one, and a fresh summary that still names another history makes the
 * report cross-owner. A report naming a different, known history is cross-owner at once.
 *
 * **Pending covers the whole write, including its re-read.** From `begin()` until the end function
 * runs **and** each owed read has landed — a read requested after `committed(...)`, at the
 * receipt's revision or later — both controls are unavailable. Without that, the window between a
 * write's `finally` and its re-read would enable the controls on the pre-write entry.
 */
@Injectable()
export class ProjectHistoryStore implements OperationHistoryReporter {
  private readonly gateway = inject(WORK_MANAGER_GATEWAY);
  private readonly pendingTasks = inject(PendingTasks);

  private projectId: ProjectId | null = null;
  /** Navigation, `prototype.reloaded` and destruction each start a new one; late answers are dropped. */
  private generation = 0;
  private alive = true;
  /** The id of the newest summary request; an owed read is settled only by a later one. */
  private readSequence = 0;
  private readInFlight = false;
  private readQueued = false;
  private owed: OwedRead[] = [];

  private readonly readStateSignal = signal<HistoryReadState>('loading');
  private readonly summaryState = signal<OperationHistorySummary | null>(null);
  private readonly writesState = signal(0);
  private readonly owedState = signal(0);
  private readonly transitionState = signal<OperationHistoryDirection | null>(null);
  private readonly feedbackState = signal<HistoryFeedback | null>(null);

  readonly readState = this.readStateSignal.asReadonly();
  readonly summary = this.summaryState.asReadonly();
  readonly feedback = this.feedbackState.asReadonly();
  readonly transitionPending = this.transitionState.asReadonly();
  /** A write, or a re-read it owes, has not settled. */
  readonly writePending = computed(() => this.writesState() > 0 || this.owedState() > 0);
  readonly retryAvailable = computed(() => this.readStateSignal() === 'unavailable');
  readonly undoControl = computed<HistoryControlView>(() => this.control('undo'));
  readonly redoControl = computed<HistoryControlView>(() => this.control('redo'));

  constructor() {
    const unsubscribe = inject(LIVE_UPDATES).subscribe(
      (event) => this.onLiveEvent(event),
      () => this.refresh(),
    );
    inject(DestroyRef).onDestroy(() => {
      // A transition that navigates (undoing the displayed page's enable) destroys this store
      // mid-flight; its late result is dropped here and the new shell's `load` shows the truth.
      this.alive = false;
      this.generation += 1;
      unsubscribe();
    });
  }

  /** Shows `projectId`'s history, starting in `loading` so nothing claims "Nothing to undo" early. */
  load(projectId: ProjectId): void {
    this.projectId = projectId;
    this.startGeneration();
    this.refresh();
  }

  /** Read-only Retry after a failed read. */
  retry(): void {
    if (this.readStateSignal() !== 'unavailable') return;
    this.readStateSignal.set('loading');
    this.refresh();
  }

  /** A sentence another part of the workspace owns, shown in the controls' feedback line. */
  announce(feedback: HistoryFeedback): void {
    this.feedbackState.set(feedback);
  }

  dismissFeedback(): void {
    this.feedbackState.set(null);
  }

  undo(): Promise<void> {
    return this.step('undo');
  }

  redo(): Promise<void> {
    return this.step('redo');
  }

  begin(): OperationWriteHandle {
    // Everything below is for this one write, in the generation it began in: a response that lands
    // after navigation neither unblocks nor reports into the next project's controls.
    const generation = this.generation;
    let committed = false;
    let ended = false;
    this.writesState.update((count) => count + 1);
    return {
      committed: (report) => {
        if (ended || committed || !this.current(generation)) return;
        committed = true;
        this.report(report);
      },
      end: () => {
        if (ended) return;
        ended = true;
        if (!this.current(generation)) return;
        this.writesState.update((count) => count - 1);
        // This write never reported a commit: it failed, and a transport error or a 5xx may still
        // have committed. Read rather than sit on the pre-write entry.
        if (!committed) this.owe(null);
      },
    };
  }

  /** A committed write: re-read its own history, or say where it was recorded instead. */
  private report(report: OperationWriteReport): void {
    const { receipt } = report;
    if (receipt === null) return;
    const held = this.readStateSignal() === 'ready' ? this.summaryState()?.historyId ?? null : null;
    if (held !== null && held !== receipt.historyId) {
      void this.announceCrossOwner(report);
      return;
    }
    this.owe(report);
  }

  private control(direction: OperationHistoryDirection): HistoryControlView {
    return historyControl({
      direction,
      readState: this.readStateSignal(),
      entry: this.summaryState()?.[direction] ?? null,
      transitionPending: this.transitionState(),
      writePending: this.writePending(),
    });
  }

  private startGeneration(): void {
    this.generation += 1;
    this.owed = [];
    this.owedState.set(0);
    this.writesState.set(0);
    this.readInFlight = false;
    this.readQueued = false;
    this.summaryState.set(null);
    this.readStateSignal.set('loading');
    this.transitionState.set(null);
    this.feedbackState.set(null);
  }

  private onLiveEvent(event: LiveEvent): void {
    if (this.projectId === null) return;
    // Seed, reset and clock changes replace histories and move expiry, and name no project.
    if (event.type === 'prototype.reloaded') {
      this.startGeneration();
      this.refresh();
      return;
    }
    // An ancestor's archive or reactivation changes this history's blockers without naming it.
    if (event.projectId === this.projectId || isProjectRecordEvent(event)) this.refresh();
  }

  private owe(report: OperationWriteReport | null): void {
    this.owed = [...this.owed, { after: this.readSequence, report, retries: 0 }];
    this.owedState.set(this.owed.length);
    this.refresh();
  }

  /** Coalesced: at most one read in flight and one queued behind it. */
  private refresh(): void {
    if (!this.alive || this.projectId === null) return;
    if (this.readInFlight) {
      this.readQueued = true;
      return;
    }
    this.readInFlight = true;
    const generation = this.generation;
    const sequence = ++this.readSequence;
    const settled = this.pendingTasks.add();
    this.gateway.history.summary(this.projectId).then(
      (summary) => {
        if (!this.current(generation)) return;
        this.readInFlight = false;
        this.adopt(summary);
        this.settleOwed(sequence, true);
      },
      () => {
        if (!this.current(generation)) return;
        this.readInFlight = false;
        this.readStateSignal.set('unavailable');
        this.settleOwed(sequence, false);
      },
    ).finally(() => {
      settled();
      if (this.current(generation) && this.readQueued) {
        this.readQueued = false;
        this.refresh();
      }
    });
  }

  private current(generation: number): boolean {
    return this.alive && generation === this.generation;
  }

  /** Takes `summary` unless it is an older revision of the history already held. */
  private adopt(summary: OperationHistorySummary): void {
    const held = this.summaryState();
    const older = held !== null && held.historyId !== null && held.historyId === summary.historyId && summary.revision < held.revision;
    if (!older) this.summaryState.set(summary);
    this.readStateSignal.set('ready');
  }

  /**
   * Settles the owed reads that `sequence` was requested after. A same-history receipt needs the
   * held summary at its revision; a summary that still names another history makes the report
   * cross-owner. A failed read ends what it owed: the store is `unavailable`, and Retry re-reads.
   */
  private settleOwed(sequence: number, succeeded: boolean): void {
    const held = this.summaryState();
    const remaining: OwedRead[] = [];
    let readAgain = false;
    for (const owed of this.owed) {
      if (owed.after >= sequence) {
        remaining.push(owed);
        continue;
      }
      const receipt = owed.report?.receipt ?? null;
      if (!succeeded || receipt === null || held === null) continue;
      if (held.historyId === receipt.historyId) {
        if (held.revision < receipt.revision && owed.retries < MAX_OWED_RETRIES) {
          remaining.push({ ...owed, after: sequence, retries: owed.retries + 1 });
          readAgain = true;
        }
        continue;
      }
      void this.announceCrossOwner(owed.report!);
    }
    this.owed = remaining;
    this.owedState.set(remaining.length);
    if (readAgain) this.refresh();
  }

  /** Words a write recorded elsewhere, naming the owning project from the write's own response. */
  private async announceCrossOwner(report: OperationWriteReport): Promise<void> {
    const { receipt, projectId } = report;
    if (receipt === null) return;
    const generation = this.generation;
    let name = report.projectName;
    if (name === undefined) {
      try {
        name = (await this.gateway.projects.get(projectId)).name;
      } catch {
        name = 'another project';
      }
    }
    if (this.current(generation)) this.feedbackState.set(crossOwnerFeedback(receipt.label, projectId, name));
  }

  /** One transition at a time, citing the held entry's action and the held revision. */
  private async step(direction: OperationHistoryDirection): Promise<void> {
    const summary = this.summaryState();
    const entry = summary?.[direction] ?? null;
    const view = direction === 'undo' ? this.undoControl() : this.redoControl();
    if (!view.enabled || summary === null || summary.historyId === null || entry === null) return;
    const generation = this.generation;
    this.transitionState.set(direction);
    this.feedbackState.set(null);
    const settled = this.pendingTasks.add();
    try {
      const transition = await this.gateway.history.transition(summary.historyId, {
        actionId: entry.actionId,
        direction,
        expectedRevision: summary.revision,
      });
      if (!this.current(generation)) return;
      this.adopt(transition.summary);
      this.feedbackState.set(transitionResultFeedback(direction, entry.label, transition.result));
    } catch (error) {
      if (!this.current(generation)) return;
      const parsed = error instanceof GatewayError && error.code === 'rule_violation'
        ? OperationHistoryRefusalDetailsSchema.safeParse(error.details)
        : null;
      if (parsed?.success) {
        // Every refusal carries the caller's current summary; `history_retired` moved the cursor.
        this.adopt(parsed.data.summary);
        this.feedbackState.set(transitionRefusalFeedback(direction, entry.label, parsed.data));
        if (parsed.data.reason === 'history_expired') this.refresh();
      } else if (error instanceof GatewayError && error.code === 'not_found') {
        this.feedbackState.set(historyGoneFeedback());
        this.refresh();
      } else {
        // The response may have been lost after the transition landed: read, never assume.
        this.feedbackState.set(transitionUncertainFeedback(direction));
        this.refresh();
      }
    } finally {
      if (this.current(generation)) this.transitionState.set(null);
      settled();
    }
  }
}
