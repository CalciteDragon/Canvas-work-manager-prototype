import { AgentPermissionSchema, type AgentPermission } from '@cwm/contracts';
import { PermissionDeniedError } from '@cwm/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { agent, buildHarness, OPEN_TASK, OPS_PROJECT, PROJECT, TASK_CONTAINER, VIEW_SECTION } from '../test/harness';

const ALL_PERMISSIONS = AgentPermissionSchema.options;

/**
 * One case per tool. `mutates` says which half of the store assertion applies; `verify` is
 * given the tool's result and the harness, and is where "it actually did the thing" lives.
 *
 * The suite iterates `registry.list()` and fails on any tool with no case, so a fifteenth
 * tool cannot arrive without a contract.
 */
interface ToolCase {
  input: unknown;
  mutates?: boolean;
  verify: (result: any, harness: ReturnType<typeof buildHarness>) => Promise<void> | void;
}

const CASES: Record<string, ToolCase> = {
  list_projects: {
    input: {},
    verify: (result) => {
      expect(result.map((project: { id: string }) => project.id)).toContain(PROJECT);
    },
  },
  get_project: {
    input: { projectId: PROJECT },
    verify: (result) => expect(result.name).toBe('Work Manager'),
  },
  create_project: {
    input: { kind: 'root', name: 'Agent-made project' },
    mutates: true,
    verify: async (result, harness) => {
      expect(result.name).toBe('Agent-made project');
      // The workspace is injected from the actor, never accepted from the caller.
      expect(result.workspaceId).toBe(agent().workspaceId);
      expect((await harness.services.projects.get(agent(['projects.read']), result.id)).name).toBe('Agent-made project');
    },
  },
  update_project: {
    input: { projectId: PROJECT, description: 'Rewritten by an agent.' },
    mutates: true,
    verify: async (result, harness) => {
      expect(result.description).toBe('Rewritten by an agent.');
      expect((await harness.services.projects.get(agent(['projects.read']), PROJECT)).description).toBe(
        'Rewritten by an agent.',
      );
    },
  },
  list_tasks: {
    input: { projectId: PROJECT },
    verify: (result) => expect(result.length).toBeGreaterThan(0),
  },
  get_task: {
    input: { taskId: OPEN_TASK },
    verify: (result) => expect(result.title).toBe('Document the tool input schemas'),
  },
  create_task: {
    input: { projectId: PROJECT, title: 'Wire the MCP transport' },
    mutates: true,
    verify: async (result, harness) => {
      expect(result.title).toBe('Wire the MCP transport');
      expect((await harness.services.tasks.get(agent(['tasks.read']), result.id)).status).toBe('todo');
    },
  },
  update_task: {
    // A value the fixture does not already hold: `task-agent-schema` is `todo`/`medium`.
    input: { taskId: OPEN_TASK, priority: 'high' },
    mutates: true,
    verify: async (result, harness) => {
      expect(result.priority).toBe('high');
      expect((await harness.services.tasks.get(agent(['tasks.read']), OPEN_TASK)).priority).toBe('high');
    },
  },
  complete_task: {
    // Not `task-agent-deployment`: completing an already-done task is idempotent and
    // records nothing, so a case pointed at it would pass having done nothing at all.
    input: { taskId: OPEN_TASK },
    mutates: true,
    verify: async (result, harness) => {
      expect(result.status).toBe('done');
      expect(result.completedAt).toBeDefined();
      expect((await harness.services.tasks.get(agent(['tasks.read']), OPEN_TASK)).status).toBe('done');
    },
  },
  list_reflections: {
    input: { projectId: OPS_PROJECT },
    verify: (result) => expect(result[0].title).toBe('Grants drift'),
  },
  add_reflection: {
    input: { projectId: PROJECT, body: 'The tool registry is easier to test than the transport.' },
    mutates: true,
    verify: async (result, harness) => {
      const listed = await harness.services.reflections.list(agent(['reflections.read']), PROJECT);
      expect(listed.map(({ id }) => id)).toContain(result.id);
    },
  },
  list_sections: {
    input: { projectId: PROJECT },
    verify: async (result, harness) => {
      expect(result.map((section: { type: string }) => section.type)).toEqual([
        'rich-text',
        'task-list',
        'recent-activity',
      ]);
      // An archived section has left the canvas, so it must leave the agent's view of the
      // canvas too — otherwise the agent and the person are looking at different projects.
      await harness.services.sections.remove(agent(['projects.write']), VIEW_SECTION);
      const after = await harness.registry.call('list_sections', { projectId: PROJECT }, agent(['projects.read']));
      expect((after as { id: string }[]).map(({ id }) => id)).not.toContain(VIEW_SECTION);
    },
  },
  create_section: {
    input: { projectId: PROJECT, type: 'progress' },
    mutates: true,
    verify: async (result, harness) => {
      expect(result).toMatchObject({ projectId: PROJECT, type: 'progress', position: 3 });
      const listed = await harness.services.sections.list(agent(['projects.read']), PROJECT);
      expect(listed.map(({ id }) => id)).toContain(result.id);
    },
  },
  update_section: {
    input: { sectionId: TASK_CONTAINER, title: 'This week' },
    mutates: true,
    verify: async (result, harness) => {
      expect(result.title).toBe('This week');
      expect((await harness.services.sections.get(agent(['projects.read']), TASK_CONTAINER)).title).toBe('This week');
    },
  },
  remove_section: {
    // A view: it owns nothing, so it needs no policy. The container case — a policy, and
    // the rows it settles — is asserted in the domain, where the rule lives.
    input: { sectionId: VIEW_SECTION },
    mutates: true,
    verify: async (result, harness) => {
      // The archived section itself, not a bare id: the agent can see `archivedAt` and know
      // the operation is undoable. It arrives from `projects.write` alone, so the tool has
      // not acquired a hidden `projects.read` requirement by reading the record back.
      expect(result).toMatchObject({ id: VIEW_SECTION });
      expect(result.archivedAt).toBeDefined();
      const listed = await harness.services.sections.list(agent(['projects.read']), PROJECT);
      expect(listed.map(({ id }) => id)).not.toContain(VIEW_SECTION);
    },
  },
  search_workspace: {
    input: { query: 'deployment' },
    verify: (result) => {
      expect(result.query).toBe('deployment');
      expect(result.hits.map((hit: { id: string }) => hit.id)).toContain('task-agent-deployment');
    },
  },
  get_upcoming_work: {
    input: {},
    verify: (result) => {
      expect(result.days).toBe(7);
      // `task-agent-triage` is due 2026-08-23, the day before the seed's simulated Monday.
      expect(result.overdue.map((task: { id: string }) => task.id)).toContain('task-agent-triage');
    },
  },
  get_dashboard_context: {
    input: {},
    verify: (result) => {
      expect(result.today.date).toBe('2026-08-24');
      expect(result.dailyDigest.source).toBe('prototype');
      expect(result.dailyDigest.lines.length).toBeGreaterThan(0);
    },
  },
};

describe('every §54 tool, on its success and permission-denied paths', () => {
  let harness: ReturnType<typeof buildHarness>;

  // A fresh store per case: `persistCalls` is a running counter, and the write cases leave
  // entities behind that a later read case would otherwise see.
  beforeEach(() => {
    harness = buildHarness();
  });

  it('has a contract case for every registered tool, and no case for a tool that is gone', () => {
    const registered = buildHarness()
      .registry.list()
      .map(({ name }) => name);

    expect(registered.filter((name) => !(name in CASES))).toEqual([]);
    // The other direction too: a renamed or deleted tool would otherwise leave its case
    // sitting here unused and unnoticed.
    expect(Object.keys(CASES).filter((name) => !registered.includes(name))).toEqual([]);
  });

  for (const tool of buildHarness().registry.list()) {
    const testCase = CASES[tool.name]!;

    describe(tool.name, () => {
      /**
       * The minimal grant, deliberately. A "sufficient" grant would pair with the denial
       * case to prove the declared permission *necessary* and never *sufficient* — a tool
       * whose service happened to assert a second permission would pass both halves. This
       * is the assertion that would have caught `search_workspace` needing three grants.
       */
      it(`succeeds with ${tool.permission} alone`, async () => {
        const result = await harness.registry.call(tool.name, testCase.input, agent([tool.permission]));

        await testCase.verify(result, harness);
      });

      it(testCase.mutates === true ? 'persists its change' : 'writes nothing', async () => {
        const before = harness.store.persistCalls;

        await harness.registry.call(tool.name, testCase.input, agent([tool.permission]));

        expect(harness.store.persistCalls > before).toBe(testCase.mutates === true);
      });

      it(`is denied without ${tool.permission}, however much else the connection holds`, async () => {
        const grant = ALL_PERMISSIONS.filter((permission) => permission !== tool.permission) as AgentPermission[];

        await expect(harness.registry.call(tool.name, testCase.input, agent(grant))).rejects.toThrow(
          expect.objectContaining({
            name: 'PermissionDeniedError',
            permission: tool.permission,
            connectionId: 'agent-claude',
          }),
        );
        expect(harness.store.persistCalls).toBe(0);
      });
    });
  }

  it('denies a connection holding nothing at all', async () => {
    await expect(harness.registry.call('list_tasks', {}, agent())).rejects.toThrow(PermissionDeniedError);
  });
});
