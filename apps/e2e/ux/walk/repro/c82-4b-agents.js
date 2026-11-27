// Slice 82 step 4b: agent-heavy findings at 1440 (connect action, revoked card, Alex empty state,
// Calendar/Search, prototype state and Design Lab headings/landmarks). Run on a 1440 daemon after `seed agent-heavy`.
const go = async p => { await page.goto('http://localhost:4200' + p); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(600); };
const main = () => page.locator('main').first();
const r = {};
await go('/settings/agents');
const text = await main().innerText();
r.agentsButtons = await main().getByRole('button').allInnerTexts();
r.agentsLinks = await main().getByRole('link').allInnerTexts();
r.connectWord = /connect (a|an|new)|add (an )?agent|new agent/i.test(text);
const retired = main().locator('article, li, section').filter({ hasText: 'Retired assistant' }).last();
r.retired = await retired.evaluate(el => ({ text: el.innerText.slice(0, 300), checks: [...el.querySelectorAll('input[type=checkbox]')].map(c => ({ checked: c.checked, disabled: c.disabled })), buttons: [...el.querySelectorAll('button')].map(b => ({ t: b.innerText.trim(), disabled: b.disabled || b.getAttribute('aria-disabled') })) })).catch(e => String(e));
await page.screenshot({ path: `${out}/agents-1440.png`, fullPage: true });
await go('/settings');
r.settingsMentionsConnect = /connect/i.test(await main().innerText());
r.settingsLinks = await main().getByRole('link').allInnerTexts();
await go('/calendar'); r.calendar = (await main().innerText()).slice(0, 200);
await go('/search'); r.search = (await main().innerText()).slice(0, 200);
r.navWorkspace = await page.getByRole('navigation').first().getByRole('link').allInnerTexts();
const heads = () => page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,h4')].slice(0, 8).map(h => h.tagName + ' ' + h.textContent.trim().slice(0, 40)));
const landmarks = () => page.evaluate(() => ({ mains: document.querySelectorAll('main,[role=main]').length, nestedMain: !!document.querySelector('main main, main [role=main]'), banners: [...document.querySelectorAll('header,[role=banner]')].filter(h => !h.closest('article,aside,main,nav,section') || h.getAttribute('role') === 'banner').length }));
await go('/prototype/state'); r.state = { heads: await heads(), lm: await landmarks() };
await go('/prototype/design'); r.design = { heads: await heads(), navLabels: await page.evaluate(() => [...document.querySelectorAll('nav[aria-label],[role=region][aria-label],section[aria-label]')].map(n => n.getAttribute('aria-label')).filter((v, i, a) => a.indexOf(v) !== i)) };
// Alex
await page.evaluate(() => localStorage.setItem('cwm.prototype.persona', 'user-alex'));
await go('/settings/agents');
r.alexAgents = (await main().innerText()).slice(0, 500);
await page.screenshot({ path: `${out}/agents-alex-1440.png` });
await page.evaluate(() => localStorage.removeItem('cwm.prototype.persona'));
return r;
