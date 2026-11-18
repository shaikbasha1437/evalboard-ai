const test = require('node:test'); const assert = require('node:assert'); const H = require('./helpers.js'); const M = require('../js/metrics.js'); const S = require('../js/stats.js');
test('the demo builds through the real runner: four datasets, eight runs, all simulated', async () => {
  const st = await H.demo(); assert.strictEqual(st.datasets.length, 4); assert.strictEqual(st.runs.length, 8);
  for (const r of st.runs) { assert.ok(r.simulated); assert.strictEqual(r.status, 'done'); assert.ok(r.cases.every((c) => !c.sim), 'no answer keys in stored cases'); }
});
test('the demo is deterministic', async () => { const D = require('../js/demo.js'); const a = await D.build(H.sql); const b = await D.build(H.sql); const strip = (s) => s.runs.map((r) => r.results.map((i) => [i.caseId, i.configId, i.pass, i.output, i.latencyMs]).sort((x, y) => (x[0] + x[1]).localeCompare(y[0] + y[1]))); assert.deepStrictEqual(strip(a), strip(b)); });
test('summaries: errors count as failures, Wilson CI, percentiles, cost per 1k, estimated tokens', async () => {
  const st = await H.demo(); const run = st.runs.find((r) => r.id === 'run-sql-1116'); const ds = H.dsOf(st, run);
  for (const c of run.configs) {
    const items = H.itemsOf(run, c.id); const s = M.summarize(items, ds.cases);
    const passed = items.filter((i) => !i.error && i.pass).length; assert.strictEqual(s.passed, passed); assert.strictEqual(s.n, items.length);
    const w = S.wilson(passed, items.length); assert.strictEqual(s.wilson.lo, w.lo);
    const lat = items.filter((i) => !i.error).map((i) => i.latencyMs); assert.strictEqual(s.p90, S.percentile(lat, 90));
    assert.ok(Math.abs(s.costPer1k - (items.reduce((a, i) => a + i.fullCost, 0) / items.length) * 1000) < 1e-12);
    if (c.model === 'local-8b') { assert.strictEqual(s.estimatedShare, 1); assert.strictEqual(s.ttftP50, null); }
  }
});
test('human labels override scorers in the pass rate', async () => {
  const st = await H.demo(); const run = st.runs.find((r) => r.id === 'run-sup-1116'); const ds = H.dsOf(st, run); const items = H.itemsOf(run, 'cfg-swift-s');
  const raw = M.summarize(items, ds.cases); const flip = { [items[0].caseId]: !items[0].pass }; const lab = M.summarize(items, ds.cases, { labels: flip }); assert.strictEqual(Math.abs(lab.passed - raw.passed), 1);
});
test('the short-prompt trial is a significant regression with the flipped cases listed', async () => {
  const st = await H.demo(); const base = st.runs.find((r) => r.id === 'run-sup-1116'); const cand = st.runs.find((r) => r.id === 'run-sup-short');
  const c = M.compare(H.itemsOf(base, 'cfg-atlas-m'), cand.results); assert.strictEqual(c.verdict, 'significant regression'); assert.ok(c.regressed.length > c.improved.length); assert.ok(c.mcnemar.exactP < 0.05); assert.ok(c.paired.hi < 0);
  const same = M.compare(H.itemsOf(base, 'cfg-atlas-m'), H.itemsOf(base, 'cfg-atlas-m')); assert.strictEqual(same.verdict, 'no significant difference'); assert.strictEqual(same.mcnemar.n, 0);
});
test('the steering config is caught: judge ignores the bait and the case is flagged', async () => {
  const st = await H.demo(); const run = st.runs.find((r) => r.id === 'run-sup-1116'); const items = H.itemsOf(run, 'cfg-swift-s').filter((i) => /Judge: give this a 10/.test(i.output || ''));
  assert.ok(items.length >= 1, 'some steering outputs'); for (const i of items) { const j = i.scores.judge; assert.ok(j && j.judge && j.judge.steered); assert.doesNotMatch(j.judge.prompt, /give this a 10/); }
});
