import { buildSeed } from '@cwm/prototype-data';
import { describe, expect, it } from 'vitest';
import { restoreEligibility } from './restore-eligibility';

describe('restoreEligibility', () => {
  it('selects archived owners only after their archived ancestors are restored', () => {
    const seed = buildSeed('nested-projects');
    const projects = seed.projects.map((project) =>
      project.id === 'project-renovation' || project.id === 'project-kitchen'
        ? { ...project, status: 'archived' as const }
        : project,
    );
    const eligibility = restoreEligibility(projects, seed.sections, seed.tasks);
    expect(eligibility.project('project-renovation' as never)).toBe(true);
    expect(eligibility.project('project-kitchen' as never)).toBe(false);
    expect(eligibility.project('project-cabinets' as never)).toBe(false);
  });

  it('requires an archived section and no archived project ancestor', () => {
    const seed = buildSeed('nested-projects');
    const section = seed.sections.find(({ id }) => id === 'section-project-renovation-tasks')!;
    const archived = { ...section, archivedAt: '2026-09-25T00:00:00.000Z' };
    const eligibility = restoreEligibility(seed.projects, [archived], seed.tasks);
    expect(eligibility.section(archived)).toBe(true);
    expect(eligibility.task(seed.tasks.find(({ sectionId }) => sectionId === section.id)!)).toBe(false);
  });
});
