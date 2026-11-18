const test = require('node:test'); const assert = require('node:assert'); const fs = require('node:fs'); const path = require('node:path'); const { execFileSync } = require('node:child_process');
const ROOT = path.join(__dirname, '..'); const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const js = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js'));
test('every script parses', () => { for (const f of js.map((x) => 'js/' + x).concat(['sw.js', 'cli/evalboard.js', 'action/index.js'])) execFileSync(process.execPath, ['--check', path.join(ROOT, f)]); });
test('the page loads every module except the worker, and the service worker caches all of them', () => {
  const html = read('index.html'); const sw = read('sw.js');
  for (const f of js) { if (f !== 'scorer-worker.js') assert.ok(html.includes('src="js/' + f + '"'), 'index.html loads ' + f); assert.ok(sw.includes("'./js/" + f + "'"), 'sw.js caches ' + f); }
  for (const f of ['vendor/sqljs/sql-wasm.js', 'vendor/sqljs/sql-wasm.wasm', 'icons/icon-192.png', 'styles.css', 'index.html']) { assert.ok(sw.includes("'./" + f + "'"), 'sw.js caches ' + f); assert.ok(fs.existsSync(path.join(ROOT, f)), f); }
  assert.match(sw, /const VERSION = 'evalboard-v\d+'/); assert.match(html, /THE EVAL DASHBOARD/);
  assert.match(sw, /fetch\(/); assert.match(html, /simulated/i);
});
test('the sandbox worker imports only helpers and removes network and storage APIs', () => {
  const w = read('js/scorer-worker.js'); for (const m of ['text', 'custom']) assert.ok(w.includes("'" + m + ".js'"), m);
  for (const api of ['fetch', 'XMLHttpRequest', 'WebSocket', 'indexedDB', 'importScripts']) assert.ok(w.includes(api), api);
});
test('the manifest is valid and its icons exist', () => { const m = JSON.parse(read('manifest.webmanifest')); assert.ok(m.name && m.start_url); for (const i of m.icons) assert.ok(fs.existsSync(path.join(ROOT, i.src)), i.src); });
test('the action runs on node24', () => { const a = read('action/action.yml'); assert.match(a, /using:\s*['"]?node24/); for (const f of fs.readdirSync(path.join(ROOT, '.github/workflows'))) { const y = read('.github/workflows/' + f); assert.doesNotMatch(y, /node-version:\s*['"]?(1\d|20|22)\b/, f); } });
