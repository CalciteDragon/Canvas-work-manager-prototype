import { UserSchema, WorkspaceSchema, type User, type Workspace } from '@cwm/contracts';

const CREATED_AT = '2026-08-01T16:00:00.000Z';

const persona = (user: Parameters<typeof UserSchema.parse>[0], workspace: Parameters<typeof WorkspaceSchema.parse>[0]) => ({
  user: UserSchema.parse(user),
  workspace: WorkspaceSchema.parse(workspace),
});

export const PERSONAS: ReadonlyArray<Readonly<{ user: User; workspace: Workspace }>> = [
  persona(
    {
      id: 'user-demo',
      name: 'Demo User',
      avatar: '🧭',
      workspaceId: 'workspace-demo',
      preferences: {
        theme: 'dark',
        dashboardWidgets: [
          { id: 'widget-demo-today', type: 'today', position: 0, size: 'wide', config: {}, hidden: false },
          {
            id: 'widget-demo-projects',
            type: 'active_projects',
            position: 1,
            size: 'wide',
            config: {},
            hidden: false,
          },
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
        dashboardWidgets: [
          { id: 'widget-alex-upcoming', type: 'upcoming', position: 0, size: 'full', config: { days: 14 }, hidden: false },
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
];
