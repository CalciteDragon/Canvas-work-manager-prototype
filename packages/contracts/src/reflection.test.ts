import { describe, expect, it } from 'vitest';
import type { TaskId } from './ids';
import { ReflectionSchema, ReflectionSubjectSchema, type ReflectionSubject } from './reflection';

const reflection = {
  id: 'reflection-1',
  projectId: 'project-a',
  sectionId: 'section-1',
  body: 'Deployment work took the whole week.',
  createdAt: '2026-08-26T10:00:00.000Z',
  updatedAt: '2026-08-26T10:00:00.000Z',
};

describe('ReflectionSchema', () => {
  it('accepts an untitled reflection — the title is optional (§36)', () => {
    expect(ReflectionSchema.parse(reflection).title).toBeUndefined();
  });

  it('accepts a titled, prompted reflection', () => {
    const parsed = ReflectionSchema.parse({
      ...reflection,
      title: 'Week 34',
      prompt: "What's blocked?",
    });
    expect(parsed).toMatchObject({ title: 'Week 34', prompt: "What's blocked?" });
  });

  it('rejects an empty body', () => {
    expect(ReflectionSchema.safeParse({ ...reflection, body: '' }).success).toBe(false);
  });

  it('requires the container section that owns the row', () => {
    const { sectionId, ...orphan } = reflection;
    expect(ReflectionSchema.safeParse(orphan).success).toBe(false);
  });

  it('accepts either a task or a sub-project as an optional subject (§36)', () => {
    expect(ReflectionSchema.parse({ ...reflection, subject: { kind: 'task', id: 'task-1' } }).subject).toEqual({
      kind: 'task',
      id: 'task-1',
    });
    expect(ReflectionSchema.parse({ ...reflection, subject: { kind: 'subproject', id: 'project-child' } }).subject).toEqual({
      kind: 'subproject',
      id: 'project-child',
    });
  });

  it('rejects an unknown kind, a missing id, and an empty id', () => {
    expect(ReflectionSubjectSchema.safeParse({ kind: 'milestone', id: 'milestone-1' }).success).toBe(false);
    expect(ReflectionSubjectSchema.safeParse({ kind: 'task' }).success).toBe(false);
    expect(ReflectionSubjectSchema.safeParse({ kind: 'task', id: '' }).success).toBe(false);
  });

  it('keeps task and sub-project id brands distinct at the type level', () => {
    // Branded ids are a compile-time distinction; the runtime schema only sees non-empty strings.
    expect(ReflectionSubjectSchema.safeParse({ kind: 'subproject', id: 'task-1' }).success).toBe(true);
    const taskId = 'task-1' as TaskId;
    const subject: ReflectionSubject = { kind: 'task', id: taskId };
    expect(subject.kind).toBe('task');
    // @ts-expect-error A task id cannot occupy the sub-project branch.
    const wrongKind: ReflectionSubject = { kind: 'subproject', id: taskId };
    expect(wrongKind.kind).toBe('subproject');
  });
});

describe('ReflectionSchema archive marker', () => {
  it('accepts a row archived with its section and leaves the marker absent otherwise', () => {
    expect(
      ReflectionSchema.parse({
        ...reflection,
        archivedAt: '2026-09-02T06:13:32.422Z',
        archivedWithSectionId: 'section-1',
      }).archivedWithSectionId,
    ).toBe('section-1');
    expect(ReflectionSchema.parse(reflection).archivedWithSectionId).toBeUndefined();
  });
});
