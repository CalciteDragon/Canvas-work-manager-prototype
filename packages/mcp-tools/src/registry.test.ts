import { AgentPermissionSchema } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SPEC_TOOL_NAMES } from './index';
import { agent, buildHarness, FOREIGN_PROJECT, PROJECT } from '../test/harness';

const registry = buildHarness().registry;

describe('the tool registry', () => {
  it('registers exactly the twenty tools the spec and the canvas ask for', () => {
    const registered = registry.list().map(({ name }) => name);

    // Both directions: a missing tool and an extra one are different defects, and a
    // subset assertion would catch only the first.
    expect([...registered].sort()).toEqual([...SPEC_TOOL_NAMES].sort());
    // §54's fourteen, plus the four section tools
    // docs/decisions/2026-09-sections-own-their-data.md adds, plus §54's two page tools.
    // §54 names two more page tools — `get_project_todos` and `get_project_archive` — which
    // project pages that do not exist yet and arrive with them in Slices 25.5 and 25.6.
    expect(registered).toHaveLength(20);
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

  /**
   * §30's capability table, reached the way an agent reaches it. The domain owns the rule;
   * this asserts the refusal survives the transport-free registry rather than being a UI
   * affordance an agent can route around.
   */
  it('refuses a task container on a Reflections page, through the tools an agent has', async () => {
    const harness = buildHarness();
    const page = (await harness.registry.call(
      'set_project_page_enabled',
      { projectId: PROJECT, kind: 'reflections', enabled: true },
      agent(['projects.write']),
    )) as { id: string };

    await expect(
      harness.registry.call(
        'create_section',
        { projectId: PROJECT, type: 'task-list', pageId: page.id },
        agent(['projects.write']),
      ),
    ).rejects.toThrow(/does not hold task-list sections/);

    // The container the page *does* hold still goes on.
    await expect(
      harness.registry.call(
        'create_section',
        { projectId: PROJECT, type: 'reflections', pageId: page.id },
        agent(['projects.write']),
      ),
    ).resolves.toMatchObject({ pageId: page.id, type: 'reflections' });
  });

  it('answers not found for another workspace’s project and page', async () => {
    const harness = buildHarness();
    const foreignPage = (await harness.registry.call(
      'list_project_pages',
      { projectId: FOREIGN_PROJECT },
      agent(['projects.read']),
    ).then(
      () => undefined,
      (error: unknown) => error,
    )) as Error;

    expect(foreignPage.message).toMatch(/not found/i);
    await expect(
      harness.registry.call(
        'create_section',
        { projectId: PROJECT, type: 'reflections', pageId: 'page-nobody-has' },
        agent(['projects.write']),
      ),
    ).rejects.toThrow(/not found/i);
  });

  it('refuses a sub-project page toggle, and refuses disabling Home', async () => {
    const harness = buildHarness();
    const subproject = (await harness.registry.call(
      'create_project',
      { kind: 'subproject', parentProjectId: PROJECT, name: 'A unit of work' },
      agent(['projects.write']),
    )) as { id: string };

    await expect(
      harness.registry.call(
        'set_project_page_enabled',
        { projectId: subproject.id, kind: 'todos', enabled: true },
        agent(['projects.write']),
      ),
    ).rejects.toThrow(/one work canvas and no pages to configure/);
    await expect(
      harness.registry.call(
        'set_project_page_enabled',
        { projectId: PROJECT, kind: 'home', enabled: false },
        agent(['projects.write']),
      ),
    ).rejects.toThrow(/required and cannot be disabled/);
  });
});
