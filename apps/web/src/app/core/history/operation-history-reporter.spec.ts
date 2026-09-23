import { TestBed } from '@angular/core/testing';
import type { OperationReceipt, ProjectId } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { OPERATION_HISTORY_REPORTER } from './operation-history-reporter';

describe('OPERATION_HISTORY_REPORTER', () => {
  it('defaults to an inert reporter that is safe to call outside a project workspace', () => {
    const reporter = TestBed.inject(OPERATION_HISTORY_REPORTER);
    const end = reporter.begin();
    expect(() => {
      end();
      end();
      reporter.committed({ projectId: 'project-1' as ProjectId, receipt: null });
      reporter.committed({ projectId: 'project-1' as ProjectId, receipt: { historyId: 'history-1' } as OperationReceipt });
    }).not.toThrow();
  });
});
