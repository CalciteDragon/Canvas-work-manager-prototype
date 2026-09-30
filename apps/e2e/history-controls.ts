/**
 * The project header's Undo and Redo (Slice 41), as journeys drive them. The header is the only
 * browser surface that offers Undo, so every journey that used the canvas notice's button now goes
 * through these two helpers.
 */
import { expect, type Locator, type Page, type Response } from '@playwright/test';
import type { OperationHistoryTransitionResult } from '@cwm/contracts';

type Direction = 'undo' | 'redo';

/** The header's control for one direction. */
export const historyControl = (page: Page, direction: Direction): Locator => page.locator(`[data-history-${direction}]`);

/** The accessible name a control carries when it offers `label`. */
export const offered = (direction: Direction, label: string): string => `${direction === 'undo' ? 'Undo' : 'Redo'}: ${label}`;

/**
 * Waits until the header offers exactly `label` in `direction` and is enabled, then clicks it and
 * answers the transition's response. Waiting on the exact label matters: until a write's re-read
 * lands the controls are pending, and before the write begins the previous step is still offered.
 */
export const stepFromHeader = async (
  page: Page,
  direction: Direction,
  label: string | RegExp,
): Promise<{ response: Response; body: OperationHistoryTransitionResult }> => {
  const control = historyControl(page, direction);
  await expect(control).toHaveAttribute('aria-label', typeof label === 'string' ? offered(direction, label) : label, { timeout: 15_000 });
  await expect(control).not.toHaveAttribute('aria-disabled', 'true');
  const responded = page.waitForResponse((response) =>
    response.request().method() === 'POST' && /\/api\/history\/[^/]+\/transition$/.test(response.url()));
  await control.click();
  const response = await responded;
  return { response, body: (await response.json()) as OperationHistoryTransitionResult };
};

export const undoFromHeader = (page: Page, label: string | RegExp) => stepFromHeader(page, 'undo', label);
export const redoFromHeader = (page: Page, label: string | RegExp) => stepFromHeader(page, 'redo', label);

/** The one feedback line the controls speak through. */
export const historyFeedback = (page: Page): Locator => page.locator('[data-history-message]');
