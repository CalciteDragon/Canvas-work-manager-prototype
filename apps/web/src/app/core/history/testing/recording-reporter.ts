import { TestBed } from '@angular/core/testing';
import {
  OPERATION_HISTORY_REPORTER,
  type OperationHistoryReporter,
  type OperationWriteHandle,
  type OperationWriteReport,
} from '../operation-history-reporter';

/** One thing a writer told the header's history, in order. */
export type ReporterEvent = 'begin' | 'end' | OperationWriteReport;

/**
 * The header's history as a writer spec sees it (Slice 41): a reporter that records every begin,
 * end and committed report, in order, so a spec can assert "begin before the request, committed
 * with the response's project, end in finally".
 */
export class RecordingReporter implements OperationHistoryReporter {
  readonly events: ReporterEvent[] = [];

  begin(): OperationWriteHandle {
    this.events.push('begin');
    let ended = false;
    return {
      committed: (report: OperationWriteReport) => void this.events.push(report),
      end: () => {
        if (ended) return;
        ended = true;
        this.events.push('end');
      },
    };
  }

  /** The committed reports so far, in order. */
  reports(): OperationWriteReport[] {
    return this.events.filter((event): event is OperationWriteReport => typeof event === 'object');
  }
}

/** Registers a fresh `RecordingReporter` for the next injection and returns it. Call before the store is injected. */
export const provideRecordingReporter = (): RecordingReporter => {
  const reporter = new RecordingReporter();
  TestBed.configureTestingModule({ providers: [{ provide: OPERATION_HISTORY_REPORTER, useValue: reporter }] });
  return reporter;
};
