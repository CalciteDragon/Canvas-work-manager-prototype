import { describe, expect, it } from 'vitest';
import { PrototypeDocumentSchema } from './document';
import { IdentitySchema, ThemeSchema, UserSchema, WorkspaceSchema } from './user';

const user = {
  id: 'user-a',
  name: 'Demo User',
  workspaceId: 'workspace-a',
  preferences: {
    theme: 'dark',
    dashboardWidgets: [
      { id: 'widget-1', type: 'today', position: 0, size: 'wide', config: {}, hidden: false },
    ],
  },
  createdAt: '2026-08-26T10:00:00.000Z',
};

const workspace = {
  id: 'workspace-a',
  name: 'Personal',
  ownerUserId: 'user-a',
  createdAt: '2026-08-26T10:00:00.000Z',
};

describe('UserSchema', () => {
  it('accepts a persona with an avatar and dashboard widgets (§17, §25)', () => {
    const parsed = UserSchema.parse({ ...user, avatar: 'https://example.test/demo.png' });
    expect(parsed.preferences.dashboardWidgets).toHaveLength(1);
  });

  it('rejects a user with no workspace', () => {
    const { workspaceId, ...withoutWorkspace } = user;
    expect(UserSchema.safeParse(withoutWorkspace).success).toBe(false);
  });

  it('rejects a theme outside §22 dark and light', () => {
    expect(ThemeSchema.options).toEqual(['dark', 'light']);
    expect(UserSchema.safeParse({ ...user, preferences: { ...user.preferences, theme: 'sepia' } }).success).toBe(false);
  });
});

describe('WorkspaceSchema', () => {
  it('accepts a workspace', () => {
    expect(WorkspaceSchema.parse(workspace).name).toBe('Personal');
  });

  it('rejects one with no owner', () => {
    const { ownerUserId, ...ownerless } = workspace;
    expect(WorkspaceSchema.safeParse(ownerless).success).toBe(false);
  });
});

describe('IdentitySchema', () => {
  it('composes the persona and their workspace (§18)', () => {
    const parsed = IdentitySchema.parse({ user, workspace });
    expect(parsed.user.id).toBe('user-a');
    expect(parsed.workspace.id).toBe('workspace-a');
  });

  it('rejects a bare user', () => {
    expect(IdentitySchema.safeParse(user).success).toBe(false);
  });

  it('is a response composite, not a stored collection (§14)', () => {
    expect(Object.keys(PrototypeDocumentSchema.shape)).not.toContain('identities');
  });
});
