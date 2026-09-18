import { describe, expect, it } from 'vitest';
import { familyOfOperationKind, OperationKindSchema } from './operation-receipt';
import {
  FamilyToolPermissionSchema,
  historyToolPermission,
  OPERATION_FAMILY_PERMISSION,
  StaticToolPermissionSchema,
  ToolPermissionSchema,
} from './tool-permissions';

describe('tool permission metadata', () => {
  it('keeps the singular and plural keys for a static tool', () => {
    const declaration = StaticToolPermissionSchema.parse({
      kind: 'static',
      permission: 'tasks.write',
      permissions: ['tasks.write'],
    });
    expect([declaration.permission, declaration.permissions]).toEqual(['tasks.write', ['tasks.write']]);
  });

  it('publishes one grant per operation family for the two history tools', () => {
    expect(historyToolPermission()).toEqual({
      kind: 'family',
      families: { section: 'projects.write', task: 'tasks.write', reflection: 'reflections.write' },
    });
  });

  it('omits the misleading singular and conjunctive keys from a family declaration', () => {
    const declaration = historyToolPermission() as Record<string, unknown>;
    expect(declaration).not.toHaveProperty('permission');
    expect(declaration).not.toHaveProperty('permissions');
  });

  it('is one discriminated shape, so a declaration cannot be half of each', () => {
    expect(ToolPermissionSchema.safeParse({ kind: 'static', permission: 'tasks.write', permissions: [], families: {} }).success).toBe(false);
    expect(ToolPermissionSchema.safeParse({ kind: 'family', families: { section: 'projects.write' } }).success).toBe(false);
    expect(ToolPermissionSchema.safeParse({ permission: 'tasks.write' }).success).toBe(false);
  });

  it('rejects a grant that is not an AgentPermission', () => {
    expect(
      FamilyToolPermissionSchema.safeParse({
        kind: 'family',
        families: { section: 'projects.write', task: 'everything', reflection: 'reflections.write' },
      }).success,
    ).toBe(false);
  });
});

describe('operation families', () => {
  it('maps every operation kind to a family with a grant', () => {
    for (const kind of OperationKindSchema.options) {
      expect(OPERATION_FAMILY_PERMISSION[familyOfOperationKind(kind)]).toBeDefined();
    }
  });

  it('places the twelve kinds in the three families', () => {
    const families = OperationKindSchema.options.map(familyOfOperationKind);
    expect(families.filter((family) => family === 'section')).toHaveLength(4);
    expect(families.filter((family) => family === 'task')).toHaveLength(4);
    expect(families.filter((family) => family === 'reflection')).toHaveLength(4);
  });
});
