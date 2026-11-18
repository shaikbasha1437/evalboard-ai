const test = require('node:test'); const assert = require('node:assert'); const vm = require('node:vm'); const MK = require('../js/mock.js'); const CU = require('../js/custom.js'); const T = require('../js/text.js'); const SEED = require('../js/seed.js'); const R = require('../js/runner.js');
test('the mock model is deterministic, simulated, and reports usage only for some profiles', () => {
  const ds = SEED.datasets()[0]; const c = ds.cases[0]; const cfgs = SEED.configs(); let reported = 0; let unreported = 0;
  for (const cfg of cfgs) { const e = Object.assign({ system: ds.prompt.system, template: ds.prompt.template }, cfg); const p = R.buildPrompt(e, c); let a; let b; try { a = MK.call(e, p, c, { attempt: 1 }); b = MK.call(e, p, c, { attempt: 1 }); } catch (x) { continue; } assert.deepStrictEqual(a, b); assert.ok(a.simulated); if (a.usageReported) reported++; else unreported++; }
  assert.ok(reported > 0 && unreported > 0);
});
test('stronger profiles score higher on average and the prompt matters', () => {
  const p = (m) => MK.PROFILES[m]; const c = { tags: [], input: 'q', context: '[kb] x' };
  assert.ok(MK.chance(p('atlas-l'), { template: '{{input}} {{context}} cite' }, c) > MK.chance(p('local-8b'), { template: '{{input}} {{context}} cite' }, c));
  assert.ok(MK.chance(p('atlas-m'), { template: '{{input}}' }, c) < MK.chance(p('atlas-m'), { template: '{{input}} {{context}}' }, c), 'dropping the context hurts');
});
test('custom scorers run in a vm with a timeout, as the CLI does', () => {
  const run = (code, c, out, ms) => { const ctx = vm.createContext({ helpers: { normalize: T.normalize, words: T.words } }); const fn = new vm.Script('(function(){' + CU.wrap(code) + '})()', { timeout: ms || 200 }).runInContext(ctx, { timeout: ms || 200 }); ctx.__p = CU.payload(c, out); ctx.__f = fn; return CU.normalizeResult(new vm.Script('__f(__p)').runInContext(ctx, { timeout: ms || 200 }), 0.5); };
  const r = run(CU.EXAMPLE, { input: 'q', expected: '30 days' }, 'Thirty... no: 30 days.'); assert.ok(r.pass, r.reason);
  assert.throws(() => run('function score(){ while(true){} }', { input: 'q' }, 'x', 50), /timed out/i);
  assert.ok(typeof vm.runInContext('typeof fetch', vm.createContext({})) === 'string' && vm.runInContext('typeof fetch', vm.createContext({})) === 'undefined');
  assert.throws(() => CU.normalizeResult(undefined), /must return/);
  assert.deepStrictEqual(CU.normalizeResult(true), { score: 1, pass: true, reason: 'Custom scorer returned true.' }); assert.strictEqual(CU.normalizeResult(2).score, 1);
});
