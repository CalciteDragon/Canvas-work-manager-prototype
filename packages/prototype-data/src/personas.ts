import { UserSchema, WorkspaceSchema, type User, type Workspace } from '@cwm/contracts';

const CREATED_AT = '2026-08-01T16:00:00.000Z';

type DeepReadonly<T> = T extends (...arguments_: never[]) => unknown
  ? T
  : T extends readonly unknown[]
    ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

const deepFreeze = <T>(value: T): DeepReadonly<T> => {
  if (value !== null && typeof value === 'object') {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
};

const persona = (user: Parameters<typeof UserSchema.parse>[0], workspace: Parameters<typeof WorkspaceSchema.parse>[0]) => ({
  user: UserSchema.parse(user),
  workspace: WorkspaceSchema.parse(workspace),
});

export const PERSONAS: DeepReadonly<ReadonlyArray<Readonly<{ user: User; workspace: Workspace }>>> = deepFreeze([
  persona(
    {
      id: 'user-demo',
      name: 'Demo User',
      avatar: '🧭',
      workspaceId: 'workspace-demo',
      preferences: {
        theme: 'dark',
        // Slice 11's six widgets, laid out so `/app` is worth looking at with no
        // configuration: the day first, then the week, then the AI-shaped commentary.
        dashboardWidgets: [
          { id: 'widget-demo-today', type: 'today', position: 0, size: 'wide', config: {}, hidden: false },
          { id: 'widget-demo-fact', type: 'fun_fact', position: 1, size: 'medium', config: {}, hidden: false },
          { id: 'widget-demo-upcoming', type: 'upcoming', position: 2, size: 'medium', config: { days: 7 }, hidden: false },
          { id: 'widget-demo-digest', type: 'daily_digest', position: 3, size: 'medium', config: {}, hidden: false },
          {
            id: 'widget-demo-projects',
            type: 'active_projects',
            position: 4,
            size: 'wide',
            config: {},
            hidden: false,
          },
          { id: 'widget-demo-recent', type: 'recent_progress', position: 5, size: 'medium', config: { days: 7 }, hidden: false },
          // Slice 13's tile. Demo User carries it so §24's agent activity is visible with
          // no configuration; Alex and Sam deliberately do not, which keeps "switch persona
          // changes the dashboard" true.
          { id: 'widget-demo-agents', type: 'recent_agent_activity', position: 6, size: 'wide', config: {}, hidden: false },
        ],
      },
      createdAt: CREATED_AT,
    },
    {
      id: 'workspace-demo',
      name: 'Demo User Workspace',
      ownerUserId: 'user-demo',
      createdAt: CREATED_AT,
    },
  ),
  persona(
    {
      id: 'user-alex',
      name: 'Alex',
      avatar: '🌤️',
      workspaceId: 'workspace-alex',
      preferences: {
        theme: 'light',
        // A deliberately different layout: §17's personas exist so "switch persona" changes
        // something, and a fortnight horizon with no digest is a real alternative shape.
        dashboardWidgets: [
          { id: 'widget-alex-upcoming', type: 'upcoming', position: 0, size: 'full', config: { days: 14 }, hidden: false },
          { id: 'widget-alex-today', type: 'today', position: 1, size: 'medium', config: {}, hidden: false },
        ],
      },
      createdAt: CREATED_AT,
    },
    {
      id: 'workspace-alex',
      name: 'Alex Workspace',
      ownerUserId: 'user-alex',
      createdAt: CREATED_AT,
    },
  ),
  persona(
    {
      id: 'user-sam',
      name: 'Sam',
      avatar: '🌱',
      workspaceId: 'workspace-sam',
      preferences: {
        theme: 'dark',
        dashboardWidgets: [
          { id: 'widget-sam-calendar', type: 'calendar', position: 0, size: 'medium', config: {}, hidden: true },
          { id: 'widget-sam-digest', type: 'daily_digest', position: 1, size: 'small', config: {}, hidden: false },
        ],
      },
      createdAt: CREATED_AT,
    },
    {
      id: 'workspace-sam',
      name: 'Sam Workspace',
      ownerUserId: 'user-sam',
      createdAt: CREATED_AT,
    },
  ),
]);
