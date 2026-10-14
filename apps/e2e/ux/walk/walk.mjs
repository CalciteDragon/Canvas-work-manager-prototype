// Client for walkd.mjs. Examples:
//   node walk.mjs 5321 seed nested-projects
//   node walk.mjs 5321 goto /projects/project-kitchen
//   node walk.mjs 5321 run "await page.getByRole('button',{name:'New project'}).click()"
//   node walk.mjs 5321 run -f step.js          (file body runs with page, context, expect, out)
//   node walk.mjs 5321 shot kitchen-top [--full] [--sel "css"]
//   node walk.mjs 5321 aria [css]
//   node walk.mjs 5321 axe name
//   node walk.mjs 5321 console
import { readFileSync } from 'node:fs';
const [ctl, cmd, ...rest] = process.argv.slice(2);
let body = {};
if (cmd === 'run') body = { code: rest[0] === '-f' ? readFileSync(rest[1], 'utf8') : rest.join(' ') };
else if (cmd === 'seed') body = { seed: rest[0] };
else if (cmd === 'goto') body = { path: '/' + String(rest[0] ?? 'app').replace(/^[A-Za-z]:[\\/].*?Git[\\/]/, '').replace(/^\/+/, '') };
else if (cmd === 'aria') body = rest[0] ? { selector: rest.join(' ') } : {};
else if (cmd === 'axe') body = { name: rest[0] };
else if (cmd === 'shot') { const i = rest.indexOf('--sel'); body = { name: rest[0], full: rest.includes('--full'), selector: i >= 0 ? rest[i + 1] : undefined }; }
const res = await fetch(`http://127.0.0.1:${ctl}/${cmd}`, { method: 'POST', body: JSON.stringify(body) });
const json = await res.json();
if (json.aria) { const { aria, ...meta } = json; console.log(JSON.stringify(meta)); console.log(aria); }
else console.log(JSON.stringify(json, null, 1));
