import { afterEach, describe, expect, it, vi } from 'vitest';
import { RealAIProvider } from './real-ai-provider.ts';

const context = {
  generatedAt: '2026-08-24T16:00:00.000Z',
  dueTodayCount: 0,
  overdueCount: 0,
  inProgressCount: 0,
  upcomingCount: 0,
  upcomingDays: 7,
  completedRecentlyCount: 0,
  recentDays: 7,
  activeProjectCount: 0,
};

afterEach(() => vi.restoreAllMocks());

describe('RealAIProvider (§44)', () => {
  it('writes the digest rejection to console.error, never stdout, which stdio owns', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await expect(new RealAIProvider().generateDailyDigest(context)).rejects.toThrow('RealAIProvider.generateDailyDigest');

    // The dashboard answers a `null` digest without the reason, so the console is the only
    // place a developer reads it — under HTTP and under stdio alike.
    expect(error).toHaveBeenCalledWith(expect.stringContaining('RealAIProvider.generateDailyDigest is not implemented'));
    expect(log).not.toHaveBeenCalled();
  });
});
