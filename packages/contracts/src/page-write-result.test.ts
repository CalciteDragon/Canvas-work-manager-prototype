import { describe, expect, it } from 'vitest';
import { ProjectPageWriteResultSchema } from './page-write-result';

const page = {
  id: 'page-reflections',
  projectId: 'project-root',
  kind: 'reflections',
  enabled: true,
  createdAt: '2026-09-21T10:00:00.000Z',
  updatedAt: '2026-09-21T10:00:00.000Z',
};

const receipt = {
  historyId: 'history-1',
  actionId: 'operation-1',
  operation: 'page.add',
  revision: 1,
  label: 'Enabled the reflections page',
  createdAt: '2026-09-21T10:00:00.000Z',
  expiresAt: '2026-09-22T10:00:00.000Z',
};

describe('the optional-page write envelope (§§26, 31)', () => {
  it('carries the confirmed page and the receipt a first enable recorded', () => {
    const parsed = ProjectPageWriteResultSchema.parse({ page, operation: receipt });
    expect([parsed.page.kind, parsed.operation?.operation]).toEqual(['reflections', 'page.add']);
  });

  it('carries a null receipt for a toggle already where it was asked to go', () => {
    expect(ProjectPageWriteResultSchema.parse({ page, operation: null }).operation).toBeNull();
  });

  it('requires the page, so a receipt alone cannot stand for the confirmed state', () => {
    expect(ProjectPageWriteResultSchema.safeParse({ operation: receipt }).success).toBe(false);
    expect(ProjectPageWriteResultSchema.safeParse({ page }).success).toBe(false);
  });

  it('accepts a page.update receipt, because one kind of call makes both writes', () => {
    const parsed = ProjectPageWriteResultSchema.parse({
      page: { ...page, enabled: false },
      operation: { ...receipt, operation: 'page.update' },
    });
    expect(parsed.operation?.operation).toBe('page.update');
  });
});
