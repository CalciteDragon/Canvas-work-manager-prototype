import { describe, expect, it } from 'vitest';
import { ReflectionSchema } from './reflection';

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

