import type { AgentConnectionId } from '@cwm/contracts';

/**
 * §51's local development credentials, verbatim in spelling: the spec writes
 * `Authorization: Bearer prototype-user-a-readwrite`, so that is the string a reader of
 * the spec can paste and have work.
 *
 * **These tokens have no security value.** They are fixture data — the reason they live
 * here beside the seeds rather than on `AgentConnectionSchema` is that §52's record has no
 * token field, and a secret-shaped member on a shared contract invites production thinking
 * about something §80 says will never be built. The host resolves a token to a connection
 * id and then reads the *live* connection, so revocation and permission edits take effect
 * on the next call (§53).
 *
 * A token whose connection is absent from the loaded seed simply fails to authenticate,
 * which is the honest answer: `empty` has no connections, so no agent can act in it.
 */
export const PROTOTYPE_AGENT_TOKENS: Readonly<Record<string, AgentConnectionId>> = {
  'prototype-user-a-readwrite': 'agent-claude' as AgentConnectionId,
  'prototype-user-a-readonly': 'agent-cursor' as AgentConnectionId,
  'prototype-user-a-revoked': 'agent-old' as AgentConnectionId,
};

export const tokenFor = (connectionId: string): string | undefined =>
  Object.entries(PROTOTYPE_AGENT_TOKENS).find(([, id]) => id === connectionId)?.[0];
