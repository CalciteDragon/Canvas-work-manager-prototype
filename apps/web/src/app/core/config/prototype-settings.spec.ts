import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FAILURE_RATES, NETWORK_DELAYS, PrototypeSettings, PROTOTYPE_SETTINGS_STORAGE_KEY } from './prototype-settings';

const settings = () => TestBed.inject(PrototypeSettings);

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
  TestBed.resetTestingModule();
});

describe('PrototypeSettings', () => {
  it('starts with no delay, no failures, and every flag on', () => {
    const service = settings();

    expect(service.networkDelayMs()).toBe(0);
    expect(service.failureRate()).toBe(0);
    expect(Object.values(service.flags())).toEqual([true, true, true, true, true, true]);
  });

  // §47 pins the interface. A flag added to the panel but missing here — or vice versa —
  // is the scattering the section exists to prevent.
  it('carries exactly §47’s six flags', () => {
    expect(Object.keys(settings().flags())).toEqual([
      'gridProjectLayout',
      'nestedProjects',
      'subtasks',
      'manualProgress',
      'aiSummarySections',
      'agentConfirmations',
    ]);
  });

  it('offers §46’s four latency presets', () => {
    expect(NETWORK_DELAYS).toEqual([0, 300, 1000, 3000]);
  });

  it('offers a failure ladder from never to always', () => {
    expect(FAILURE_RATES).toEqual([0, 0.25, 0.5, 1]);
  });

  it('waits the configured delay before resolving', async () => {
    vi.useFakeTimers();
    const service = settings();
    service.setNetworkDelay(3000);

    let settled = false;
    void service.delay().then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(2999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);

    vi.useRealTimers();
  });

  it('resolves immediately with no delay configured', async () => {
    const service = settings();
    await expect(service.delay()).resolves.toBeUndefined();
  });

  it('always fails at rate 1 and never at rate 0', () => {
    const service = settings();

    expect(service.shouldFail()).toBe(false);
    service.setFailureRate(1);
    expect([...Array(20)].every(() => service.shouldFail())).toBe(true);
    service.setFailureRate(0);
    expect([...Array(20)].some(() => service.shouldFail())).toBe(false);
  });

  /**
   * The panel reloads the app after a host-state change, so these have to outlive it —
   * otherwise dialling latency to 3 s and then switching persona silently clears it.
   */
  it('restores delay, failure rate and flags across a reload', () => {
    const service = settings();
    service.setNetworkDelay(1000);
    service.setFailureRate(0.5);
    service.setFlag('nestedProjects', false);

    TestBed.resetTestingModule();
    const restored = settings();

    expect(restored.networkDelayMs()).toBe(1000);
    expect(restored.failureRate()).toBe(0.5);
    expect(restored.flags().nestedProjects).toBe(false);
  });

  it('ignores stored settings that are not the shape it wrote', () => {
    sessionStorage.setItem(PROTOTYPE_SETTINGS_STORAGE_KEY, '{"networkDelayMs":"slow"}');

    expect(settings().networkDelayMs()).toBe(0);
  });

  /**
   * `sessionStorage` throws a `SecurityError` on *access* in a sandboxed iframe and with
   * site data disabled — the same trap `PrototypeIdentityProvider` guards against. A
   * development panel that cannot be constructed takes the whole app down with it.
   */
  it('survives a sessionStorage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    const service = settings();
    expect(service.networkDelayMs()).toBe(0);
    expect(() => service.setNetworkDelay(300)).not.toThrow();
    expect(service.networkDelayMs()).toBe(300);
  });
});
