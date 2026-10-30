/**
 * Slice 78: failures and loading. Browser-only facts — a lifted read recovering through Try again,
 * the digest failing alone, the way back from an unavailable project, the sidebar's loading line,
 * keyboard reach, and every pinned failure's edge, clearance, press and dismissal — that unit
 * specs cannot prove. Failures are injected by route, as `ux/states-verification.ts` does.
 */
import type { Page, Route } from '@playwright/test';
import { expect, test } from '@playwright/test';
import type { ProjectSection } from '@cwm/contracts';
import { addSection, api, jsonRequest, seed } from './seed';

const KITCHEN = '/projects/project-kitchen';
const TODOS = '/projects/project-renovation/pages/todos';
const TASKS = '[data-section-id="section-project-kitchen-tasks"]';
const BRIEF = '[data-section-id="section-project-kitchen-brief"]';
const SHORTCUT = '[data-shortcut-id="shortcut-renovation-kitchen-tasks"]';
const PIN = '[data-failure-pin]';
const body = (message: string) => JSON.stringify({ error: 'internal_error', message });

/** Fulfils `method` requests whose path matches `pattern` with a 500 while `when()` holds. */
const fail = (page: Page, pattern: RegExp, method: string, message: string, when: () => boolean = () => true) =>
  page.route((url) => pattern.test(url.pathname), (route: Route) => route.request().method() === method && when()
    ? route.fulfill({ status: 500, contentType: 'application/json', body: body(message) })
    : route.fallback());

const fillTasks = async (sectionId: string, count: number) => {
  for (let i = 1; i <= count; i += 1) await api.post('/api/tasks', { projectId: 'project-kitchen', sectionId, title: `Filler ${String(i).padStart(2, '0')}` });
};

/** Scrolls the nearest scrolling ancestor of `selector`'s first match to an edge, or by a delta. */
const scrollPortOf = async (page: Page, selector: string, to: 'top' | 'bottom' | { above: string; margin: number }) => {
  await page.locator(selector).first().evaluate((element, to) => {
    let port: Element | null = element.parentElement;
    while (port && !(['auto', 'scroll'].includes(getComputedStyle(port).overflowY) && port.scrollHeight > port.clientHeight)) port = port.parentElement;
    const scroller = (port ?? document.scrollingElement)!;
    if (to === 'top') scroller.scrollTop = 0;
    else if (to === 'bottom') scroller.scrollTop = scroller.scrollHeight;
    else {
      const target = element.querySelector(to.above) ?? element;
      scroller.scrollTop += target.getBoundingClientRect().bottom - (port ? port.getBoundingClientRect().top : 0) + to.margin;
    }
  }, to);
};

/** The pins' scroll port (the slot's nearest scrolling ancestor): its client box and offset. */
const port = (page: Page) => page.locator('app-pinned-failure-slot').evaluate((slot) => {
  let element = slot.parentElement;
  while (element && !/^(auto|scroll|overlay)$/.test(getComputedStyle(element).overflowY)) element = element.parentElement;
  const scroller = element ?? document.documentElement;
  const r = scroller.getBoundingClientRect();
  return { top: r.top + scroller.clientTop, bottom: r.top + scroller.clientTop + scroller.clientHeight, scrollTop: scroller.scrollTop };
});

const box = async (page: Page, selector: string) => {
  const found = await page.locator(selector).first().boundingBox();
  if (!found) throw new Error(`${selector} has no box`);
  return found;
};

/** The one pinned copy at `edge`: wholly inside the port, pointing toward its reference. */
const expectPinned = async (page: Page, edge: 'top' | 'bottom', subject: string) => {
  await expect(page.locator(PIN)).toHaveCount(1);
  const show = page.locator(`[data-failure-pin="${edge}"]`);
  await expect(show).toBeVisible();
  await expect(show).toHaveAccessibleName(new RegExp(`^Show “${subject}”`));
  await expect(show).toContainText(edge === 'top' ? '↑' : '↓');
  const pin = await box(page, `[data-failure-pin-region="${edge}"]`);
  const clear = await port(page);
  expect(pin.y).toBeGreaterThanOrEqual(clear.top);
  expect(pin.y + pin.height).toBeLessThanOrEqual(clear.bottom + 0.5);
  return pin;
};

/**
 * Nothing scrolls while the pin waits; pressing it scrolls the sentence into the clear port,
 * removes the pin and focuses the surviving control (or the sentence) inside `owner`.
 */
const pressAndReveal = async (page: Page, owner: string) => {
  const before = (await port(page)).scrollTop;
  await page.waitForTimeout(400);
  expect((await port(page)).scrollTop).toBe(before);
  await page.locator(PIN).click();
  await expect(page.locator(PIN)).toHaveCount(0);
  const sentence = page.locator(`${owner} [data-failure-sentence]`).first();
  const clear = await port(page);
  const shown = await sentence.boundingBox();
  expect(shown).not.toBeNull();
  expect(shown!.y).toBeGreaterThanOrEqual(clear.top);
  expect(shown!.y + shown!.height).toBeLessThanOrEqual(clear.bottom + 0.5);
  const focus = await page.evaluate((owner) => {
    const active = document.activeElement;
    return { inOwner: !!active && !!active.closest(owner), isBody: active === document.body };
  }, owner);
  expect(focus).toEqual({ inOwner: true, isBody: false });
};

test.describe('failures and loading at 1440', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('a lifted tasks read keeps its failure, no empty sentence, until Try again shows the tasks (T12)', async ({ page }) => {
    await seed('nested-projects');
    let failing = true;
    await fail(page, /^\/api\/tasks$/, 'GET', 'Tasks read failed', () => failing);
    await page.goto(KITCHEN);
    const region = page.locator(TASKS);
    await expect(region.locator('[data-failure-sentence]')).toBeVisible();
    await expect(region.locator('[data-tasks-empty]')).toHaveCount(0);
    await expect(region.locator('[data-task-row]')).toHaveCount(0);
    failing = false;
    await region.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(region.locator('[data-task-row]').first()).toBeVisible();
    await expect(region.locator('[data-failure-sentence]')).toHaveCount(0);
  });

  test('the real provider fails only the digest: six widgets render beside it and no provider text shows', async ({ page }) => {
    await seed('agent-heavy');
    await jsonRequest('/prototype/ai-provider', { method: 'POST', body: { provider: 'real' } });
    try {
      await page.goto('/app');
      // Six widgets render; the seventh, the digest, shows its own failure.
      await expect(page.locator('app-dashboard-widget-frame:not(:has([data-widget-failure]))')).toHaveCount(6);
      const digest = page.locator('[data-dashboard-tile][data-widget-type="daily_digest"]');
      await expect(digest.locator('[data-widget-failure] [data-failure-sentence]')).toBeVisible();
      await expect(digest.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
      await expect(page.locator('[data-widget-failure]')).toHaveCount(1);
      await expect(page.locator('app-dashboard-page > app-failure-message, app-dashboard-page [role=alert]')).toHaveCount(0);
      await expect(page.locator('app-dashboard-page')).not.toContainText(/not implemented|RealAIProvider|PROTOTYPE_AI_PROVIDER/);
    } finally {
      await jsonRequest('/prototype/ai-provider', { method: 'POST', body: { provider: 'mock' } });
    }
  });

  test('Alex on Demo’s project reads it as unavailable, and Go to Home lands on /app', async ({ page }) => {
    await seed('nested-projects');
    await page.addInitScript(() => localStorage.setItem('cwm.prototype.persona', 'user-alex'));
    await page.goto('/projects/project-renovation');
    await expect(page.getByRole('heading', { name: 'This project isn’t available' })).toBeVisible();
    await expect(page.locator('main')).not.toContainText('project-renovation');
    await page.getByRole('link', { name: 'Go to Home', exact: true }).click();
    await expect(page).toHaveURL(/\/app$/);
  });

  test('the sidebar says Loading while its read is delayed, never No projects yet', async ({ page }) => {
    await seed('busy-week');
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route((url) => url.pathname === '/api/projects', async (route) => {
      if (route.request().method() === 'GET') await held;
      await route.fallback();
    });
    await page.goto('/app');
    const sidebar = page.locator('app-sidebar');
    await expect(sidebar.locator('[data-projects-loading]')).toHaveText('Loading projects…');
    await expect(sidebar.locator('[data-projects-empty]')).toHaveCount(0);
    release();
    await expect(sidebar.locator('[data-projects-loading]')).toHaveCount(0);
  });

  test('the keyboard reaches Try again and Details, and Details reveals the reason', async ({ page }) => {
    await seed('nested-projects');
    await fail(page, /^\/api\/projects\/project-renovation\/todos$/, 'GET', 'Todos read failed');
    await page.goto(TODOS);
    const region = page.locator('app-todos-page');
    await expect(region.locator('[data-failure-sentence]')).toBeVisible();
    const retry = region.getByRole('button', { name: 'Try again', exact: true });
    let reached = false;
    for (let i = 0; i < 80 && !reached; i += 1) {
      await page.keyboard.press('Tab');
      reached = await retry.evaluate((element) => element === document.activeElement);
    }
    expect(reached).toBe(true);
    await page.keyboard.press('Tab');
    const summary = region.locator('details summary').first();
    await expect(summary).toBeFocused();
    await expect(region.getByText('Todos read failed')).toBeHidden();
    await page.keyboard.press('Enter');
    await expect(region.getByText('Todos read failed')).toBeVisible();
  });
});

for (const touch of [false, true]) {
  test.describe(touch ? 'pinned failures at 375 touch' : 'pinned failures at 1440', () => {
    test.use({ viewport: { width: touch ? 375 : 1440, height: touch ? 812 : 900 }, hasTouch: touch, isMobile: touch });

    /** A Todos row's complete fails below the fold, and a delete's Undo toast opens. */
    const todosBelow = async (page: Page) => {
      await seed('nested-projects');
      let target = '';
      await page.route((url) => /^\/api\/tasks\/[^/]+\/complete$/.test(url.pathname), (route) =>
        route.request().method() === 'POST' && route.request().url().includes(`/api/tasks/${target}/`)
          ? route.fulfill({ status: 500, contentType: 'application/json', body: body('Todo complete failed') })
          : route.fallback());
      await page.goto(TODOS);
      const last = page.locator('app-todos-page [data-todo-row]:has([data-todo-toggle])').last();
      target = (await last.getAttribute('data-todo-id'))!;
      const title = (await last.locator('[data-todo-link]').first().innerText()).trim();
      await last.locator('[data-todo-toggle]').click();
      await expect(last.locator('[data-failure-sentence]')).toBeVisible();
      await scrollPortOf(page, 'app-todos-page', 'top');
      await page.locator(`app-todos-page [data-todo-row]:not([data-todo-id="${target}"]) [data-todo-delete]`).first().click();
      await expect(page.locator('[data-toast]:popover-open')).toBeVisible();
      return { owner: `app-todos-page [data-todo-row][data-todo-id="${target}"]`, title };
    };

    test('a Todos row failure below the fold pins at the bottom, above the open toast, and the press reveals it', async ({ page }) => {
      const { owner, title } = await todosBelow(page);
      const pin = await expectPinned(page, 'bottom', title);
      const toast = await box(page, '[data-toast]:popover-open');
      expect(pin.y + pin.height <= toast.y || pin.y >= toast.y + toast.height).toBe(true);
      await pressAndReveal(page, owner);
    });

    test('navigation leaves no pin from the old context', async ({ page }) => {
      const { title } = await todosBelow(page);
      await expectPinned(page, 'bottom', title);
      await page.goto(KITCHEN);
      await expect(page.locator(TASKS)).toBeVisible();
      await expect(page.locator(PIN)).toHaveCount(0);
    });

    /** A Kitchen Task List row's complete fails, then the row scrolls above the port under the stuck quick-add. */
    const taskListAbove = async (page: Page) => {
      await seed('nested-projects');
      await fillTasks('section-project-kitchen-tasks', 30);
      await fail(page, /^\/api\/tasks\/[^/]+\/complete$/, 'POST', 'Task complete failed');
      await page.goto(KITCHEN);
      const row = page.locator(`${TASKS} [data-task-row]`).first();
      const id = await row.getAttribute('data-task-id');
      const title = (await row.locator('[data-task-title]').innerText()).trim();
      await row.locator('[data-task-complete]').click();
      await expect(row.locator('[data-failure-sentence]')).toBeVisible();
      await scrollPortOf(page, TASKS, 'top');
      await scrollPortOf(page, TASKS, { above: '[data-task-row]', margin: 160 });
      return { owner: `${TASKS} [data-task-row][data-task-id="${id}"]`, title };
    };

    test('a Task List row failure above the fold pins at the top, below the stuck quick-add, and the press reveals it', async ({ page }) => {
      const { owner, title } = await taskListAbove(page);
      const pin = await expectPinned(page, 'top', title);
      const quickAdd = await box(page, `${TASKS} [data-quick-create]`);
      expect(pin.y).toBeGreaterThanOrEqual(quickAdd.y + quickAdd.height - 0.5);
      await pressAndReveal(page, owner);
    });

    test('keyboard dismissal removes the pin without scrolling or losing focus', async ({ page }) => {
      const { title } = await taskListAbove(page);
      await expectPinned(page, 'top', title);
      const before = (await port(page)).scrollTop;
      await page.locator(PIN).focus();
      await page.keyboard.press('Tab');
      await expect(page.locator('[data-failure-pin-dismiss]')).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator(PIN)).toHaveCount(0);
      expect((await port(page)).scrollTop).toBe(before);
      expect(await page.evaluate(() => document.activeElement !== document.body && document.activeElement !== null)).toBe(true);
    });

    test('a section collapse failure off screen pins to its own section', async ({ page }) => {
      await seed('nested-projects');
      await fail(page, /^\/api\/sections\/[^/]+$/, 'PATCH', 'Collapse failed');
      await page.goto(KITCHEN);
      const name = (await page.locator(`${BRIEF} [data-section-title]`).first().innerText()).trim();
      await page.locator(`${BRIEF} [data-section-collapse]`).click();
      await expect(page.locator(`${BRIEF} [data-failure-sentence]`)).toBeVisible();
      await scrollPortOf(page, BRIEF, 'bottom');
      await expectPinned(page, 'top', name);
      await pressAndReveal(page, BRIEF);
    });

    test('a shortcut collapse failure off screen pins to its own shortcut', async ({ page }) => {
      await seed('nested-projects');
      await fail(page, /^\/api\/shortcuts\/[^/]+$/, 'PATCH', 'Collapse failed');
      await page.goto('/projects/project-renovation');
      await page.locator(`${SHORTCUT} [data-shortcut-collapse]`).click();
      await expect(page.locator(`${SHORTCUT} [data-failure-sentence]`)).toBeVisible();
      await scrollPortOf(page, SHORTCUT, 'top');
      await expect(page.locator(PIN)).toHaveCount(1);
      await expect(page.locator('[data-failure-pin="bottom"]')).toBeVisible();
      await pressAndReveal(page, SHORTCUT);
    });

    test('a tall Task List still in view pins its off-screen receive failure, and the press reveals the sentence', async ({ page }) => {
      await seed('nested-projects');
      await fillTasks('section-project-kitchen-tasks', 30);
      const source: ProjectSection = await addSection('project-kitchen', { type: 'task-list', title: 'Source', position: 1 });
      await api.post('/api/tasks', { projectId: 'project-kitchen', sectionId: source.id, title: 'Moving task' });
      await fail(page, /^\/api\/tasks\/[^/]+$/, 'PATCH', 'Task move failed');
      await page.goto(KITCHEN);
      const from = page.locator(`[data-section-id="${source.id}"] [data-task-row]`).first();
      await page.locator(`[data-section-id="${source.id}"]`).evaluate((element) => element.scrollIntoView({ block: 'start' }));
      const a = (await from.boundingBox())!;
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
      await page.mouse.down();
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 12, { steps: 4 });
      // A point the target list owns: at 375 the quick-add covers the list's top edge.
      const drop = await page.locator(`${TASKS} .cdk-drop-list`).first().evaluate((list) => {
        const r = list.getBoundingClientRect(), x = r.left + r.width / 2;
        for (let y = Math.max(r.top, 0) + 5; y < Math.min(r.bottom, innerHeight) - 5; y += 10) {
          const at = document.elementFromPoint(x, y);
          if (at && list.contains(at)) return { x, y };
        }
        return null;
      });
      expect(drop).not.toBeNull();
      await page.mouse.move(drop!.x, drop!.y, { steps: 20 });
      await page.waitForTimeout(200);
      await page.mouse.up();
      const sentence = page.locator(`${TASKS} [data-failure-sentence]`).first();
      await expect(sentence).toBeVisible();
      await scrollPortOf(page, TASKS, 'top');
      await scrollPortOf(page, TASKS, { above: '[data-failure-sentence]', margin: 120 });
      // The frame is still partly in view; the sentence is not, and that is what pins.
      const frame = await box(page, TASKS);
      const clear = await port(page);
      expect(frame.y + frame.height).toBeGreaterThan(clear.top);
      await expect(page.locator(PIN)).toHaveCount(1);
      await expect(page.locator('[data-failure-pin="top"]')).toBeVisible();
      await pressAndReveal(page, TASKS);
    });
  });
}
