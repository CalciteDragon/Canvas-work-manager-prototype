import { TestBed } from '@angular/core/testing';
import { AgentConnectionSchema, type AgentConnection } from '@cwm/contracts';
import { describe, expect, it } from 'vitest';
import { GatewayError } from '../../../core/gateway/gateway-error';
import { FakeWorkManagerGateway } from '../../../core/gateway/testing/fake-gateway';
import { WORK_MANAGER_GATEWAY } from '../../../core/gateway/work-manager-gateway';
import { AgentConnectionsPage } from './agent-connections-page';

const connection = (overrides: Record<string, unknown> = {}): AgentConnection =>
  AgentConnectionSchema.parse({
    id: 'agent-claude',
    userId: 'user-demo',
    name: 'Claude',
    permissions: ['projects.read', 'tasks.read', 'tasks.write'],
    revoked: false,
    createdAt: '2026-08-01T16:00:00.000Z',
    ...overrides,
  });

const render = async (gateway = new FakeWorkManagerGateway({ agentConnections: [connection()] })) => {
  TestBed.configureTestingModule({ providers: [{ provide: WORK_MANAGER_GATEWAY, useValue: gateway }] });
  const fixture = TestBed.createComponent(AgentConnectionsPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, gateway };
};

const boxes = (fixture: Awaited<ReturnType<typeof render>>['fixture']): HTMLInputElement[] =>
  [...fixture.nativeElement.querySelectorAll('[data-agent-permission]')] as HTMLInputElement[];

const box = (fixture: Awaited<ReturnType<typeof render>>['fixture'], permission: string): HTMLInputElement =>
  fixture.nativeElement.querySelector(`[data-permission="${permission}"]`) as HTMLInputElement;

const text = (fixture: Awaited<ReturnType<typeof render>>['fixture'], selector: string): string =>
  (fixture.nativeElement.querySelector(selector) as HTMLElement | null)?.textContent?.trim() ?? '';

describe('AgentConnectionsPage (§53)', () => {
  it('renders a card per connection with the grid checked to match the grant', async () => {
    const { fixture } = await render();

    expect(fixture.nativeElement.querySelectorAll('[data-agent-connection]')).toHaveLength(1);
    // All seven of `AgentPermissionSchema`, not §53's five: a grid that hid two grants the
    // connection actually holds would be a permission UI that lies.
    expect(boxes(fixture)).toHaveLength(7);
    expect(box(fixture, 'tasks.write').checked).toBe(true);
    expect(box(fixture, 'projects.write').checked).toBe(false);
  });

  /**
   * The slice's *Done when*, at the component boundary: what leaves the page when the box
   * is unticked is the whole reduced grant.
   */
  it('sends the entire remaining permission set when Modify tasks is unticked', async () => {
    const { fixture, gateway } = await render();

    box(fixture, 'tasks.write').click();
    await fixture.whenStable();

    expect(gateway.calls.at(-1)).toEqual({
      method: 'agents.setPermissions',
      argument: { id: 'agent-claude', permissions: ['projects.read', 'tasks.read'] },
    });
  });

  it('sends the widened set when a box is ticked on', async () => {
    const { fixture, gateway } = await render();

    box(fixture, 'reflections.write').click();
    await fixture.whenStable();

    expect(gateway.calls.at(-1)).toMatchObject({
      argument: { permissions: ['projects.read', 'tasks.read', 'tasks.write', 'reflections.write'] },
    });
  });

  it('revokes, then shows the connection as revoked and stops offering the grid', async () => {
    const { fixture, gateway } = await render();

    (fixture.nativeElement.querySelector('[data-agent-revoke]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(gateway.calls.at(-1)).toEqual({ method: 'agents.revoke', argument: 'agent-claude' });
    expect(text(fixture, '[data-agent-revoked]')).toBe('Revoked');
    expect(boxes(fixture).every((input) => input.disabled)).toBe(true);
  });

  it('says how long ago the connection was used, and says when it never was', async () => {
    const fourMinutesAgo = new Date(Date.now() - 4 * 60_000).toISOString();
    const { fixture } = await render(
      new FakeWorkManagerGateway({
        agentConnections: [
          connection({ lastUsedAt: fourMinutesAgo }),
          connection({ id: 'agent-cursor', name: 'Cursor', lastUsedAt: undefined }),
        ],
      }),
    );

    const labels = [...fixture.nativeElement.querySelectorAll('[data-agent-last-used]')].map((node) =>
      (node as HTMLElement).textContent?.trim(),
    );
    expect(labels).toEqual(['Last used: 4 minutes ago', 'Never used']);
  });

  it('shows the host’s error rather than an empty grid when a write is refused', async () => {
    const { fixture } = await render(
      new FakeWorkManagerGateway({
        agentConnections: [connection()],
        failOn: {
          'agents.setPermissions': new GatewayError('permission_denied', 403, 'agent connections can only be managed by the person who owns them'),
        },
      }),
    );

    box(fixture, 'tasks.write').click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(fixture, '[data-agents-error]')).toBe(
      'agent connections can only be managed by the person who owns them',
    );
    // The grant on screen is still the one in force — the refused change was not applied
    // optimistically.
    expect(box(fixture, 'tasks.write').checked).toBe(true);
  });

  it('says so when the workspace has no connections, and names the seed that has some', async () => {
    const { fixture } = await render(new FakeWorkManagerGateway({ agentConnections: [] }));

    expect(text(fixture, '[data-agents-empty]')).toContain('agent-heavy');
  });

  it('reports a failed load instead of implying there are no connections', async () => {
    const { fixture } = await render(
      new FakeWorkManagerGateway({ failWith: new GatewayError('unreachable', 0, 'could not reach the prototype host') }),
    );

    expect(text(fixture, '[data-agents-error]')).toBe('could not reach the prototype host');
    expect(fixture.nativeElement.querySelector('[data-agents-empty]')).toBeNull();
  });
});
