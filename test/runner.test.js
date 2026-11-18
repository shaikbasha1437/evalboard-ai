const test = require('node:test'); const assert = require('node:assert'); const R = require('../js/runner.js'); const P = require('../js/prices.js');
const cases = Array.from({ length: 12 }, (_, i) => ({ id: 'c' + i, input: 'Q' + i, expected: 'A' + i, tags: [], vars: { who: 'Sam' } }));
const cfg = (o) => Object.assign({ id: 'cfg', label: 'X', provider: 'mock', model: 'atlas-m', template: 'Hi {{who}}: {{input}} {{expected}}', system: 'sys', maxTokens: 64 }, o || {});
const scorers = [{ id: 'contains', type: 'contains', gate: true }];
const ok = async (c, p, k) => ({ text: 'A' + k.id.slice(1), usage: { input: 10, output: 5 }, usageReported: true, latencyMs: 5 });
const noSleep = () => Promise.resolve();
test('templates fill variables and never leak the expected answer', () => { const p = R.buildPrompt(cfg(), cases[0]); assert.match(p.user, /Hi Sam: Q0/); assert.doesNotMatch(p.user, /A0/); });
test('runs every case for every config and scores them', async () => {
  const run = R.createRun({ cases, configs: [cfg(), cfg({ id: 'cfg2', model: 'swift-s' })], scorers, call: ok, sleep: noSleep, concurrency: 3 });
  const out = await run.start(); assert.strictEqual(out.status, 'done'); assert.strictEqual(out.results.length, 24); assert.ok(out.results.every((r) => r.pass));
});
test('concurrency limit is respected', async () => {
  let live = 0; let peak = 0; const slow = async (c, p, k) => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 5)); live--; return ok(c, p, k); };
  await R.createRun({ cases, configs: [cfg()], scorers, call: slow, concurrency: 3 }).start(); assert.ok(peak <= 3 && peak >= 2, 'peak ' + peak);
});
test('retries with exponential backoff, honours Retry-After and halves concurrency on 429', async () => {
  const waits = []; const seen = {}; const flaky = async (c, p, k, o) => { seen[k.id] = (seen[k.id] || 0) + 1; if (o.attempt < 2) throw Object.assign(new Error('rate'), { status: 429, retryAfterMs: o.attempt === 0 ? 900 : 0 }); return ok(c, p, k); };
  const run = R.createRun({ cases: cases.slice(0, 1), configs: [cfg()], scorers, call: flaky, sleep: (ms) => { waits.push(ms); return Promise.resolve(); }, concurrency: 4, retries: 3, backoffMs: 100 });
  const out = await run.start(); assert.strictEqual(out.status, 'done'); assert.strictEqual(seen.c0, 3); assert.strictEqual(out.rateLimited, 2);
  assert.ok(waits[0] >= 900, 'retry-after honoured'); assert.ok(waits[1] >= 150 && waits[1] <= 250, 'second backoff ~200ms: ' + waits[1]); assert.ok(run.state.cap < 4);
});
test('gives up after the retry limit and records the error as a failure; 4xx are not retried', async () => {
  let n = 0; const dead = async () => { n++; throw Object.assign(new Error('boom'), { status: 500 }); };
  const out = await R.createRun({ cases: cases.slice(0, 1), configs: [cfg()], scorers, call: dead, sleep: noSleep, retries: 2 }).start();
  assert.strictEqual(n, 3); assert.match(out.results[0].error, /boom/); assert.strictEqual(out.results[0].pass, false);
  let m = 0; await R.createRun({ cases: cases.slice(0, 1), configs: [cfg()], scorers, call: async () => { m++; throw Object.assign(new Error('bad'), { status: 400 }); }, sleep: noSleep, retries: 3 }).start(); assert.strictEqual(m, 1);
});
test('an auth error stops the run', async () => { const out = await R.createRun({ cases, configs: [cfg()], scorers, call: async () => { throw Object.assign(new Error('key'), { status: 401 }); }, sleep: noSleep, concurrency: 1 }).start(); assert.strictEqual(out.status, 'auth'); });
test('the budget cap stops before overspending', async () => {
  const prices = [{ model: 'atlas-m', in: 1000, out: 1000 }]; const worst = P.worstCase(R.buildPrompt(cfg(), cases[0]).user.length, 64, 'atlas-m', prices);
  const TK = require('../js/tokens.js'); const call = async (c, p, k) => ({ text: 'A' + k.id.slice(1), usage: { input: Math.round(TK.estimate(p.system + '\n' + p.user) * 1.1), output: 64 }, usageReported: true, latencyMs: 1 });
  const budget = 0.5; const out = await R.createRun({ cases, configs: [cfg()], scorers, call, sleep: noSleep, concurrency: 2, budgetUsd: budget, prices }).start();
  assert.strictEqual(out.status, 'budget'); assert.ok(out.spent <= budget + 1e-9, 'spent ' + out.spent); assert.ok(out.results.some((r) => r.skipped === 'budget')); assert.ok(worst > 0);
});
test('pause, resume and stop', async () => {
  let calls = 0; const slow = async (c, p, k) => { calls++; await new Promise((r) => setTimeout(r, 3)); return ok(c, p, k); };
  const run = R.createRun({ cases, configs: [cfg()], scorers, call: slow, concurrency: 2 }); const done = run.start();
  await new Promise((r) => setTimeout(r, 8)); run.pause(); const at = calls; await new Promise((r) => setTimeout(r, 30)); assert.ok(calls <= at + 2, 'paused'); assert.strictEqual(run.state.status, 'paused');
  run.resume(); await new Promise((r) => setTimeout(r, 6)); run.stop(); const out = await done; assert.strictEqual(out.status, 'stopped'); assert.ok(out.results.some((r) => r.skipped === 'stopped')); assert.ok(calls < 12);
});
test('identical calls hit the cache, which costs nothing', async () => {
  const cache = new Map(); let n = 0; const call = async (c, p, k) => { n++; return ok(c, p, k); };
  const prices = [{ model: 'atlas-m', in: 1, out: 1 }];
  await R.createRun({ cases, configs: [cfg()], scorers, call, sleep: noSleep, cache, prices }).start(); const second = await R.createRun({ cases, configs: [cfg()], scorers, call, sleep: noSleep, cache, prices }).start();
  assert.strictEqual(n, 12); assert.strictEqual(second.cacheHits, 12); assert.ok(second.results.every((r) => r.cached && r.cost === 0 && r.fullCost > 0));
  await R.createRun({ cases, configs: [cfg({ temperature: 0.7 })], scorers, call, sleep: noSleep, cache, prices }).start(); assert.strictEqual(n, 24, 'a changed config is a different call');
});
test('missing usage is estimated', async () => { const out = await R.createRun({ cases: cases.slice(0, 2), configs: [cfg()], scorers, call: async (c, p, k) => ({ text: 'A' + k.id.slice(1), usageReported: false, latencyMs: 1 }), sleep: noSleep }).start(); assert.ok(out.results.every((r) => r.usage.estimated && r.usage.input > 0)); });
