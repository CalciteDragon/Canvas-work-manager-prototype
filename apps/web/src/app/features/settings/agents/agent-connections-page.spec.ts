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
  // Slice 72 (W3-017): Revoke says which agent it revokes, and each agent's boxes are one group.
  it('names Revoke by its agent and groups the permissions under the agent', async () => {
    const { fixture } = await render(new FakeWorkManagerGateway({ agentConnections: [connection(), connection({ id: 'agent-codex', name: 'Codex' })] }));
    const cards = [...fixture.nativeElement.querySelectorAll('[data-agent-connection]')] as HTMLElement[];

    expect(cards.map((card) => card.querySelector('[data-agent-revoke]')?.getAttribute('aria-label'))).toEqual(['Revoke Claude', 'Revoke Codex']);
    for (const [index, name] of ['Claude', 'Codex'].entries()) {
      const fieldset = cards[index]!.querySelector('fieldset');
      expect(fieldset?.querySelector('legend')?.textContent).toContain(name);
      expect(fieldset?.querySelectorAll('[data-agent-permission]').length).toBeGreaterThan(0);
      expect(cards[index]!.querySelectorAll('[data-agent-permission]').length).toBe(fieldset?.querySelectorAll('[data-agent-permission]').length);
    }
  });

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

  /** §53 writes the label out in words, so the words have to be right. */
  it('says "1 minute ago", not "1 minutes ago"', async () => {
    const { fixture } = await render(
      new FakeWorkManagerGateway({
        agentConnections: [
          connection({ lastUsedAt: new Date(Date.now() - 90_000).toISOString() }),
          connection({ id: 'agent-cursor', name: 'Cursor', lastUsedAt: new Date(Date.now() - 25 * 3_600_000).toISOString() }),
        ],
      }),
    );

    const labels = [...fixture.nativeElement.querySelectorAll('[data-agent-last-used]')].map((node) =>
      (node as HTMLElement).textContent?.trim(),
    );
    expect(labels).toEqual(['Last used: 1 minute ago', 'Last used: 1 day ago']);
  });

  // Slice 75 (L4-005): a refused change is said in that connection's card, naming the permission
  // and the connection, beside the box that moved back. The page alert is for a failed load only.
  it('says a refused change in that connection’s card, linked from the box, and puts the box back', async () => {
    const { fixture, gateway } = await render(
      new FakeWorkManagerGateway({
        agentConnections: [connection(), connection({ id: 'agent-cursor', name: 'Cursor' })],
        failOn: {
          'agents.setPermissions': new GatewayError('permission_denied', 403, 'agent connections can only be managed by the person who owns them'),
        },
      }),
    );
    const cursor = fixture.nativeElement.querySelector('[data-connection-id="agent-cursor"]') as HTMLElement;
    const claude = fixture.nativeElement.querySelector('[data-connection-id="agent-claude"]') as HTMLElement;
    const cursorBox = cursor.querySelector('[data-permission="tasks.write"]') as HTMLInputElement;

    cursorBox.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const message = cursor.querySelector<HTMLElement>('[data-agent-permission-error] [data-failure-sentence]')!;
    expect(message.textContent?.trim()).toBe('Couldn’t change Modify tasks for Cursor. Try again.');
    expect(message.getAttribute('role')).toBe('alert');
    expect(cursorBox.getAttribute('aria-describedby')).toBe(message.id);
    // Slice 78: the reason waits behind a closed Details, outside the box's description.
    const details = cursor.querySelector<HTMLDetailsElement>('[data-agent-permission-error] details')!;
    expect(details.open).toBe(false);
    expect(details.textContent).toContain('agent connections can only be managed by the person who owns them');
    expect(claude.querySelector('[data-agent-permission-error]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-agents-error]')).toBeNull();
    // The grant on screen is still the one in force — the refused change was not applied
    // optimistically.
    expect(cursorBox.checked).toBe(true);

    gateway.options.failOn = {};
    cursorBox.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(cursor.querySelector('[data-agent-permission-error]')).toBeNull();
    expect(cursorBox.hasAttribute('aria-describedby')).toBe(false);
  });

  it('says so when the workspace has no connections, and names the seed that has some', async () => {
    const { fixture } = await render(new FakeWorkManagerGateway({ agentConnections: [] }));

    expect(text(fixture, '[data-agents-empty]')).toContain('agent-heavy');
  });

  it('reports a failed load in product words with Try again, instead of implying there are no connections (Slice 78)', async () => {
    const { fixture, gateway } = await render(
      new FakeWorkManagerGateway({ agentConnections: [connection()], failWith: new GatewayError('unreachable', 0, 'could not reach the prototype host') }),
    );
    const host = fixture.nativeElement as HTMLElement;

    expect(text(fixture, '[data-agents-error] [data-failure-sentence]')).toBe('Couldn’t reach your workspace, so your agent connections didn’t load.');
    expect(host.querySelector('[data-agents-error] [data-failure-sentence]')?.getAttribute('role')).toBe('alert');
    expect(host.querySelector('[data-agents-error] details')?.textContent).toContain('could not reach the prototype host');
    expect(host.querySelector('[data-agents-empty]')).toBeNull();
    expect(host.querySelector('[data-agents-pending]')).toBeNull();

    gateway.options.failWith = undefined;
    const tryAgain = host.querySelector<HTMLButtonElement>('[data-agents-error] [data-recovery]')!;
    expect(tryAgain.textContent?.trim()).toBe('Try again');
    tryAgain.click();
    fixture.detectChanges();
    expect(host.querySelector('[data-agents-error] [data-recovery]')?.getAttribute('aria-disabled')).toBe('true');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.querySelector('[data-agents-error]')).toBeNull();
    expect(host.querySelectorAll('[data-agent-connection]')).toHaveLength(1);
  });

  it('says a Revoke failure on the page with no Try again, and keeps the list (Slice 78)', async () => {
    const { fixture } = await render(
      new FakeWorkManagerGateway({ agentConnections: [connection()], failOn: { 'agents.revoke': new GatewayError('conflict', 409, 'already revoked elsewhere') } }),
    );
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('[data-agent-revoke]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(fixture, '[data-agents-revoke-error]')).toBe('already revoked elsewhere');
    expect(host.querySelector('[data-agents-revoke-error]')?.getAttribute('role')).toBe('alert');
    expect(host.querySelector('[data-recovery]')).toBeNull();
    expect(host.querySelector('[data-agents-error]')).toBeNull();
    expect(host.querySelectorAll('[data-agent-connection]')).toHaveLength(1);
  });
});
