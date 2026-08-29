import type { AIProvider, DailyDigestContext, ProjectSummaryContext } from '@cwm/domain';
import type { GeneratedContent } from '@cwm/contracts';

/**
 * §46 lists "AI Provider" among the panel's controls, but §44's switch is an environment
 * variable read once at startup. This is the join between the two: the services are wired
 * with *this* object, and the panel swaps what it delegates to.
 *
 * The domain is none the wiser — this is an `AIProvider` (§42), not a new interface, so
 * `DashboardService` keeps depending on the two methods the spec pins and nothing has to
 * be re-wired when the delegate changes.
 */
export class SwitchableAIProvider implements AIProvider {
  constructor(private current: AIProvider) {}

  generateDailyDigest(context: DailyDigestContext): Promise<GeneratedContent> {
    return this.current.generateDailyDigest(context);
  }

  generateProjectSummary(context: ProjectSummaryContext): Promise<GeneratedContent> {
    return this.current.generateProjectSummary(context);
  }

  use(provider: AIProvider): void {
    this.current = provider;
  }
}
