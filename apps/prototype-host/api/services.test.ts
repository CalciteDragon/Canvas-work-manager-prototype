import { PrototypeAIProvider } from '@cwm/domain';
import { describe, expect, it } from 'vitest';
import { RealAIProvider } from './real-ai-provider.ts';
import { aiProviderFor } from './services.ts';

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

describe('aiProviderFor (§44)', () => {
  it('defaults to the prototype provider when the variable is unset or anything but "real"', () => {
    expect(aiProviderFor(undefined)).toBeInstanceOf(PrototypeAIProvider);
    expect(aiProviderFor('mock')).toBeInstanceOf(PrototypeAIProvider);
    expect(aiProviderFor('Real')).toBeInstanceOf(PrototypeAIProvider);
  });

  it('selects the real adapter only for an exact "real"', () => {
    expect(aiProviderFor('real')).toBeInstanceOf(RealAIProvider);
  });

  it('needs no API key in the default mode', async () => {
    expect((await aiProviderFor(undefined).generateDailyDigest(context)).source).toBe('prototype');
  });

  it('fails loudly rather than silently falling back when the real adapter is selected', async () => {
    await expect(aiProviderFor('real').generateDailyDigest(context)).rejects.toThrow(/not implemented/);
  });
});
