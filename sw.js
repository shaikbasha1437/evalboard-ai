/* EvalBoard AI service worker: network-first with a versioned per-file cache, so updates show up on the
   next online load and the app, the demo and the SQL engine still open offline. */
const VERSION = 'evalboard-v1';
const FILES = ['./', './index.html', './styles.css', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './vendor/sqljs/sql-wasm.js', './vendor/sqljs/sql-wasm.wasm', './js/app.js','./js/charts.js','./js/custom.js','./js/datasets.js','./js/demo.js','./js/diff.js','./js/fixtures.js','./js/guard.js','./js/judge.js','./js/llm.js','./js/metrics.js','./js/mock.js','./js/prices.js','./js/report.js','./js/runner.js','./js/scorer-worker.js','./js/scorers.js','./js/seed.js','./js/stats.js','./js/store.js','./js/text.js','./js/tokens.js','./js/webllm.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => Promise.all(FILES.map((f) => c.add(new Request(f, { cache: 'reload' })).catch(() => null)))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('evalboard-') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== location.origin) return;
  const key = url.origin + url.pathname;
  e.respondWith(fetch(req).then((res) => { if (res && res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(key, copy)); } return res; })
    .catch(() => caches.open(VERSION).then((c) => c.match(key).then((m) => m || (req.mode === 'navigate' ? c.match(new URL('./index.html', self.registration.scope).href) : undefined)).then((m) => m || new Response('Offline and not cached yet.', { status: 503, headers: { 'content-type': 'text/plain' } })))));
});
