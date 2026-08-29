import { AgentPermissionSchema } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SPEC_TOOL_NAMES } from './index';
import { buildHarness } from '../test/harness';

const registry = buildHarness().registry;

describe('the tool registry', () => {
  it('registers exactly the fourteen tools §54 lists', () => {
    const registered = registry.list().map(({ name }) => name);

    // Both directions: a missing tool and an extra one are different defects, and a
    // subset assertion would catch only the first.
    expect([...registered].sort()).toEqual([...SPEC_TOOL_NAMES].sort());
    expect(registered).toHaveLength(14);
  });

  it('gives every tool a unique name and a description an agent could choose on', () => {
    const names = registry.list().map(({ name }) => name);

    expect(new Set(names).size).toBe(names.length);
    for (const tool of registry.list()) {
      expect(tool.description.length, tool.name).toBeGreaterThan(20);
    }
  });

  it('declares only permissions that exist', () => {
    for (const tool of registry.list()) {
      expect(AgentPermissionSchema.safeParse(tool.permission).success, tool.name).toBe(true);
    }
  });

  it('converts every input schema to JSON Schema, which is what Slice 15 will publish', () => {
    for (const tool of registry.list()) {
      expect(() => z.toJSONSchema(tool.inputSchema), tool.name).not.toThrow();
    }
  });

  it('finds a registered tool and returns undefined for anything else', () => {
    expect(registry.find('create_task')?.permission).toBe('tasks.write');
    expect(registry.find('drop_database')).toBeUndefined();
  });
});
