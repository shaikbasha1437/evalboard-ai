const test = require('node:test'); const assert = require('node:assert'); const DF = require('../js/diff.js'); const TK = require('../js/tokens.js'); const P = require('../js/prices.js'); const T = require('../js/text.js');
test('word diff marks insertions and deletions and escapes HTML', () => { const h = DF.html('the cat sat', 'the dog sat <b>'); assert.match(h, /<del>cat<\/del>/); assert.match(h, /<ins>dog<\/ins>/); assert.doesNotMatch(h, /<b>/); });
test('token estimates are flagged when the provider did not report usage', () => { const u = TK.usage(null, 'hello there general kenobi', 'hi'); assert.ok(u.estimated && u.input > 0 && u.output > 0); const r = TK.usage({ input: 10, output: 3 }, 'x', 'y'); assert.ok(!r.estimated); assert.strictEqual(r.input, 10); assert.ok(TK.estimate('\u4f60\u597d\u4e16\u754c') >= 4); });
test('the price table is dated sample data, editable and validated', () => {
  assert.match(P.AS_OF, /^\d{4}-\d{2}-\d{2}$/); assert.ok(P.SAMPLE.every((r) => r.note)); assert.strictEqual(P.cost({ input: 1e6, output: 1e6 }, 'atlas-m'), 4.8);
  assert.strictEqual(P.lookup('openrouter/openai/gpt-5-mini').in, P.lookup('gpt-5-mini').in); assert.strictEqual(P.cost({ input: 5 }, 'unknown-model'), null);
  assert.ok(P.validate([{ model: '', in: 1, out: 1 }, { model: 'a', in: -1, out: 1 }, { model: 'a', in: 1, out: 1 }]).length >= 3);
});
test('CSV parsing handles quotes and newlines; formatting helpers', () => { assert.deepStrictEqual(T.parseCSV('a,b\n"x, ""y""","multi\nline"\n'), [['a', 'b'], ['x, "y"', 'multi\nline']]); assert.strictEqual(T.fmtPct(0.8667, 1), '86.7%'); });
