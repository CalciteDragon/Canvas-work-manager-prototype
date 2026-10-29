import { describe, expect, it } from 'vitest';
import { dashboardWithoutDigest, emptyDashboard } from '../../../../core/gateway/testing/fake-gateway';
import { dailyDigestFailure } from './daily-digest-widget';

// Slice 78 (L4-022): a `null` digest means the provider failed. No reason crosses the wire,
// so there is nothing for Details.
describe('dailyDigestFailure', () => {
  it('says the digest could not be written when the provider failed', () => {
    expect(dailyDigestFailure(dashboardWithoutDigest())).toEqual({ sentence: 'Couldn’t write today’s digest.', reason: null });
  });

  it('answers null when there is a digest', () => {
    expect(dailyDigestFailure(emptyDashboard())).toBeNull();
  });
});
