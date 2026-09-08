import { describe, expect, it } from 'vitest';
import {
  ActivityQuerySchema,
  CreateProjectInputSchema,
  CreateReflectionInputSchema,
  CreateSectionInputSchema,
  CreateSectionShortcutInputSchema,
  CreateTaskInputSchema,
  MoveSectionInputSchema,
  MoveSectionShortcutInputSchema,
  ProjectPageQuerySchema,
  ProjectQuerySchema,
  RemoveSectionInputSchema,
  SectionQuerySchema,
  SectionShortcutQuerySchema,
  SetProjectPageEnabledInputSchema,
  TaskQuerySchema,
  UpdateProjectInputSchema,
  UpdateReflectionInputSchema,
  UpdateSectionInputSchema,
  UpdateSectionShortcutInputSchema,
  UpdateTaskInputSchema,
} from './inputs';

describe('CreateTaskInputSchema', () => {
  it('accepts §11 example verbatim', () => {
    const parsed = CreateTaskInputSchema.parse({
      projectId: 'project-a',
      title: 'Configure deployment',
      dueAt: '2026-08-27T17:00:00.000Z',
      priority: 'high',
    });
    expect(parsed).toMatchObject({ title: 'Configure deployment', priority: 'high' });
  });

  it('accepts the minimum: a project and a title', () => {
    expect(CreateTaskInputSchema.parse({ projectId: 'project-a', title: 'Ship it' }).status).toBeUndefined();
  });

  it('rejects an empty title', () => {
    expect(CreateTaskInputSchema.safeParse({ projectId: 'project-a', title: '' }).success).toBe(false);
  });

  it('ignores fields the caller does not get to set', () => {
    const parsed = CreateTaskInputSchema.parse({
      projectId: 'project-a',
      title: 'Ship it',
      id: 'task-mine',
      createdAt: '2020-01-01T00:00:00.000Z',
    });
    expect(parsed).not.toHaveProperty('id');
    expect(parsed).not.toHaveProperty('createdAt');
  });
});

describe('UpdateTaskInputSchema', () => {
  it('treats null as clear and undefined as leave alone (§11)', () => {
    expect(UpdateTaskInputSchema.parse({ dueAt: null }).dueAt).toBeNull();
    // toStrictEqual, not toEqual: toEqual treats an undefined-valued key as absent, which
    // is exactly the distinction under test.
    expect(UpdateTaskInputSchema.parse({ status: 'done' })).toStrictEqual({ status: 'done' });
  });

  it('accepts an empty patch — a no-op is legal here, not an error', () => {
    expect(UpdateTaskInputSchema.parse({})).toEqual({});
  });

  it('rejects a title that has been emptied rather than left alone', () => {
    expect(UpdateTaskInputSchema.safeParse({ title: '' }).success).toBe(false);
  });
});

describe('project inputs', () => {
  it('accepts a root create and a nested work-unit create', () => {
    expect(
      CreateProjectInputSchema.parse({ workspaceId: 'workspace-a', kind: 'root', name: 'Work Manager' }).name,
    ).toBe('Work Manager');
    // Matched rather than read through: only one branch of the union has a parent, which is
    // the point — a caller that wants one has to say which kind it is creating first.
    expect(
      CreateProjectInputSchema.parse({
        workspaceId: 'workspace-a',
        kind: 'subproject',
        name: 'Child',
        parentProjectId: 'project-a',
        targetDate: '2026-09-30',
      }),
    ).toMatchObject({ kind: 'subproject', parentProjectId: 'project-a' });
  });

  /**
   * §26, as an operation rather than a convention: the two creates are separate, so a caller
   * cannot make the wrong kind by omission, and a contradictory pair is a parse failure.
   */
  it('rejects a create with no kind, and a root create naming a parent', () => {
    expect(CreateProjectInputSchema.safeParse({ workspaceId: 'workspace-a', name: 'Nameless kind' }).success).toBe(
      false,
    );
    expect(
      CreateProjectInputSchema.safeParse({
        workspaceId: 'workspace-a',
        kind: 'root',
        name: 'Root',
        parentProjectId: 'project-a',
      }).success,
    ).toBe(false);
    expect(
      CreateProjectInputSchema.safeParse({ workspaceId: 'workspace-a', kind: 'subproject', name: 'Orphan' }).success,
    ).toBe(false);
  });

  /** Promotion and demotion are root/sub-project conversion, which the model does not do. */
  it('will not clear a parent, because that would change the project’s kind', () => {
    expect(UpdateProjectInputSchema.safeParse({ parentProjectId: null }).success).toBe(false);
  });

  it('clears a target date with null and rejects an unknown status', () => {
    expect(UpdateProjectInputSchema.parse({ targetDate: null }).targetDate).toBeNull();
    expect(UpdateProjectInputSchema.safeParse({ status: 'paused' }).success).toBe(false);
  });

  it('rejects a create with no name', () => {
    expect(CreateProjectInputSchema.safeParse({ workspaceId: 'workspace-a', kind: 'root' }).success).toBe(false);
  });
});

describe('reflection inputs', () => {
  it('accepts a body-only reflection and an optional completed-work subject', () => {
    expect(CreateReflectionInputSchema.parse({ projectId: 'project-a', body: 'Slow week.' }).title).toBeUndefined();
    expect(
      CreateReflectionInputSchema.parse({
        projectId: 'project-a',
        body: 'Slow week.',
        subject: { kind: 'task', id: 'task-a' },
      }).subject,
    ).toEqual({ kind: 'task', id: 'task-a' });
    expect(CreateReflectionInputSchema.safeParse({ projectId: 'project-a', body: '' }).success).toBe(false);
    expect(UpdateReflectionInputSchema.parse({ title: null }).title).toBeNull();
    expect(UpdateReflectionInputSchema.parse({ subject: null }).subject).toBeNull();
    expect(UpdateReflectionInputSchema.parse({ subject: { kind: 'subproject', id: 'project-child' } }).subject).toEqual({
      kind: 'subproject',
      id: 'project-child',
    });
    expect(UpdateReflectionInputSchema.safeParse({ body: '' }).success).toBe(false);
  });
});

describe('Slice 10 progress and timeline inputs', () => {
  it('accepts estimate writes and null clear', () => {
    expect(CreateTaskInputSchema.parse({ projectId: 'project-a', title: 'Sized', estimate: 5 }).estimate).toBe(5);
    expect(UpdateTaskInputSchema.parse({ estimate: null }).estimate).toBeNull();
    expect(UpdateTaskInputSchema.safeParse({ estimate: 0 }).success).toBe(false);
  });

  it('accepts canonical project progress writes', () => {
    expect(UpdateProjectInputSchema.parse({ progressFormula: 'manual', manualProgress: 25 })).toMatchObject({
      progressFormula: 'manual', manualProgress: 25,
    });
  });
});

describe('TaskQuerySchema', () => {
  it('accepts the filters §61 GET /api/tasks has to answer', () => {
    const parsed = TaskQuerySchema.parse({
      projectId: 'project-a',
      parentTaskId: 'task-1',
      status: ['todo', 'in_progress'],
      priority: ['high'],
      dueBefore: '2026-08-30T00:00:00.000Z',
      dueAfter: '2026-08-26T00:00:00.000Z',
      search: 'deploy',
    });
    expect(parsed.status).toEqual(['todo', 'in_progress']);
  });

  it('accepts an empty query — list everything', () => {
    expect(TaskQuerySchema.parse({})).toEqual({});
  });

  it('rejects an unknown status inside the filter array', () => {
    expect(TaskQuerySchema.safeParse({ status: ['todo', 'archived'] }).success).toBe(false);
  });
});

describe('ProjectQuerySchema', () => {
  it('accepts the §61 GET /api/projects filters and rejects a bad status', () => {
    expect(ProjectQuerySchema.parse({ workspaceId: 'workspace-a', status: ['active'] }).status).toEqual(['active']);
    expect(ProjectQuerySchema.safeParse({ status: ['paused'] }).success).toBe(false);
  });
});

describe('TaskQuerySchema includeArchived', () => {
  it('accepts the flag that opts archived tasks back in', () => {
    expect(TaskQuerySchema.parse({ includeArchived: true }).includeArchived).toBe(true);
  });

  it('leaves it absent by default — archived tasks are excluded', () => {
    expect(TaskQuerySchema.parse({}).includeArchived).toBeUndefined();
  });
});

describe('ActivityQuerySchema', () => {
  it('accepts the two filters GET /api/activity answers', () => {
    expect(ActivityQuerySchema.parse({ projectId: 'project-a', limit: 20 })).toEqual({
      projectId: 'project-a',
      limit: 20,
    });
  });

  it('accepts an empty query', () => {
    expect(ActivityQuerySchema.parse({})).toEqual({});
  });

  it('rejects a limit that is zero, negative, fractional, or past the cap', () => {
    for (const limit of [0, -1, 1.5, 201]) {
      expect(ActivityQuerySchema.safeParse({ limit }).success).toBe(false);
    }
  });
});

describe('the §31 section write inputs', () => {
  it('creates with a registry type alone, leaving the rest to the service', () => {
    expect(CreateSectionInputSchema.parse({ type: 'rich-text' })).toEqual({ type: 'rich-text' });
  });

  it('rejects an empty type and a column span outside the §27 presets', () => {
    expect(CreateSectionInputSchema.safeParse({ type: '' }).success).toBe(false);
    expect(CreateSectionInputSchema.safeParse({ type: 'rich-text', columnSpan: 7 }).success).toBe(false);
  });

  it('clears a frame title override with null and leaves it alone when absent', () => {
    expect(UpdateSectionInputSchema.parse({ title: null }).title).toBeNull();
    expect(UpdateSectionInputSchema.parse({}).title).toBeUndefined();
  });

  it('trims every incoming name and refuses a blank one, on create and on update', () => {
    // One shared `SectionTitleSchema`, so a person, HTTP and MCP all store the same
    // normalised override — a stored `" Backlog "` would render differently everywhere.
    expect(CreateSectionInputSchema.parse({ type: 'task-list', title: '  Backlog  ' }).title).toBe('Backlog');
    expect(UpdateSectionInputSchema.parse({ title: '  Backlog  ' }).title).toBe('Backlog');
    for (const title of ['', '   ', '\t\n']) {
      expect(CreateSectionInputSchema.safeParse({ type: 'task-list', title }).success).toBe(false);
      expect(UpdateSectionInputSchema.safeParse({ title }).success).toBe(false);
    }
  });

  it('replaces a config whole and refuses a config that is not an object', () => {
    expect(UpdateSectionInputSchema.parse({ config: { text: 'hello' } }).config).toEqual({ text: 'hello' });
    // `null` would be ambiguous between "clear it" and "a legitimate config value".
    for (const config of [null, 'text', []]) {
      expect(UpdateSectionInputSchema.safeParse({ config }).success).toBe(false);
    }
  });

  it('moves to a dense zero-based position only', () => {
    expect(MoveSectionInputSchema.parse({ position: 0 }).position).toBe(0);
    for (const position of [-1, 1.5]) {
      expect(MoveSectionInputSchema.safeParse({ position }).success).toBe(false);
    }
  });

  it('filters sections by project', () => {
    expect(SectionQuerySchema.parse({ projectId: 'project-a' }).projectId).toBe('project-a');
    expect(SectionQuerySchema.parse({})).toEqual({});
    // The root Archive projection is the one caller that asks for them; every other read is
    // live-only by default, which is what keeps an archived section off the canvas.
    expect(SectionQuerySchema.parse({ includeArchived: true }).includeArchived).toBe(true);
    expect(SectionQuerySchema.parse({}).includeArchived).toBeUndefined();
    expect(SectionQuerySchema.safeParse({ includeArchived: 'true' }).success).toBe(false);
  });
});

describe('the §27 shortcut placement inputs', () => {
  it('requires a destination page and source section, with a placement-local span', () => {
    expect(
      CreateSectionShortcutInputSchema.parse({
        pageId: 'page-home',
        sourceSectionId: 'section-source',
        columnSpan: 6,
      }),
    ).toEqual({ pageId: 'page-home', sourceSectionId: 'section-source', columnSpan: 6 });
  });

  it('rejects fields the caller cannot set and an incomplete create', () => {
    expect(CreateSectionShortcutInputSchema.safeParse({ sourceSectionId: 'section-source' }).success).toBe(false);
    expect(
      CreateSectionShortcutInputSchema.safeParse({
        pageId: 'page-home',
        sourceSectionId: 'section-source',
        position: 0,
      }).success,
    ).toBe(false);
    expect(
      CreateSectionShortcutInputSchema.safeParse({
        pageId: 'page-home',
        sourceSectionId: 'section-source',
        extra: true,
      }).success,
    ).toBe(false);
  });

  it('keeps update and move narrow, and queries by destination page', () => {
    expect(UpdateSectionShortcutInputSchema.parse({ collapsed: true, columnSpan: 4 })).toEqual({
      collapsed: true,
      columnSpan: 4,
    });
    expect(UpdateSectionShortcutInputSchema.safeParse({ sourceSectionId: 'section-other' }).success).toBe(false);
    expect(MoveSectionShortcutInputSchema.parse({ position: 0 })).toEqual({ position: 0 });
    expect(SectionShortcutQuerySchema.parse({ pageId: 'page-home' })).toEqual({ pageId: 'page-home' });
    expect(SectionShortcutQuerySchema.parse({})).toEqual({});
  });
});

describe('naming a container on the write inputs', () => {
  it('lets a create name its section, and leaves it to the service when absent', () => {
    expect(CreateTaskInputSchema.parse({ projectId: 'project-a', title: 'Ship it' }).sectionId).toBeUndefined();
    expect(
      CreateTaskInputSchema.parse({ projectId: 'project-a', title: 'Ship it', sectionId: 'section-1' }).sectionId,
    ).toBe('section-1');
    expect(
      CreateReflectionInputSchema.parse({ projectId: 'project-a', body: 'A week', sectionId: 'section-2' }).sectionId,
    ).toBe('section-2');
  });

  it('moves a task between containers — sectionId is not nullable, a row is always owned', () => {
    expect(UpdateTaskInputSchema.parse({ sectionId: 'section-9' }).sectionId).toBe('section-9');
    expect(UpdateTaskInputSchema.safeParse({ sectionId: null }).success).toBe(false);
  });

  it('carries a removal policy, and defaults to none so the caller is asked', () => {
    expect(RemoveSectionInputSchema.parse({})).toEqual({});
    expect(RemoveSectionInputSchema.parse({ policy: 'cascade' }).policy).toBe('cascade');
    expect(
      RemoveSectionInputSchema.parse({ policy: 'reassign', reassignToSectionId: 'section-2' }),
    ).toMatchObject({ policy: 'reassign', reassignToSectionId: 'section-2' });
    expect(RemoveSectionInputSchema.safeParse({ policy: 'delete' }).success).toBe(false);
  });
});

describe('page selection (§27, §26)', () => {
  it('lets a row write name the page it should land on, on either row kind', () => {
    expect(CreateTaskInputSchema.parse({ projectId: 'project-a', title: 'A', pageId: 'page-home' }).pageId)
      .toBe('page-home');
    expect(
      CreateReflectionInputSchema.parse({ projectId: 'project-a', body: 'A week', pageId: 'page-refl' }).pageId,
    ).toBe('page-refl');
  });

  it('leaves the page absent when nobody named one, so the service resolves the canonical page', () => {
    expect(CreateTaskInputSchema.parse({ projectId: 'project-a', title: 'A' }).pageId).toBeUndefined();
  });

  it('narrows a section list to one page', () => {
    expect(SectionQuerySchema.parse({ pageId: 'page-home' }).pageId).toBe('page-home');
    expect(SectionQuerySchema.parse({}).pageId).toBeUndefined();
  });

  it('addresses a toggle by page kind, because the first enable has no id yet', () => {
    expect(SetProjectPageEnabledInputSchema.parse({ kind: 'todos', enabled: true }))
      .toEqual({ kind: 'todos', enabled: true });
    expect(SetProjectPageEnabledInputSchema.safeParse({ kind: 'calendar', enabled: true }).success).toBe(false);
    // `enabled` is required: a toggle that did not say which way is not a toggle.
    expect(SetProjectPageEnabledInputSchema.safeParse({ kind: 'todos' }).success).toBe(false);
  });

  /**
   * `home` and `work` are accepted *here* on purpose. Refusing them at the parser would answer
   * "not a page kind", which is false; the service refuses them saying they cannot be disabled.
   */
  it('leaves the canonical kinds to the service to refuse, with a reason', () => {
    expect(SetProjectPageEnabledInputSchema.safeParse({ kind: 'home', enabled: false }).success).toBe(true);
  });

  it('filters pages by project, kind and enabled state', () => {
    expect(ProjectPageQuerySchema.parse({ projectId: 'project-a', kind: 'home', enabled: true }))
      .toEqual({ projectId: 'project-a', kind: 'home', enabled: true });
    expect(ProjectPageQuerySchema.parse({})).toEqual({});
  });
});
