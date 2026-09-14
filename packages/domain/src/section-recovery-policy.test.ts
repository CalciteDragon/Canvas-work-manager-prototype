import type { ProjectSection, Reflection, Task } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { sectionRecoveryOf } from './section-recovery-policy';

/**
 * Refactor §14's Archive column, as a pure table: what a removed section leaves worth
 * recovering, judged on the content that remains rather than on the type alone.
 * See docs/decisions/2026-09-content-oriented-archive-policy.md.
 */

const SECTION_ID = 'section-a' as ProjectSection['id'];
const OTHER_ID = 'section-b' as ProjectSection['id'];

const section = (type: string, config: Record<string, unknown> = {}) =>
  ({ id: SECTION_ID, type, config }) as Pick<ProjectSection, 'id' | 'type' | 'config'>;

const row = (sectionId: ProjectSection['id'], archived = false) =>
  ({ sectionId, ...(archived ? { archivedAt: '2026-09-01T00:00:00.000Z' } : {}) }) as unknown as Task & Reflection;

const none = { tasks: [], reflections: [] };

describe('sectionRecoveryOf — disposable views', () => {
  it.each(['progress', 'timeline', 'recent-activity', 'sub-projects'])(
    'leaves %s out, whatever display config it carries',
    (type) => {
      expect(sectionRecoveryOf(section(type), none)).toEqual({ include: false });
      expect(sectionRecoveryOf(section(type, { milestoneId: 'm-1', text: 'not prose' }), none)).toEqual({ include: false });
      // A view's type says it owns nothing, so rows naming it are not its content.
      expect(sectionRecoveryOf(section(type), { tasks: [row(SECTION_ID)], reflections: [] })).toEqual({ include: false });
    },
  );
});

describe('sectionRecoveryOf — containers, by the rows still assigned', () => {
  it('includes a task list with live, archived and descendant rows, counting each once', () => {
    const content = { tasks: [row(SECTION_ID), row(SECTION_ID, true), row(SECTION_ID, true), row(OTHER_ID)], reflections: [row(SECTION_ID)] };
    expect(sectionRecoveryOf(section('task-list'), content)).toEqual({
      include: true,
      recovery: { kind: 'owned-content', ownedData: 'tasks', contentCount: 3 },
    });
  });

  it('includes a container holding only pre-archived rows — the dependency they need', () => {
    expect(sectionRecoveryOf(section('reflections'), { tasks: [], reflections: [row(SECTION_ID, true)] })).toEqual({
      include: true,
      recovery: { kind: 'owned-content', ownedData: 'reflections', contentCount: 1 },
    });
  });

  it.each(['task-list', 'reflections'])('leaves out an empty %s, including one emptied by reassignment', (type) => {
    expect(sectionRecoveryOf(section(type), none)).toEqual({ include: false });
    expect(sectionRecoveryOf(section(type), { tasks: [row(OTHER_ID)], reflections: [row(OTHER_ID)] })).toEqual({ include: false });
  });

  it('does not let a title or layout config make an empty container recoverable', () => {
    expect(sectionRecoveryOf({ ...section('task-list', { showCompleted: false }) }, none)).toEqual({ include: false });
  });
});

describe('sectionRecoveryOf — rich text is meaningful plain prose', () => {
  it.each([
    ['plain prose', 'Measure the hallway shelf'],
    ['literal markup, read as prose', '<p></p>'],
    ['text around whitespace', '\n  Call the plumber \t'],
    ['a zero-width space, which trim does not strip', '​'],
  ])('includes %s', (_label, text) => {
    expect(sectionRecoveryOf(section('rich-text', { text }), none)).toEqual({ include: true, recovery: { kind: 'config' } });
  });

  it.each([
    ['empty', ''],
    ['spaces', '   '],
    ['tabs and newlines', '\t\n\r\n'],
    ['Unicode whitespace', '  　﻿'],
  ])('leaves out %s text', (_label, text) => {
    expect(sectionRecoveryOf(section('rich-text', { text }), none)).toEqual({ include: false });
  });

  it.each([
    ['missing text', {}],
    ['non-string text', { text: 42 }],
    ['null text', { text: null }],
    ['an extra key beside empty text', { text: '', format: 'html' }],
    ['an extra key beside prose', { text: 'Notes', pinned: true }],
  ])('keeps %s conservatively, as unknown content', (_label, config) => {
    expect(sectionRecoveryOf(section('rich-text', config), none)).toEqual({ include: true, recovery: { kind: 'unknown' } });
  });
});

describe('sectionRecoveryOf — unknown types', () => {
  it.each(['calendar', 'constructor', 'toString', '__proto__'])(
    'keeps %s as unknown content and never infers ownership from rows',
    (type) => {
      expect(sectionRecoveryOf(section(type), none)).toEqual({ include: true, recovery: { kind: 'unknown' } });
      expect(sectionRecoveryOf(section(type), { tasks: [row(SECTION_ID)], reflections: [] })).toEqual({
        include: true,
        recovery: { kind: 'unknown' },
      });
    },
  );
});

describe('sectionRecoveryOf — purity', () => {
  it('reads frozen inputs without mutating them', () => {
    const frozenSection = Object.freeze({ ...section('rich-text', Object.freeze({ text: '  ' })) });
    const content = Object.freeze({ tasks: Object.freeze([Object.freeze(row(SECTION_ID))]), reflections: Object.freeze([]) });

    expect(sectionRecoveryOf(frozenSection, content)).toEqual({ include: false });
    expect(sectionRecoveryOf(Object.freeze(section('task-list')), content)).toMatchObject({ include: true });
    expect(frozenSection.config).toEqual({ text: '  ' });
  });
});
