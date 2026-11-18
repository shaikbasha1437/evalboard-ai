const test = require('node:test'); const assert = require('node:assert'); const D = require('../js/datasets.js'); const SEED = require('../js/seed.js');
test('imports CSV with aliases, tags and extra columns as variables', () => {
  const r = D.parse('question,answer,tags,product\n"How long, exactly?",30 days,returns;easy,boots\nWhat about gifts?,,gifts,\n', 'x.csv');
  assert.strictEqual(r.format, 'csv'); assert.strictEqual(r.cases.length, 2); assert.strictEqual(r.cases[0].input, 'How long, exactly?'); assert.strictEqual(r.cases[0].expected, '30 days');
  assert.deepStrictEqual(r.cases[0].tags, ['returns', 'easy']); assert.strictEqual(r.cases[0].vars.product, 'boots'); assert.ok(r.warnings.some((w) => /no expected/.test(w)));
  assert.match(D.parse('foo,bar\n1,2', 'x.csv').errors[0], /input/);
});
test('imports JSONL and JSON, reporting bad lines and empty inputs', () => {
  const l = D.parse('{"id":"a","input":"hi","expected":"x"}\nnot json\n{"input":""}\n', 'd.jsonl'); assert.strictEqual(l.format, 'jsonl'); assert.strictEqual(l.cases.length, 1); assert.strictEqual(l.errors.length, 2);
  const j = D.parse(JSON.stringify({ name: 'N', cases: [{ prompt: 'p', ideal: 'q', tags: 'a, b' }, { prompt: 'p2' }] }), 'd.json'); assert.strictEqual(j.name, 'N'); assert.strictEqual(j.cases.length, 2); assert.strictEqual(j.cases[0].expected, 'q');
  const dup = D.parse('[{"id":"a","input":"1"},{"id":"a","input":"2"}]', 'x.json'); assert.notStrictEqual(dup.cases[0].id, dup.cases[1].id);
});
test('exports round-trip through JSONL and CSV', () => {
  const cases = SEED.datasets().find((d) => d.id === 'ds-safety').cases.map((c) => { const x = Object.assign({}, c); delete x.sim; return x; });
  for (const [text, name] of [[D.exportJSONL(cases), 'r.jsonl'], [D.exportCSV(cases), 'r.csv']]) { const r = D.parse(text, name); assert.strictEqual(r.cases.length, cases.length, name); assert.strictEqual(D.fingerprint(r.cases), D.fingerprint(cases), name); assert.strictEqual(r.cases[3].vars.canary, cases[3].vars.canary, name); }
});
test('CSV export guards against formula injection', () => { const csv = D.exportCSV([{ id: 'a', input: '=HYPERLINK("x")', expected: '', tags: [] }]); assert.match(csv, /'=HYPERLINK/); });
test('slice, split by tag and versions', () => {
  const ds = SEED.datasets().find((d) => d.id === 'ds-support'); const hard = D.slice(ds.cases, ['hard']); assert.ok(hard.length > 0 && hard.every((c) => c.tags.includes('hard')));
  const sp = D.splitByTag(ds.cases, ['easy', 'hard']); assert.strictEqual(sp.easy.length + sp.hard.length + (sp.other || []).length, ds.cases.length);
  const x = { cases: ds.cases.slice(0, 3) }; assert.strictEqual(D.addVersion(x, 'one').version, 1); assert.strictEqual(D.addVersion(x, 'same').added, false);
  x.cases = x.cases.concat([{ id: 'n', input: 'new', expected: '', tags: [] }]); assert.strictEqual(D.addVersion(x, 'two').version, 2); assert.strictEqual(D.currentVersion(x), 2); x.cases[0] = Object.assign({}, x.cases[0], { input: 'edited' }); assert.strictEqual(D.currentVersion(x), null);
});
test('case validation', () => { assert.ok(D.validateCase({ id: '', input: '' }).id); assert.ok(D.validateCase({ id: 'a b', input: 'x' }).id); assert.ok(D.validateCase({ id: 'a', input: 'x' }, [{ id: 'a' }]).id); assert.deepStrictEqual(D.validateCase({ id: 'a', input: 'x' }, []), {}); });
