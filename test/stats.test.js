const test = require('node:test'); const assert = require('node:assert'); const S = require('../js/stats.js');
const near = (a, b, e, m) => assert.ok(Math.abs(a - b) <= (e || 1e-6), (m || '') + ' ' + a + ' vs ' + b);
test('Wilson interval matches the closed form (reference values from scipy.stats.binomtest)', () => {
  const w = S.wilson(27, 30); near(w.lo, 0.7438, 1e-4); near(w.hi, 0.9654, 1e-4);
  const z = S.wilson(0, 10); assert.strictEqual(z.lo, 0); near(z.hi, 0.2775, 1e-4);
  assert.ok(isNaN(S.wilson(0, 0).p));
});
test('percentile uses NumPy linear interpolation', () => { const a = [1, 2, 3, 4, 10]; near(S.percentile(a, 50), 3); near(S.percentile(a, 90), 7.6); near(S.percentile(a, 99), 9.76); near(S.percentile([5], 99), 5); });
test('bootstrap is seeded and brackets the estimate', () => { const v = Array.from({ length: 40 }, (_, i) => (i % 4 ? 1 : 0)); const a = S.bootstrap(v, { seed: 1 }); const b = S.bootstrap(v, { seed: 1 }); assert.deepStrictEqual(a, b); assert.ok(a.lo < 0.75 && a.hi > 0.75 && a.lo > 0.5 && a.hi <= 1); });
test('binomial tails and McNemar', () => {
  near(S.binomCdf(0, 7, 0.5), 1 / 128, 1e-9); const m = S.mcnemar(7, 0); near(m.exactP, 0.015625, 1e-9); near(m.chi2, 36 / 7, 1e-9);
  near(S.mcnemar(3, 2).exactP, 1, 1e-9); assert.strictEqual(S.mcnemar(0, 0).exactP, 1);
  near(S.chi2sf1(3.841458820694124), 0.05, 2e-6); near(S.chi2sf1(36 / 7), 0.023342, 2e-5);
});
test('paired bootstrap difference has the right sign and interval', () => { const b = Array(30).fill(1); const c = b.map((x, i) => (i < 7 ? 0 : 1)); const d = S.pairedDiff(b, c); near(d.diff, -7 / 30); assert.ok(d.hi < 0 && d.lo < d.diff); });
test('Cohen kappa', () => { const k = S.kappa([1, 1, 0, 0, 1, 0], [1, 0, 0, 0, 1, 1]); near(k.agree, 4 / 6); near(k.kappa, 1 / 3); assert.strictEqual(S.kappa([1, 1], [1, 1]).kappa, 1); });
test('Pareto frontier keeps only undominated points', () => { const f = S.pareto([{ id: 'a', x: 1, y: 0.5 }, { id: 'b', x: 2, y: 0.9 }, { id: 'c', x: 3, y: 0.8 }, { id: 'd', x: 1, y: 0.4 }]); assert.deepStrictEqual(f.sort(), ['a', 'b']); });
test('histogram counts every value', () => { const h = S.histogram([1, 2, 2, 3, 9], 4); assert.strictEqual(h.counts.reduce((a, b) => a + b, 0), 5); assert.strictEqual(h.edges.length, 5); });
