import { Injectable, inject } from '@angular/core';
import {
  PrototypeNoteSchema,
  PrototypeStateSchema,
  type CreatePrototypeNoteInput,
  type PrototypeNote,
  type PrototypeState,
} from '@cwm/contracts';
import { z } from 'zod';
import { PROTOTYPE_API_BASE_URL } from '../../core/config/prototype-config';
import { GatewayError, toGatewayError, toUnreachableError } from '../../core/gateway/gateway-error';
import type { PrototypeControlPort } from './prototype-control';

/**
 * The concrete `/prototype/*` adapter. Same shape as `PrototypeWorkManagerGateway` and for
 * the same reason — everything transport-shaped is in one file, and the panel sees only
 * the port and `GatewayError`.
 *
 * It does **not** apply §63's latency or failure injection. That is the point: those are
 * the settings this adapter exists to change, and routing it through them would let a
 * failure rate of 100 % lock the panel closed.
 */
@Injectable()
export class PrototypeHttpControl implements PrototypeControlPort {
  private readonly baseUrl = inject(PROTOTYPE_API_BASE_URL);

  state(): Promise<PrototypeState> {
    return this.send('GET', '/prototype/state', PrototypeStateSchema);
  }

  loadSeed(seed: string): Promise<PrototypeState> {
    return this.send('POST', '/prototype/seed', PrototypeStateSchema, { seed });
  }

  reset(): Promise<PrototypeState> {
    return this.send('POST', '/prototype/reset', PrototypeStateSchema);
  }

  setSimulatedNow(now: string | null): Promise<PrototypeState> {
    return this.send('POST', '/prototype/clock', PrototypeStateSchema, { now });
  }

  setAIProvider(provider: 'mock' | 'real'): Promise<PrototypeState> {
    return this.send('POST', '/prototype/ai-provider', PrototypeStateSchema, { provider });
  }

  addNote(input: CreatePrototypeNoteInput): Promise<PrototypeNote> {
    return this.send('POST', '/prototype/notes', PrototypeNoteSchema, input);
  }

  private async send<T>(method: string, path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        ...(body === undefined
          ? {}
          : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      });
    } catch (error) {
      throw toUnreachableError(error);
    }

    if (!response.ok) throw await toGatewayError(response, `${method} ${path}`);

    const parsed = schema.safeParse(await response.json().catch(() => undefined));
    if (!parsed.success) {
      throw new GatewayError('invalid_response', 0, `${method} ${path} answered a body that is not its contract`);
    }
    return parsed.data;
  }
}
