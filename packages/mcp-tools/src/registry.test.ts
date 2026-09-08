import { AgentPermissionSchema } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SPEC_TOOL_NAMES } from './index';
import { requiredPermissions } from './tool';
import { agent, buildHarness, FOREIGN_PROJECT, OPEN_TASK, PROJECT } from '../test/harness';

const registry = buildHarness().registry;

describe('the tool registry', () => {
  it('registers exactly the thirty-three tools the spec and the canvas ask for', () => {
    const registered = registry.list().map(({ name }) => name);

    // Both directions: a missing tool and an extra one are different defects, and a
    // subset assertion would catch only the first.
    expect([...registered].sort()).toEqual([...SPEC_TOOL_NAMES].sort());
    // §54's fourteen, plus the four section tools, five page tools (including the journal),
    // three shortcut tools, and the eight canonical archive/recovery tools from Slice 25.6.
    expect(registered).toHaveLength(33);
    // The sorted comparison above catches membership; this catches a shortcut tool being
    // spread in a different position from the declared registry order.
    expect(registered).toEqual([...SPEC_TOOL_NAMES]);
  });

  it('gives every tool a unique name and a description an agent could choose on', () => {
    const names = registry.list().map(({ name }) => name);

    expect(new Set(names).size).toBe(names.length);
    for (const tool of registry.list()) {
      expect(tool.description.length, tool.name).toBeGreaterThan(20);
    }
  });

  it('declares only permissions that exist, additional grants included', () => {
    for (const tool of registry.list()) {
      for (const permission of requiredPermissions(tool)) {
        expect(AgentPermissionSchema.safeParse(permission).success, tool.name).toBe(true);
      }
      // A tool that named the same grant twice would make `tools/list` say something the
      // permission model does not.
      expect(new Set(requiredPermissions(tool)).size, tool.name).toBe(requiredPermissions(tool).length);
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

/**
 * §34's promise that "completing one there and completing it here are the same operation",
 * checked from the agent's side: Todos is a read, and the write is the canonical tool with the
 * canonical grant. Reading the chronology buys no ability to change it.
 */
describe('completing work an agent found on Todos (§34, §53)', () => {
  const READ_ONLY = ['projects.read', 'tasks.read'] as const;

  it('lets a read-only agent see the chronology and refuses both completions', async () => {
    const harness = buildHarness();
    const unit = (await harness.registry.call(
      'create_project',
      { kind: 'subproject', parentProjectId: PROJECT, name: 'A unit of work' },
      agent(['projects.write']),
    )) as { id: string; status: string };

    const before = (await harness.registry.call('get_project_todos', { projectId: PROJECT }, agent([...READ_ONLY]))) as {
      items: { kind: string; task?: { id: string; status: string } }[];
    };
    expect(before.items.some((item) => item.kind === 'task' && item.task?.id === OPEN_TASK)).toBe(true);

    await expect(
      harness.registry.call('complete_task', { taskId: OPEN_TASK }, agent([...READ_ONLY])),
    ).rejects.toThrow(/tasks\.write/);
    await expect(
      harness.registry.call('update_project', { projectId: unit.id, status: 'completed' }, agent([...READ_ONLY])),
    ).rejects.toThrow(/projects\.write/);

    // Unchanged canonical records, read back through the canonical tools.
    expect(((await harness.registry.call('get_task', { taskId: OPEN_TASK }, agent(['tasks.read']))) as { status: string }).status).toBe('todo');
    expect(((await harness.registry.call('get_project', { projectId: unit.id }, agent(['projects.read']))) as { status: string }).status).toBe(unit.status);
  });

  it('shows the canonical completion on the next read of the chronology', async () => {
    const harness = buildHarness();

    await harness.registry.call('complete_task', { taskId: OPEN_TASK }, agent(['tasks.write']));

    const after = (await harness.registry.call('get_project_todos', { projectId: PROJECT }, agent([...READ_ONLY]))) as {
      items: { kind: string; task?: { id: string; status: string; completedAt?: string } }[];
    };
    const row = after.items.find((item) => item.kind === 'task' && item.task?.id === OPEN_TASK);

    // Still on the list, and carrying the canonical timestamp rather than leaving it (§34).
    expect(row?.task?.status).toBe('done');
    expect(row?.task?.completedAt).toBeDefined();
  });
});
