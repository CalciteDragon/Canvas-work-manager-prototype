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
 */
export class RealAIProvider implements AIProvider {
  generateDailyDigest(_context: DailyDigestContext): Promise<GeneratedContent> {
    return Promise.reject(this.unavailable('generateDailyDigest'));
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
