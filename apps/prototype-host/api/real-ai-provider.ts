import type { AIProvider, DailyDigestContext, ProjectSummaryContext } from '@cwm/domain';
import type { GeneratedContent } from '@cwm/contracts';

/**
 * §44's optional developer-only adapter, deliberately left as a stub.
 *
 * It lives in the host rather than the domain because a real provider is *network*, and
 * §12 forbids the domain from knowing that. It fails loudly rather than silently falling
 * back to the prototype provider: `PROTOTYPE_AI_PROVIDER=real` is a developer saying "call
 * the real thing", and quietly composing fixture text instead would make an experiment
 * about real AI unfalsifiable.
 *
 * §44's rule is that real AI must never be *required*. `mock` is the default, so an
 * unconfigured checkout never reaches this class at all.
 *
 * The dashboard answers a digest rejection with a `null` digest and no reason (§24), so
 * the digest's reason is written to `console.error` here — never stdout, which the stdio
 * MCP transport owns — and reaches the host's console under HTTP and stdio alike.
 */
export class RealAIProvider implements AIProvider {
  generateDailyDigest(_context: DailyDigestContext): Promise<GeneratedContent> {
    const error = this.unavailable('generateDailyDigest');
    console.error(`prototype-host AI provider failed — ${error.message}`);
    return Promise.reject(error);
  }

  generateProjectSummary(_context: ProjectSummaryContext): Promise<GeneratedContent> {
    return Promise.reject(this.unavailable('generateProjectSummary'));
  }

  private unavailable(method: string): Error {
    return new Error(
      `PROTOTYPE_AI_PROVIDER=real is selected but RealAIProvider.${method} is not implemented — ` +
        'unset PROTOTYPE_AI_PROVIDER to use the prototype provider (§43, §44)',
    );
  }
}
