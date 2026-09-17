import { DestroyRef, Injectable, PendingTasks, computed, inject, signal } from '@angular/core';
import type {
  LiveEvent,
  CreateReflectionInput,
  ProjectId,
  ProjectJournalResult,
  ProjectPageId,
  ProjectSection,
  ReflectionSubjectView,
  OperationReceipt,
  UndoResult,
} from '@cwm/contracts';
import { WORK_MANAGER_GATEWAY } from '../../../core/gateway/work-manager-gateway';
import { LIVE_UPDATES } from '../../../core/live/live-updates';
import { supersedesReceipt, undoFailureNotice, type SectionUndoNoticeState } from '../project-page-store';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

interface ActiveRead {
  generation: number;
  queued: boolean;
  promise: Promise<boolean>;
  next?: Promise<boolean>;
}

/** §36's page-local reads, picker and write coordination. */
@Injectable()
export class ReflectionsPageStore {
  private readonly gateway = inject(WORK_MANAGER_GATEWAY);
  private readonly pendingTasks = inject(PendingTasks);

  private readonly journalState = signal<ProjectJournalResult | null>(null);
  private readonly candidatesState = signal<readonly ReflectionSubjectView[]>([]);
  private readonly containerState = signal<ProjectSection | null>(null);
  private readonly containerCountState = signal(0);
  private readonly journalLoadingState = signal(true);
  private readonly pickerLoadingState = signal(true);
  private readonly containerLoadingState = signal(true);
  private readonly journalErrorState = signal<string | null>(null);
  private readonly pickerErrorState = signal<string | null>(null);
  private readonly containerErrorState = signal<string | null>(null);
  private readonly refreshErrorState = signal<string | null>(null);
  private readonly writeErrorState = signal<string | null>(null);
  private readonly creatingContainerState = signal(false);
  private readonly undoNoticeState = signal<SectionUndoNoticeState | null>(null);
  private readonly undoPendingState = signal(false);
  private readonly writingState = signal(false);
  /** The newest receipt captured on this page; see `supersedesReceipt`. */
  private newestReceipt: OperationReceipt | null = null;

  private projectIdState = signal<ProjectId | null>(null);
  private pageIdState = signal<ProjectPageId | null>(null);
  private generation = 0;
  private activeJournalRead: ActiveRead | null = null;
  private activeCandidatesRead: ActiveRead | null = null;
  private activeContainerRead: ActiveRead | null = null;
  private journalQueued = false;
  private candidatesQueued = false;
  private containerQueued = false;
  private writingGeneration: number | null = null;
  private writeEpoch = 0;
  private destroyed = false;

  readonly result = this.journalState.asReadonly();
  readonly items = computed(() => this.journalState()?.items ?? []);
  readonly candidates = this.candidatesState.asReadonly();
  readonly container = this.containerState.asReadonly();
  readonly containerCount = this.containerCountState.asReadonly();
  readonly journalLoading = this.journalLoadingState.asReadonly();
  readonly pickerLoading = this.pickerLoadingState.asReadonly();
  readonly containerLoading = this.containerLoadingState.asReadonly();
  readonly loading = computed(() => this.journalLoading() || this.pickerLoading() || this.containerLoading());
  readonly journalError = this.journalErrorState.asReadonly();
  readonly pickerError = this.pickerErrorState.asReadonly();
  readonly containerError = this.containerErrorState.asReadonly();
  readonly error = this.journalError;
  readonly refreshError = this.refreshErrorState.asReadonly();
  readonly writeError = this.writeErrorState.asReadonly();
  readonly creatingContainer = this.creatingContainerState.asReadonly();
  readonly undoNotice = this.undoNoticeState.asReadonly();
  readonly undoBusy = computed(() => this.undoPendingState() || this.writingState());
  readonly undoPending = this.undoPendingState.asReadonly();

  constructor() {
    const unsubscribe = inject(LIVE_UPDATES).subscribe(
      (event) => this.onLiveEvent(event),
      () => this.onLiveConnected(),
    );
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.generation += 1;
      this.projectIdState.set(null);
      this.pageIdState.set(null);
      unsubscribe();
    });
  }

  load(projectId: ProjectId, pageId: ProjectPageId): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    const generation = ++this.generation;
    const changed = this.projectIdState() !== projectId || this.pageIdState() !== pageId;
    this.projectIdState.set(projectId);
    this.pageIdState.set(pageId);
    if (changed) {
      this.journalState.set(null);
      this.candidatesState.set([]);
      this.containerState.set(null);
      this.containerCountState.set(0);
    }
    this.undoNoticeState.set(null);
    this.newestReceipt = null;
    this.journalQueued = false;
    this.candidatesQueued = false;
    this.containerQueued = false;
    this.journalErrorState.set(null);
    this.pickerErrorState.set(null);
    this.containerErrorState.set(null);
    this.refreshErrorState.set(null);
    this.writeErrorState.set(null);
    this.journalLoadingState.set(true);
    this.pickerLoadingState.set(true);
    this.containerLoadingState.set(true);
    return Promise.all([
      this.readJournal(generation, projectId, false),
      this.readCandidates(generation, projectId, false),
      this.readContainer(generation, projectId, pageId, false),
    ]).then(() => undefined);
  }

  retryJournal(): Promise<boolean> {
    const projectId = this.projectIdState();
    return projectId === null ? Promise.resolve(false) : this.readJournal(this.generation, projectId, false);
  }

  retryRefresh(): Promise<boolean> {
    const projectId = this.projectIdState();
    return projectId === null ? Promise.resolve(false) : this.readJournal(this.generation, projectId, true);
  }

  retryCompletedWork(): Promise<boolean> {
    const projectId = this.projectIdState();
    return projectId === null ? Promise.resolve(false) : this.readCandidates(this.generation, projectId, false);
  }

  async retryContainer(): Promise<boolean> {
    const projectId = this.projectIdState();
    const pageId = this.pageIdState();
    if (projectId === null || pageId === null) return false;
    const refreshed = await this.readContainer(this.generation, projectId, pageId, false);
    if (refreshed) this.undoNoticeState.update((state) => state === null ? null : { ...state, refreshFailed: false });
    return refreshed;
  }

  async ensureContainer(): Promise<boolean> {
    const projectId = this.projectIdState();
    const pageId = this.pageIdState();
    if (projectId === null || pageId === null || this.destroyed) return false;
    if (this.containerState() !== null) return true;
    if (this.creatingContainerState() || this.writingGeneration !== null) return false;
    const generation = this.generation;
    this.creatingContainerState.set(true);
    this.containerErrorState.set(null);
    this.beginWrite(generation);
    try {
      const result = await this.track(() =>
        this.gateway.sections.create(projectId, { type: 'reflections', pageId }),
      );
      if (!this.current(generation, projectId, pageId)) return false;
      this.containerState.set(result.section);
      this.containerCountState.set(1);
      this.captureUndoReceipt(result.operation, 'Reflections container added. Undo is available on this page.');
      return true;
    } catch (error) {
      if (this.current(generation, projectId, pageId)) this.containerErrorState.set(messageOf(error));
      return false;
    } finally {
      this.endWrite(generation, projectId, pageId);
      if (!this.destroyed) this.creatingContainerState.set(false);
    }
  }

  /** Undoes the page's held receipt through the history transition route; the inverse stays on the server. */
  async undoOperation(): Promise<UndoResult | null> {
    const notice = this.undoNoticeState();
    const receipt = notice?.receipt;
    const projectId = this.projectIdState();
    const pageId = this.pageIdState();
    if (
      receipt === null || receipt === undefined || projectId === null || pageId === null ||
      this.undoPendingState() || this.writingGeneration !== null
    ) {
      return null;
    }
    const generation = this.generation;
    this.undoPendingState.set(true);
    this.beginWrite(generation);
    let result: UndoResult | null = null;
    try {
      const transition = await this.track(() => this.gateway.history.transition(receipt.historyId, {
        actionId: receipt.actionId,
        direction: 'undo',
        expectedRevision: receipt.revision,
      }));
      result = transition.direction === 'undo' ? transition.result : null;
    } catch (error) {
      if (this.current(generation, projectId, pageId) && this.newestReceipt?.actionId === receipt.actionId) {
        const { landed, ...state } = undoFailureNotice(receipt, error, this.undoNoticeState(), 'The page has been refreshed.');
        this.undoNoticeState.set(state);
        if (state.receipt !== null) this.newestReceipt = state.receipt;
        // The Undo already ran (a lost response, or another tab), so the container on screen is stale.
        if (landed === true) await this.readContainer(generation, projectId, pageId, true);
      }
      return null;
    } finally {
      this.endWrite(generation, projectId, pageId);
      this.undoPendingState.set(false);
    }
    if (result === null || !this.current(generation, projectId, pageId)) return null;
    if (this.newestReceipt?.actionId !== receipt.actionId) {
      await this.readContainer(generation, projectId, pageId, true);
      return result;
    }
    this.undoNoticeState.set({
      kind: 'result',
      receipt: null,
      result,
      message: result.operation === 'section.add'
        ? 'Undo removed the added Reflections container.'
        : 'Undo restored the Reflections container.',
    });
    const refreshed = await this.readContainer(generation, projectId, pageId, true);
    // A read queued behind another write is not a failure; only a failed read is.
    if (!refreshed && this.refreshErrorState() !== null && this.current(generation, projectId, pageId)) {
      this.undoNoticeState.update((state) => state === null ? null : {
        ...state,
        refreshFailed: true,
        message: state.message || 'The change was saved, but this page could not be refreshed.',
      });
    }
    return result;
  }

  dismissUndoNotice(): void {
    this.undoNoticeState.set(null);
  }

  /** Writes through the same reflection gateway as a canvas section, then refreshes the feed. */
  async create(
    bodyRaw: string,
    titleRaw = '',
    prompt = '',
    subject?: ReflectionSubjectView,
  ): Promise<boolean> {
    const body = bodyRaw.trim();
    const projectId = this.projectIdState();
    const sectionId = this.containerState()?.id;
    if (!body) {
      this.writeErrorState.set('A reflection body is required.');
      return false;
    }
    if (projectId === null || sectionId === undefined) {
      this.writeErrorState.set('Add a Reflections container before writing here.');
      return false;
    }
    if (this.writingGeneration !== null) return false;
    const generation = this.generation;
    this.writeErrorState.set(null);
    this.beginWrite(generation);
    let committed = false;
    try {
      const input: CreateReflectionInput = {
        projectId,
        sectionId,
        body,
        ...(titleRaw.trim() ? { title: titleRaw.trim() } : {}),
        ...(prompt ? { prompt } : {}),
      };
      if (subject?.kind === 'task') input.subject = { kind: 'task', id: subject.id };
      if (subject?.kind === 'subproject') input.subject = { kind: 'subproject', id: subject.id };
      await this.track(() => this.gateway.reflections.create(input));
      committed = true;
    } catch (error) {
      if (this.current(generation, projectId, this.pageIdState())) this.writeErrorState.set(messageOf(error));
      return false;
    }
    finally {
      this.endWrite(generation, projectId, this.pageIdState());
    }

    if (!committed || !this.current(generation, projectId, this.pageIdState())) return false;
    const refreshed = await this.readJournal(generation, projectId, true);
    if (!this.currentProject(generation, projectId)) return false;
    if (!refreshed) this.refreshErrorState.set('Reflection saved, but the journal could not refresh. Try again.');
    return true;
  }

  private async readJournal(generation: number, projectId: ProjectId, quiet: boolean): Promise<boolean> {
    if (quiet && this.writingGeneration === generation) {
      this.journalQueued = true;
      return false;
    }
    const active = this.activeJournalRead;
    if (quiet && active?.generation === generation) {
      active.queued = true;
      const result = await active.promise;
      return active.next === undefined ? result : active.next;
    }
    if (!quiet) this.journalLoadingState.set(true);
    this.journalQueued = false;
    const epoch = this.writeEpoch;
    const state: ActiveRead = { generation, queued: false, promise: Promise.resolve(false) };
    const operation = this.track(async () => {
      try {
        const result = await this.gateway.journal.get(projectId);
        if (!this.currentProject(generation, projectId)) return false;
        if (this.writingGeneration === generation || this.writeEpoch !== epoch) {
          this.journalQueued = true;
          return false;
        }
        this.journalState.set(result);
        this.journalErrorState.set(null);
        if (quiet) this.refreshErrorState.set(null);
        return true;
      } catch (error) {
        if (!this.currentProject(generation, projectId)) return false;
        if (quiet) this.refreshErrorState.set(messageOf(error));
        else this.journalErrorState.set(messageOf(error));
        return false;
      } finally {
        if (!quiet && this.currentProject(generation, projectId)) this.journalLoadingState.set(false);
      }
    }).finally(() => {
      if (this.activeJournalRead !== state) return;
      this.activeJournalRead = null;
      if (
        (state.queued || this.journalQueued) &&
        this.currentProject(generation, projectId) &&
        this.writingGeneration !== generation
      ) {
        this.journalQueued = false;
        state.next = this.readJournal(generation, projectId, true);
      }
    });
    state.promise = operation;
    this.activeJournalRead = state;
    return operation;
  }

  private async readCandidates(generation: number, projectId: ProjectId, quiet: boolean): Promise<boolean> {
    if (quiet && this.writingGeneration === generation) {
      this.candidatesQueued = true;
      return false;
    }
    const active = this.activeCandidatesRead;
    if (quiet && active?.generation === generation) {
      active.queued = true;
      const result = await active.promise;
      return active.next === undefined ? result : active.next;
    }
    if (!quiet) this.pickerLoadingState.set(true);
    this.candidatesQueued = false;
    const epoch = this.writeEpoch;
    const state: ActiveRead = { generation, queued: false, promise: Promise.resolve(false) };
    const operation = this.track(async () => {
      try {
        const result = await this.gateway.journal.completedWork(projectId);
        if (!this.currentProject(generation, projectId)) return false;
        if (this.writingGeneration === generation || this.writeEpoch !== epoch) {
          this.candidatesQueued = true;
          return false;
        }
        this.candidatesState.set(result.candidates);
        this.pickerErrorState.set(null);
        return true;
      } catch (error) {
        if (!this.currentProject(generation, projectId)) return false;
        if (quiet) this.refreshErrorState.set(messageOf(error));
        else this.pickerErrorState.set(messageOf(error));
        return false;
      } finally {
        if (!quiet && this.currentProject(generation, projectId)) this.pickerLoadingState.set(false);
      }
    }).finally(() => {
      if (this.activeCandidatesRead !== state) return;
      this.activeCandidatesRead = null;
      if (
        (state.queued || this.candidatesQueued) &&
        this.currentProject(generation, projectId) &&
        this.writingGeneration !== generation
      ) {
        this.candidatesQueued = false;
        state.next = this.readCandidates(generation, projectId, true);
      }
    });
    state.promise = operation;
    this.activeCandidatesRead = state;
    return operation;
  }

  private async readContainer(
    generation: number,
    projectId: ProjectId,
    pageId: ProjectPageId,
    quiet: boolean,
  ): Promise<boolean> {
    if (quiet && this.writingGeneration === generation) {
      this.containerQueued = true;
      return false;
    }
    const active = this.activeContainerRead;
    if (quiet && active?.generation === generation) {
      active.queued = true;
      const result = await active.promise;
      return active.next === undefined ? result : active.next;
    }
    if (!quiet) this.containerLoadingState.set(true);
    this.containerQueued = false;
    const epoch = this.writeEpoch;
    const state: ActiveRead = { generation, queued: false, promise: Promise.resolve(false) };
    const operation = this.track(async () => {
      try {
        const sections = await this.gateway.sections.list(projectId, { pageId });
        if (!this.current(generation, projectId, pageId)) return false;
        if (this.writingGeneration === generation || this.writeEpoch !== epoch) {
          this.containerQueued = true;
          return false;
        }
        const containers = sections
          .filter(({ type }) => type === 'reflections')
          .sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        this.containerState.set(containers[0] ?? null);
        this.containerCountState.set(containers.length);
        this.containerErrorState.set(null);
        return true;
      } catch (error) {
        if (!this.current(generation, projectId, pageId)) return false;
        if (quiet) this.refreshErrorState.set(messageOf(error));
        else this.containerErrorState.set(messageOf(error));
        return false;
      } finally {
        if (!quiet && this.current(generation, projectId, pageId)) this.containerLoadingState.set(false);
      }
    }).finally(() => {
      if (this.activeContainerRead !== state) return;
      this.activeContainerRead = null;
      if (
        (state.queued || this.containerQueued) &&
        this.current(generation, projectId, pageId) &&
        this.writingGeneration !== generation
      ) {
        this.containerQueued = false;
        state.next = this.readContainer(generation, projectId, pageId, true);
      }
    });
    state.promise = operation;
    this.activeContainerRead = state;
    return operation;
  }

  private onLiveEvent(event: LiveEvent): void {
    const projectId = this.projectIdState();
    const pageId = this.pageIdState();
    if (this.destroyed || projectId === null || pageId === null) return;
    if (event.type === 'prototype.reloaded') {
      void this.load(projectId, pageId);
      return;
    }
    if (event.rootProjectId !== projectId && event.projectId !== projectId) return;
    void this.refresh(projectId, pageId);
  }

  private onLiveConnected(): void {
    const projectId = this.projectIdState();
    const pageId = this.pageIdState();
    if (!this.destroyed && projectId !== null && pageId !== null) void this.refresh(projectId, pageId);
  }

  private refresh(projectId: ProjectId, pageId: ProjectPageId): Promise<void> {
    const generation = this.generation;
    return Promise.all([
      this.readJournal(generation, projectId, true),
      this.readCandidates(generation, projectId, true),
      this.readContainer(generation, projectId, pageId, true),
    ]).then(() => undefined);
  }

  private beginWrite(generation: number): void {
    this.writingGeneration = generation;
    this.writingState.set(true);
    this.writeEpoch += 1;
  }

  private endWrite(generation: number, projectId: ProjectId, pageId: ProjectPageId | null): void {
    if (this.writingGeneration === generation) {
      this.writingGeneration = null;
      this.writingState.set(false);
    }
    if (pageId !== null && this.current(generation, projectId, pageId)) {
      this.flushQueued(generation, projectId, pageId);
    }
  }

  private flushQueued(generation: number, projectId: ProjectId, pageId: ProjectPageId): void {
    if (this.activeJournalRead === null && this.journalQueued) {
      this.journalQueued = false;
      void this.readJournal(generation, projectId, true);
    }
    if (this.activeCandidatesRead === null && this.candidatesQueued) {
      this.candidatesQueued = false;
      void this.readCandidates(generation, projectId, true);
    }
    if (this.activeContainerRead === null && this.containerQueued) {
      this.containerQueued = false;
      void this.readContainer(generation, projectId, pageId, true);
    }
  }

  private captureUndoReceipt(receipt: OperationReceipt, message: string): void {
    if (!supersedesReceipt(this.newestReceipt, receipt)) return;
    this.newestReceipt = receipt;
    this.undoNoticeState.set({ kind: 'available', receipt, message });
  }

  private currentProject(generation: number, projectId: ProjectId): boolean {
    return !this.destroyed && generation === this.generation && this.projectIdState() === projectId;
  }

  private current(generation: number, projectId: ProjectId, pageId: ProjectPageId | null): boolean {
    return this.currentProject(generation, projectId) && this.pageIdState() === pageId;
  }

  private track<T>(operation: () => Promise<T>): Promise<T> {
    const settled = this.pendingTasks.add();
    try {
      return operation().finally(settled);
    } catch (error) {
      settled();
      throw error;
    }
  }
}
