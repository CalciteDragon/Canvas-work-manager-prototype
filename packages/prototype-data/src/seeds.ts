import {
  ProjectSchema,
  ProjectSectionSchema,
  PrototypeDocumentSchema,
  SCHEMA_VERSION,
  TaskSchema,
  type Project,
  type PrototypeDocument,
  type Task,
} from '@cwm/contracts';
import { PERSONAS } from './personas';

export const SEED_NAMES = [
  'empty',
  'personal-workspace',
  'busy-week',
  'nested-projects',
  'overdue-chaos',
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
    status?: 'planning' | 'active' | 'on_hold' | 'completed' | 'archived';
    targetDate?: string;
    parentProjectId?: string;
    projectLayoutMode?: 'flow' | 'grid';
  } = {},
): Project =>
  ProjectSchema.parse({
    id,
    workspaceId: DEMO_WORKSPACE_ID,
    name,
    description: options.description,
    icon: options.icon,
    status: options.status ?? 'active',
    targetDate: options.targetDate,
    parentProjectId: options.parentProjectId,
    projectLayoutMode: options.projectLayoutMode ?? 'flow',
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
  } = {},
): Task =>
  TaskSchema.parse({
    id,
    projectId,
    title,
    description: options.description,
    status: options.status ?? 'todo',
    priority: options.priority ?? 'medium',
    startAt: options.startAt,
    dueAt: options.dueAt,
    completedAt: options.completedAt,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  });

const taskListSection = (id: string, projectId: string, position = 0) =>
  ProjectSectionSchema.parse({
    id,
    projectId,
    type: 'task-list',
    position,
    columnSpan: 12,
    collapsed: false,
    config: {},
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  });

const document = (collections: Partial<PrototypeDocument> = {}): PrototypeDocument =>
  PrototypeDocumentSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    users: PERSONAS.map(({ user }) => structuredClone(user)),
    workspaces: PERSONAS.map(({ workspace }) => structuredClone(workspace)),
    projects: [],
    sections: [],
    tasks: [],
    milestones: [],
    reflections: [],
    activityEvents: [],
    agentConnections: [],
    ...collections,
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
    sections: [taskListSection('section-personal-tasks', projects[0]!.id)],
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
  ];
  return document({
    projects,
    sections: projects.map((item, position) => taskListSection(`section-${item.id}-tasks`, item.id, position)),
    tasks: [
      task('task-launch-copy', projects[0]!.id, 'Approve homepage copy', {
        status: 'done',
        priority: 'high',
        dueAt: '2026-08-21T20:00:00.000Z',
        completedAt: '2026-08-21T18:30:00.000Z',
      }),
      task('task-launch-qa', projects[0]!.id, 'Run launch QA', {
        status: 'in_progress',
        priority: 'high',
        startAt: '2026-08-24T16:00:00.000Z',
        dueAt: '2026-08-25T23:00:00.000Z',
      }),
      task('task-launch-analytics', projects[0]!.id, 'Verify analytics events', {
        status: 'blocked',
        priority: 'medium',
        dueAt: '2026-08-23T23:00:00.000Z',
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
  });
};

const nestedProjects = (): PrototypeDocument => {
  const projects = [
    project('project-renovation', 'Home renovation', { icon: '🏗️', targetDate: '2026-12-15' }),
    project('project-kitchen', 'Kitchen', { parentProjectId: 'project-renovation', icon: '🍳' }),
    project('project-cabinets', 'Cabinets', { parentProjectId: 'project-kitchen', icon: '🗄️' }),
    project('project-garden', 'Garden', { parentProjectId: 'project-renovation', icon: '🌿' }),
  ];
  return document({
    projects,
    sections: projects.map((item) => taskListSection(`section-${item.id}-tasks`, item.id)),
    tasks: [
      task('task-renovation-budget', projects[0]!.id, 'Confirm renovation budget', { priority: 'high' }),
      task('task-kitchen-appliances', projects[1]!.id, 'Choose appliance finishes'),
      task('task-cabinets-samples', projects[2]!.id, 'Order cabinet samples', {
        dueAt: '2026-08-28T20:00:00.000Z',
      }),
      task('task-garden-plan', projects[3]!.id, 'Sketch autumn planting plan', { priority: 'low' }),
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
    sections: projects.map((item) => taskListSection(`section-${item.id}-tasks`, item.id)),
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

const builders: Record<SeedName, () => PrototypeDocument> = {
  empty,
  'personal-workspace': personalWorkspace,
  'busy-week': busyWeek,
  'nested-projects': nestedProjects,
  'overdue-chaos': overdueChaos,
};

export const isSeedName = (value: string): value is SeedName => (SEED_NAMES as readonly string[]).includes(value);

export const buildSeed = (seedName: SeedName): PrototypeDocument => structuredClone(builders[seedName]());
