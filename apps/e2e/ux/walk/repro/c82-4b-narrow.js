// Slice 82 step 4b: word breaking and overflow at 1024 and 375 (dashboard rows, Design Lab, Archive).
// Run after `seed <seed>`, with globalThis.__4b = { path, width, height, name, region } set by a preceding `run`:
// measures every leaf text element under the region headed `region` (or the whole main) and flags those
// narrower than their longest word (the word must break mid-word).
const ARGS = globalThis.__4b;
await page.setViewportSize({ width: ARGS.width, height: ARGS.height ?? 800 });
await page.goto('http://localhost:4200' + ARGS.path); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(900);
const measure = await page.evaluate(region => {
  const c = document.createElement('canvas').getContext('2d');
  let root = document.querySelector('main');
  if (region) { const h = [...document.querySelectorAll('h1,h2,h3,h4')].find(h => h.textContent.trim() === region); root = h?.closest('section,article,[role=region]') ?? h?.parentElement?.parentElement; }
  if (!root) return 'region not found';
  const leaves = [...root.querySelectorAll('*')].filter(el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));
  return leaves.map(el => {
    const cs = getComputedStyle(el); c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const words = el.textContent.trim().split(/\s+/);
    const longest = Math.max(...words.map(w => c.measureText(w).width));
    const r = el.getBoundingClientRect(); const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3;
    return { text: el.textContent.trim().slice(0, 40), x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height), longestWord: Math.round(longest), lines: Math.round(r.height / lh), breaksWords: r.width + 1 < longest };
  }).filter(m => m.breaksWords || m.lines > 4);
}, ARGS.region);
const scroll = await page.evaluate(() => { const m = document.querySelector('main'); const kids = m ? [...m.querySelectorAll('*')].reduce((a, e) => Math.max(a, e.getBoundingClientRect().right), 0) : 0; return { vw: innerWidth, mainScrollW: m?.scrollWidth, docScrollW: document.documentElement.scrollWidth, rightmost: Math.round(kids) }; });
await page.screenshot({ path: `${out}/${ARGS.name}.png`, fullPage: true });
await page.setViewportSize({ width: 1440, height: 900 });
return { measure, scroll };
