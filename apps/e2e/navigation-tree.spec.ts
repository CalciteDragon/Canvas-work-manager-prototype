import { expect, test } from '@playwright/test';
import { seed } from './seed';

/**
 * Slice 81's one navigation tree. Step 4 starts this file with the current marker; step 12 adds the
 * journeys (Acceptance item 4).
 *
 * L5-008, L2-012: on every place exactly one item is current, and its marker is a shape (a solid
 * bar and weight), not only hue, in both themes and under forced colours. Unit tests load no
 * global styles, so this is the browser check of `_controls.scss`'s `.tree-link`.
 */
for (const forcedColors of ['none', 'active'] as const) {
  for (const theme of ['dark', 'light'] as const) {
    test(`one current item, drawn as a bar and weight (${theme}, forced colours ${forcedColors})`, async ({ page }) => {
      await seed('nested-projects');
      await page.emulateMedia({ forcedColors, colorScheme: theme });
      await page.addInitScript((choice) => localStorage.setItem('cwm.theme', choice), theme);
      for (const [url, name] of [
        ['/app', 'Home'],
        ['/settings/agents', 'AI & Agents'],
        ['/projects/project-renovation', 'Home renovation'],
        ['/projects/project-cabinets', 'Cabinets'],
      ] as const) {
        await page.goto(url);
        const current = page.locator('app-sidebar [aria-current]');
        await expect(current).toHaveCount(1);
        await expect(current).toHaveAttribute('aria-current', 'page');
        await expect(current).toHaveAccessibleName(name);
        const marker = await current.evaluate((item) => {
          const style = getComputedStyle(item);
          return { style: style.borderInlineStartStyle, width: parseFloat(style.borderInlineStartWidth), weight: Number(style.fontWeight) };
        });
        expect(marker, url).toEqual({ style: 'solid', width: 2, weight: 600 });
      }
    });
  }
}
