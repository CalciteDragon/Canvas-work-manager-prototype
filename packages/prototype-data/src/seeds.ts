import {
  ActivityEventSchema,
  AgentConnectionSchema,
  MilestoneSchema,
  ProjectPageSchema,
  ProjectSchema,
  ProjectSectionSchema,
  PrototypeDocumentSchema,
  ReflectionSchema,
  SCHEMA_VERSION,
  SectionShortcutSchema,
  TaskSchema,
  type ActivityEvent,
  type AgentConnection,
  type Milestone,
  type Project,
  type ProjectPage,
  type PrototypeDocument,
  type Reflection,
  type SectionShortcut,
  type Task,
} from '@cwm/contracts';
import { PERSONAS } from './personas';

export const SEED_NAMES = [
  'empty',
  'personal-workspace',
  'busy-week',
  'nested-projects',
  'overdue-chaos',
  'agent-heavy',
] as const;
export type SeedName = (typeof SEED_NAMES)[number];

/** Monday morning: scenario-relative overdue/upcoming checks stay deterministic. */
export const SEED_NOW = '2026-08-24T16:00:00.000Z';
const CREATED_AT = '2026-08-01T16:00:00.000Z';
const UPDATED_AT = '2026-08-21T20:00:00.000Z';
const DEMO_WORKSPACE_ID = PERSONAS[0]!.workspace.id;

const project = (
  id: string,
  name: string,
  options: {
    description?: string;
    icon?: string;
    workspaceId?: string;
    status?: 'planning' | 'active' | 'on_hold' | 'completed' | 'archived';
    targetDate?: string;
    completedAt?: string;
    parentProjectId?: string;
    projectLayoutMode?: 'flow' | 'grid';
    progressFormula?: 'count' | 'weighted' | 'manual';
    manualProgress?: number;
  } = {},
): Project =>
  ProjectSchema.parse({
    id,
    workspaceId: options.workspaceId ?? DEMO_WORKSPACE_ID,
    // A parent is what makes something a unit of work rather than a workspace (§26).
    kind: options.parentProjectId === undefined ? 'root' : 'subproject',
    name,
    description: options.description,
    icon: options.icon,
    status: options.status ?? 'active',
    targetDate: options.targetDate,
    completedAt: options.completedAt,
    parentProjectId: options.parentProjectId,
    projectLayoutMode: options.projectLayoutMode ?? 'flow',
    progressFormula: options.progressFormula ?? 'count',
    manualProgress: options.manualProgress,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  });

const task = (
  id: string,
  projectId: string,
  title: string,
  options: {
    description?: string;
    status?: 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled';
    priority?: 'low' | 'medium' | 'high';
    startAt?: string;
    dueAt?: string;
    completedAt?: string;
    estimate?: number;
    parentTaskId?: string;
    archivedAt?: string;
    archivedWithSectionId?: string;
    archivedWithTaskId?: string;
    /** Override for a project whose task list is not the conventional one below. */
    sectionId?: string;
  } = {},
): Task =>
  TaskSchema.parse({
    id,
    projectId,
    // Every seeded row names the container that renders it — a task that no section owns
    // cannot exist any more. `projectCanvas` gives every canvas this id, and
    // `seeds.test.ts` asserts the reference resolves rather than trusting the convention.
    sectionId: options.sectionId ?? tasksSectionId(projectId),
    title,
    description: options.description,
    status: options.status ?? 'todo',
    priority: options.priority ?? 'medium',
    startAt: options.startAt,
    dueAt: options.dueAt,
    completedAt: options.completedAt,
    estimate: options.estimate,
    parentTaskId: options.parentTaskId,
    archivedAt: options.archivedAt,
    archivedWithSectionId: options.archivedWithSectionId,
    archivedWithTaskId: options.archivedWithTaskId,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  });

/** The container ids `projectCanvas` and `sliceTenCanvas` create, by convention. */
const tasksSectionId = (projectId: string) => `section-${projectId}-tasks`;
const reflectionsSectionId = (projectId: string) => `section-${projectId}-reflections`;

/**
 * A project's canonical page id, by the same convention (§26–27). Derived rather than passed
 * so that no seed builder has to thread a page id through every section it writes — and so
 * `seeds.test.ts` can assert the reference resolves rather than trusting the convention.
 */
const canonicalPageId = (projectId: string) => `page-${projectId}`;

const canonicalPage = (project: Project): ProjectPage =>
  ProjectPageSchema.parse({
    id: canonicalPageId(project.id),
    projectId: project.id,
    kind: project.kind === 'root' ? 'home' : 'work',
    enabled: true,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  });

const section = (
  id: string,
  projectId: string,
  type: string,
  position: number,
  config: object = {},
  options: { pageId?: string; title?: string; archivedAt?: string } = {},
) =>
  ProjectSectionSchema.parse({
    id,
    projectId,
    pageId: options.pageId ?? canonicalPageId(projectId),
    type,
    title: options.title,
    position,
    columnSpan: 12,
    collapsed: false,
    config,
    archivedAt: options.archivedAt,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  });

const agentConnection = (
  id: string,
  name: string,
  permissions: string[],
  options: { revoked?: boolean; lastUsedAt?: string } = {},
): AgentConnection =>
  AgentConnectionSchema.parse({
    id,
    userId: PERSONAS[0]!.user.id,
    name,
    permissions,
    revoked: options.revoked ?? false,
    createdAt: CREATED_AT,
    lastUsedAt: options.lastUsedAt,
  });

/**
 * §57's events, seeded rather than generated, because a feed is only worth designing
 * against once it has history. `validateDocumentIntegrity` is strict about these: the
 * target must exist, `projectId` must match the target's project, and an agent event's
 * connection must be owned by someone in the event's workspace — so every id below names
 * something this seed actually creates.
 */
const activityEvent = (
  id: string,
  createdAt: string,
  actor: 'user' | 'agent' | 'system',
  action: string,
  entityType: 'project' | 'section' | 'task' | 'milestone' | 'reflection' | 'agent_connection',
  entityId: string,
  summary: string,
  options: { projectId?: string; agentConnectionId?: string } = {},
): ActivityEvent =>
  ActivityEventSchema.parse({
    id,
    workspaceId: DEMO_WORKSPACE_ID,
    actor,
    actorUserId: actor === 'user' ? PERSONAS[0]!.user.id : undefined,
    actorAgentConnectionId: actor === 'agent' ? options.agentConnectionId : undefined,
    action,
    entityType,
    entityId,
    projectId: options.projectId,
    summary,
    createdAt,
  });

/**
 * The canvas every seeded project gets: a Rich Text brief above its Task List (§30's first
 * two section types). Positions are dense *within a project* — the canvas orders by
 * `position`, and a gap or a repeat has no meaning any renderer could use.
 */
const projectCanvas = (projectId: string, brief: string) => [
  section(`section-${projectId}-brief`, projectId, 'rich-text', 0, { text: brief }),
  section(tasksSectionId(projectId), projectId, 'task-list', 1),
];

const sliceTenCanvas = (projectId: string, brief: string) => [
  ...projectCanvas(projectId, brief),
  section(`section-${projectId}-sub-projects`, projectId, 'sub-projects', 2),
  section(`section-${projectId}-progress`, projectId, 'progress', 3),
  section(reflectionsSectionId(projectId), projectId, 'reflections', 4),
  section(`section-${projectId}-timeline`, projectId, 'timeline', 5),
];

const sectionShortcut = (
  id: string,
  pageId: string,
  sourceSectionId: string,
  position: number,
  options: { columnSpan?: 12 | 8 | 6 | 4; collapsed?: boolean } = {},
): SectionShortcut =>
  SectionShortcutSchema.parse({
    id,
    pageId,
    sourceSectionId,
    position,
    columnSpan: options.columnSpan ?? 12,
    collapsed: options.collapsed ?? false,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  });

const milestone = (
  id: string,
  projectId: string,
  title: string,
  targetDate: string,
  status: 'upcoming' | 'achieved' | 'missed' = 'upcoming',
): Milestone =>
  MilestoneSchema.parse({ id, projectId, title, targetDate, status, createdAt: CREATED_AT, updatedAt: UPDATED_AT });

const reflection = (
  id: string,
  projectId: string,
  body: string,
  options: {
    title?: string;
    prompt?: string;
    createdAt?: string;
    updatedAt?: string;
    sectionId?: string;
    subject?: { kind: 'task' | 'subproject'; id: string };
    archivedAt?: string;
    archivedWithSectionId?: string;
  } = {},
): Reflection =>
  ReflectionSchema.parse({
    id,
    projectId,
    sectionId: options.sectionId ?? reflectionsSectionId(projectId),
    subject: options.subject,
    title: options.title,
    body,
    prompt: options.prompt,
    archivedAt: options.archivedAt,
    archivedWithSectionId: options.archivedWithSectionId,
    createdAt: options.createdAt ?? CREATED_AT,
    updatedAt: options.updatedAt ?? options.createdAt ?? CREATED_AT,
  });

const document = (collections: Partial<PrototypeDocument> = {}): PrototypeDocument =>
  PrototypeDocumentSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    users: PERSONAS.map(({ user }) => structuredClone(user)),
    workspaces: PERSONAS.map(({ workspace }) => structuredClone(workspace)),
    projects: [],
    sections: [],
    sectionShortcuts: [],
    tasks: [],
    milestones: [],
    reflections: [],
    activityEvents: [],
    agentConnections: [],
    ...collections,
    // Derived from the projects rather than written per seed: every project has exactly one
    // canonical page (§26), so listing them by hand would be six chances to forget one.
    projectPages: collections.projectPages ?? (collections.projects ?? []).map(canonicalPage),
  });

const empty = (): PrototypeDocument => document();

const personalWorkspace = (): PrototypeDocument => {
  const projects = [
    project('project-personal', 'Personal workspace', {
      description: 'A calm place for household plans and small personal goals.',
      icon: '🏡',
      targetDate: '2026-09-30',
    }),
  ];
  return document({
    projects,
    sections: projectCanvas(projects[0]!.id, 'Keep this light. One or two things a week is plenty.'),
    tasks: [
      task('task-personal-plan', projects[0]!.id, 'Plan the week', {
        status: 'in_progress',
        priority: 'high',
        startAt: '2026-08-24T16:00:00.000Z',
        dueAt: '2026-08-24T23:00:00.000Z',
      }),
      task('task-personal-groceries', projects[0]!.id, 'Pick up groceries', {
        priority: 'medium',
        dueAt: '2026-08-26T01:00:00.000Z',
      }),
      task('task-personal-shelf', projects[0]!.id, 'Measure the hallway shelf', { priority: 'low' }),
    ],
  });
};

const busyWeek = (): PrototypeDocument => {
  const projects = [
    project('project-launch', 'Website launch', {
      description: 'Ship the refreshed product site this week.',
      icon: '🚀',
      targetDate: '2026-08-28',
      projectLayoutMode: 'grid',
      progressFormula: 'weighted',
    }),
    project('project-home', 'Home reset', {
      description: 'Small maintenance and organization jobs.',
      icon: '🧰',
      targetDate: '2026-09-05',
    }),
    project('project-course', 'TypeScript course', {
      description: 'Finish the advanced modules before September.',
      icon: '📚',
      targetDate: '2026-08-31',
    }),
    project('project-launch-comms', 'Launch communications', {
      description: 'Coordinate the announcement and customer follow-up.',
      icon: '📣',
      parentProjectId: 'project-launch',
      targetDate: '2026-08-27',
    }),
  ];
  return document({
    projects,
    sections: [
      ...sliceTenCanvas(projects[0]!.id, 'Launch week. Copy is signed off; QA and analytics are the risk.'),
      ...projectCanvas(projects[1]!.id, 'Small household jobs. Nothing here is urgent.'),
      ...projectCanvas(projects[2]!.id, 'Two modules left before the end of the month.'),
    ],
    tasks: [
      task('task-launch-copy', projects[0]!.id, 'Approve homepage copy', {
        status: 'done',
        priority: 'high',
        dueAt: '2026-08-21T20:00:00.000Z',
        completedAt: '2026-08-21T18:30:00.000Z',
        estimate: 2,
      }),
      task('task-launch-qa', projects[0]!.id, 'Run launch QA', {
        status: 'in_progress',
        priority: 'high',
        startAt: '2026-08-24T16:00:00.000Z',
        dueAt: '2026-08-25T23:00:00.000Z',
        estimate: 5,
      }),
      task('task-launch-analytics', projects[0]!.id, 'Verify analytics events', {
        status: 'blocked',
        priority: 'medium',
        dueAt: '2026-08-23T23:00:00.000Z',
        estimate: 3,
      }),
      task('task-home-filter', projects[1]!.id, 'Replace air filter', {
        priority: 'medium',
        dueAt: '2026-08-27T02:00:00.000Z',
      }),
      task('task-home-donate', projects[1]!.id, 'Drop off donation box', {
        priority: 'low',
        dueAt: '2026-08-29T19:00:00.000Z',
      }),
      task('task-course-module', projects[2]!.id, 'Complete type-system module', {
        status: 'in_progress',
        priority: 'high',
        startAt: '2026-08-22T17:00:00.000Z',
        dueAt: '2026-08-24T22:00:00.000Z',
      }),
      task('task-course-exercises', projects[2]!.id, 'Submit practice exercises', {
        priority: 'medium',
        dueAt: '2026-08-26T22:00:00.000Z',
      }),
      task('task-course-notes', projects[2]!.id, 'Organize module notes', { priority: 'low' }),
    ],
    milestones: [milestone('milestone-launch-code-freeze', projects[0]!.id, 'Code freeze', '2026-08-26')],
    reflections: [
      reflection('reflection-launch-risk', projects[0]!.id, 'Analytics validation is blocked on production access.', {
        title: 'Launch risk check',
        prompt: "What's blocked?",
        createdAt: '2026-08-22T18:00:00.000Z',
      }),
      reflection('reflection-launch-win', projects[0]!.id, 'Copy approval landed early and reduced the QA surface.', {
        prompt: 'What went well?',
        createdAt: '2026-08-21T19:00:00.000Z',
      }),
    ],
  });
};

const nestedProjects = (): PrototypeDocument => {
  const projects = [
    project('project-renovation', 'Home renovation', { icon: '🏗️', targetDate: '2026-12-15' }),
    project('project-kitchen', 'Kitchen', {
      parentProjectId: 'project-renovation',
      icon: '🍳',
      targetDate: '2026-09-04',
    }),
    project('project-cabinets', 'Cabinets', {
      parentProjectId: 'project-kitchen',
      icon: '🗄️',
      targetDate: '2026-10-15',
    }),
    project('project-garden', 'Garden', {
      parentProjectId: 'project-renovation',
      icon: '🌿',
      targetDate: '2026-11-20',
      status: 'completed',
      completedAt: '2026-08-22T17:00:00.000Z',
    }),
    project('project-legacy', 'Legacy attic', {
      parentProjectId: 'project-renovation',
      icon: '🏚️',
      status: 'archived',
    }),
    project('project-legacy-child', 'Legacy shelving', {
      parentProjectId: 'project-legacy',
      icon: '🪵',
      targetDate: '2026-10-01',
    }),
    project('project-alex-private', 'Alex private plan', {
      workspaceId: 'workspace-alex',
      icon: '🔒',
    }),
  ];
  const renovation = projects[0]!;
  const kitchen = projects[1]!;
  const garden = projects[3]!;
  const homePageId = canonicalPageId(renovation.id);
  const todosPageId = `page-${renovation.id}-todos`;
  const archivePageId = `page-${renovation.id}-archive`;
  const reflectionsPageId = `page-${renovation.id}-reflections`;
  const kitchenTaskSectionId = tasksSectionId(kitchen.id);
  const renovationReflectionsPageSectionId = `section-${renovation.id}-reflections-page`;

  return document({
    projects,
    projectPages: [
      canonicalPage(renovation),
      ProjectPageSchema.parse({
        id: todosPageId,
        projectId: renovation.id,
        kind: 'todos',
        enabled: true,
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT,
      }),
      ProjectPageSchema.parse({
        id: archivePageId,
        projectId: renovation.id,
        kind: 'archive',
        enabled: true,
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT,
      }),
      ProjectPageSchema.parse({
        id: reflectionsPageId,
        projectId: renovation.id,
        kind: 'reflections',
        enabled: true,
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT,
      }),
      ...projects.slice(1).map(canonicalPage),
    ],
    sections: [
      ...sliceTenCanvas(renovation.id, 'Whole-house plan. Kitchen first, garden in the spring.'),
      section(`section-${renovation.id}-recent-activity`, renovation.id, 'recent-activity', 6),
      section(`section-${renovation.id}-archived-notes`, renovation.id, 'rich-text', 7, { text: 'Old attic notes' }, {
        archivedAt: '2026-08-20T16:00:00.000Z',
      }),
      ...sliceTenCanvas(kitchen.id, 'Appliances and finishes before cabinets are ordered.'),
      section(`section-${kitchen.id}-recent-activity`, kitchen.id, 'recent-activity', 6),
      ...projectCanvas(garden.id, 'Autumn planting only. Structural work waits for next year.'),
      section(renovationReflectionsPageSectionId, renovation.id, 'reflections', 0, {}, { pageId: reflectionsPageId }),
    ],
    tasks: [
      task('task-renovation-budget', renovation.id, 'Confirm renovation budget', {
        priority: 'high',
        startAt: '2026-08-24T16:00:00.000Z',
        dueAt: '2026-09-04T23:00:00.000Z',
      }),
      // Deliberately inserted in reverse id order: the derived Todos page must apply §34's
      // equal-instant kind/id tie-break rather than trusting JSON insertion order.
      task('task-renovation-equal-z', renovation.id, 'Confirm tile samples', {
        priority: 'medium',
        dueAt: '2026-09-04T23:59:59.999Z',
      }),
      task('task-renovation-equal-a', renovation.id, 'Confirm tap samples', {
        priority: 'medium',
        dueAt: '2026-09-04T23:59:59.999Z',
      }),
      task('task-renovation-done', renovation.id, 'Approve the lighting plan', {
        status: 'done',
        dueAt: '2026-09-04T23:59:59.999Z',
        completedAt: '2026-08-23T17:00:00.000Z',
      }),
      task('task-renovation-cancelled', renovation.id, 'Compare a cancelled quote', {
        status: 'cancelled',
        dueAt: '2026-09-05T23:00:00.000Z',
      }),
      task('task-renovation-undated', renovation.id, 'Call the salvage yard'),
      task('task-renovation-archived', renovation.id, 'Old permit copy', {
        archivedAt: '2026-08-20T16:00:00.000Z',
      }),
      task('task-kitchen-appliances', kitchen.id, 'Choose appliance finishes', {
        startAt: '2026-09-08T16:00:00.000Z',
        dueAt: '2026-09-18T23:00:00.000Z',
      }),
      task('task-kitchen-completed', kitchen.id, 'Approve the cabinet measurements', {
        status: 'done',
        completedAt: '2026-08-22T18:00:00.000Z',
      }),
      task('task-garden-plan', garden.id, 'Sketch autumn planting plan', { priority: 'low' }),
    ],
    milestones: [
      milestone('milestone-renovation-design-lock', renovation.id, 'Design locked', '2026-09-25'),
      milestone('milestone-kitchen-cabinet-order', kitchen.id, 'Cabinet order placed', '2026-10-02'),
    ],
    reflections: [
      reflection('reflection-renovation-general', renovation.id, 'Kitchen decisions need to land before garden work begins.', {
        title: 'Sequence matters',
        prompt: 'What should happen next?',
        createdAt: '2026-08-23T17:00:00.000Z',
        sectionId: renovationReflectionsPageSectionId,
      }),
      reflection('reflection-renovation-task', renovation.id, 'The lighting plan finally feels settled.', {
        title: 'A clear decision',
        subject: { kind: 'task', id: 'task-renovation-done' },
        createdAt: '2026-08-24T17:00:00.000Z',
        sectionId: renovationReflectionsPageSectionId,
      }),
      reflection('reflection-renovation-project', renovation.id, 'Garden work is ready for its next season.', {
        title: 'Garden handoff',
        subject: { kind: 'subproject', id: garden.id },
        createdAt: '2026-08-22T17:00:00.000Z',
        sectionId: renovationReflectionsPageSectionId,
      }),
    ],
    sectionShortcuts: [
      sectionShortcut('shortcut-renovation-kitchen-tasks', homePageId, kitchenTaskSectionId, 7, { columnSpan: 8 }),
      sectionShortcut('shortcut-renovation-kitchen-reflections', homePageId, `section-${kitchen.id}-reflections`, 8),
      sectionShortcut('shortcut-renovation-reflections-page', homePageId, renovationReflectionsPageSectionId, 9, { columnSpan: 8 }),
      sectionShortcut('shortcut-renovation-garden-brief', homePageId, `section-${garden.id}-brief`, 10),
    ],
    agentConnections: [
      agentConnection('agent-claude', 'Claude', [
        'projects.read',
        'projects.write',
        'tasks.read',
        'tasks.write',
        'reflections.read',
        'reflections.write',
        'workspace.read',
      ], { lastUsedAt: '2026-08-24T15:32:00.000Z' }),
      agentConnection('agent-cursor', 'Cursor', ['projects.read', 'tasks.read']),
    ],
  });
};

const overdueChaos = (): PrototypeDocument => {
  const projects = [
    project('project-client-migration', 'Client migration', {
      description: 'A deliberately stressed workspace for overdue and blocked-state design.',
      icon: '🚨',
      targetDate: '2026-08-21',
    }),
    project('project-admin', 'Life admin', { icon: '📬', targetDate: '2026-08-31' }),
  ];
  return document({
    projects,
    sections: [
      ...projectCanvas(projects[0]!.id, 'Behind on every milestone. Triage before adding anything new.'),
      ...projectCanvas(projects[1]!.id, 'The pile of things that have no other home.'),
    ],
    tasks: [
      task('task-chaos-export', projects[0]!.id, 'Export legacy records', {
        status: 'in_progress',
        priority: 'high',
        dueAt: '2026-08-18T23:00:00.000Z',
      }),
      task('task-chaos-map', projects[0]!.id, 'Finish field mapping', {
        status: 'blocked',
        priority: 'high',
        dueAt: '2026-08-19T23:00:00.000Z',
      }),
      task('task-chaos-review', projects[0]!.id, 'Review rejected rows', {
        priority: 'medium',
        dueAt: '2026-08-20T23:00:00.000Z',
      }),
      task('task-chaos-notify', projects[0]!.id, 'Notify stakeholders', {
        priority: 'high',
        dueAt: '2026-08-21T18:00:00.000Z',
      }),
      task('task-chaos-backup', projects[0]!.id, 'Verify backup', {
        status: 'done',
        priority: 'medium',
        dueAt: '2026-08-17T18:00:00.000Z',
        completedAt: '2026-08-17T17:30:00.000Z',
      }),
      task('task-admin-insurance', projects[1]!.id, 'Renew renter insurance', {
        priority: 'medium',
        dueAt: '2026-08-27T20:00:00.000Z',
      }),
    ],
  });
};

/**
 * §16's `agent-heavy`. The workspace §57's own example describes — a project called Work
 * Manager with a task called "Configure deployment" — so the feed can be designed against
 * the picture the spec draws.
 *
 * Three connections cover the three states §53 has to render: a read-write agent that has
 * been used, a read-only agent that never has, and a revoked one. The permission split is
 * what makes a denial reachable without editing anything first.
 */
const agentHeavy = (): PrototypeDocument => {
  const projects = [
    project('project-work-manager', 'Work Manager', {
      description: 'The workspace the agents actually work in.',
      icon: '🤖',
      targetDate: '2026-09-11',
    }),
    project('project-agent-ops', 'Agent operations', {
      description: 'Connection hygiene, permission reviews, and what the agents got wrong.',
      icon: '🔌',
      targetDate: '2026-09-30',
    }),
  ];

  return document({
    projects,
    sections: [
      ...projectCanvas(projects[0]!.id, 'Most of this board is maintained by agents. Watch what they do.'),
      section(`section-${projects[0]!.id}-activity`, projects[0]!.id, 'recent-activity', 2),
      ...projectCanvas(projects[1]!.id, 'Review what each connection is allowed to do before widening anything.'),
      section(reflectionsSectionId(projects[1]!.id), projects[1]!.id, 'reflections', 2),
    ],
    tasks: [
      task('task-agent-deployment', projects[0]!.id, 'Configure deployment', {
        status: 'done',
        priority: 'high',
        dueAt: '2026-08-24T18:00:00.000Z',
        completedAt: '2026-08-24T15:32:00.000Z',
        estimate: 3,
      }),
      task('task-agent-retries', projects[0]!.id, 'Add retry budget to the sync job', {
        status: 'in_progress',
        priority: 'high',
        startAt: '2026-08-24T16:00:00.000Z',
        dueAt: '2026-08-25T23:00:00.000Z',
      }),
      task('task-agent-schema', projects[0]!.id, 'Document the tool input schemas', {
        priority: 'medium',
        dueAt: '2026-08-27T23:00:00.000Z',
      }),
      task('task-agent-triage', projects[0]!.id, 'Triage the overnight agent errors', {
        status: 'blocked',
        priority: 'medium',
        dueAt: '2026-08-23T23:00:00.000Z',
      }),
      task('task-ops-review', projects[1]!.id, 'Review the Claude connection permissions', {
        priority: 'high',
        dueAt: '2026-08-26T20:00:00.000Z',
      }),
      task('task-ops-rotate', projects[1]!.id, 'Retire the unused connection', { priority: 'low' }),
    ],
    reflections: [
      reflection(
        'reflection-agent-scope',
        projects[1]!.id,
        'The read-only connection has been idle for a fortnight. Either it earns its grant or it goes.',
        { title: 'Grants drift', prompt: 'What should happen next?', createdAt: '2026-08-23T18:00:00.000Z' },
      ),
    ],
    agentConnections: [
      agentConnection('agent-claude', 'Claude', [
        'projects.read',
        'tasks.read',
        'tasks.write',
        'reflections.read',
        'reflections.write',
        'workspace.read',
      ], {
        lastUsedAt: '2026-08-24T15:32:00.000Z',
      }),
      agentConnection('agent-cursor', 'Cursor', ['projects.read', 'tasks.read']),
      agentConnection('agent-old', 'Retired assistant', ['projects.read'], { revoked: true }),
    ],
    activityEvents: [
      activityEvent(
        'activity-agent-1',
        '2026-08-20T16:00:00.000Z',
        'user',
        'project.created',
        'project',
        projects[0]!.id,
        'Created "Work Manager"',
        { projectId: projects[0]!.id },
      ),
      activityEvent(
        'activity-agent-2',
        '2026-08-21T09:15:00.000Z',
        'agent',
        'task.created',
        'task',
        'task-agent-schema',
        'Created "Document the tool input schemas"',
        { projectId: projects[0]!.id, agentConnectionId: 'agent-claude' },
      ),
      activityEvent(
        'activity-agent-3',
        '2026-08-22T11:40:00.000Z',
        'user',
        'task.updated',
        'task',
        'task-agent-retries',
        'Updated "Add retry budget to the sync job"',
        { projectId: projects[0]!.id },
      ),
      activityEvent(
        'activity-agent-4',
        '2026-08-23T08:05:00.000Z',
        'agent',
        'task.updated',
        'task',
        'task-agent-triage',
        'Updated "Triage the overnight agent errors"',
        { projectId: projects[0]!.id, agentConnectionId: 'agent-claude' },
      ),
      activityEvent(
        'activity-agent-5',
        '2026-08-23T18:00:00.000Z',
        'user',
        'reflection.created',
        'reflection',
        'reflection-agent-scope',
        'Created "Grants drift"',
        { projectId: projects[1]!.id },
      ),
      // A system event: no actor id at all, which is the third badge §57 asks the feed to
      // distinguish and the one nothing else in the prototype produces yet.
      activityEvent(
        'activity-agent-6',
        '2026-08-24T06:00:00.000Z',
        'system',
        'agent_connection.revoked',
        'agent_connection',
        'agent-old',
        'Revoked "Retired assistant" after 30 days unused',
      ),
      activityEvent(
        'activity-agent-7',
        '2026-08-24T15:32:00.000Z',
        'agent',
        'task.completed',
        'task',
        'task-agent-deployment',
        'Completed "Configure deployment"',
        { projectId: projects[0]!.id, agentConnectionId: 'agent-claude' },
      ),
      activityEvent(
        'activity-agent-8',
        '2026-08-24T15:45:00.000Z',
        'user',
        'agent_connection.updated',
        'agent_connection',
        'agent-cursor',
        'Updated permissions for "Cursor"',
      ),
    ],
  });
};

const builders: Record<SeedName, () => PrototypeDocument> = {
  empty,
  'personal-workspace': personalWorkspace,
  'busy-week': busyWeek,
  'nested-projects': nestedProjects,
  'overdue-chaos': overdueChaos,
  'agent-heavy': agentHeavy,
};

export const isSeedName = (value: string): value is SeedName => (SEED_NAMES as readonly string[]).includes(value);

export const buildSeed = (seedName: SeedName): PrototypeDocument => structuredClone(builders[seedName]());
