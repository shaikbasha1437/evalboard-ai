const test = require('node:test'); const assert = require('node:assert'); const H = require('./helpers.js'); const RP = require('../js/report.js');
const KEY = 'sk-proj-' + 'Z'.repeat(40);
async function rep() { const st = await H.demo(); const run = st.runs.find((r) => r.id === 'run-sup-short'); const base = st.runs.find((r) => r.id === 'run-sup-1116'); return { st, run, rep: RP.model(run, run.cases, st.labels, { baseline: { label: 'Atlas-M (Nov 16)', target: run.configs[0].id, items: H.itemsOf(base, 'cfg-atlas-m') } }) }; }
test('markdown and HTML reports say simulated and include the regression', async () => {
  const { rep: r } = await rep(); const md = RP.markdown(r); assert.match(md, /Simulated results, not real model benchmarks/); assert.match(md, /significant regression/i); assert.match(md, /sample price/i);
  const html = RP.html(r); assert.match(html, /<table/); assert.match(html, /simulated/i); assert.doesNotMatch(html, /<script/i);
});
test('share links round-trip and carry no keys, emails or phone numbers', async () => {
  const { rep: r } = await rep(); r.rows[0].config.key = KEY; r.title = 'Run by jo@shop.example 555-201-3344 ' + KEY;
  const p = RP.sharePayload(r, { cases: [{ id: 'sup-01', pass: true }] }); const s = JSON.stringify(p);
  assert.doesNotMatch(s, /ZZZZ|jo@shop|3344/); assert.ok(!('key' in p.rows[0].config));
  const enc = await RP.encodeShare(p); assert.match(enc, /^[zj][\w-]+$/); const dec = await RP.decodeShare(enc); assert.deepStrictEqual(dec, p);
  await assert.rejects(RP.decodeShare('jbm90LWEtcmVwb3J0'));
});
test('backups strip keys and restore validates the file', async () => {
  const { st } = await rep(); const state = Object.assign({}, st, { settings: { apiKey: KEY }, keys: { openai: KEY }, cache: { a: 1 } }); state.configs = st.configs.map((c) => Object.assign({}, c, { key: KEY }));
  const b = RP.backup(state); assert.doesNotMatch(b, /ZZZZ/); const back = RP.restore(b); assert.strictEqual(back.runs.length, 8); assert.ok(!back.cache);
  assert.throws(() => RP.restore('{}'), /not an EvalBoard backup/); assert.throws(() => RP.restore('nope'), /not JSON/);
});
test('results CSV and JSON exports', async () => {
  const { run } = await rep(); const csv = RP.resultsCSV(run, run.cases); const lines = csv.trim().split(/\r?\n/); assert.ok(lines[0].startsWith('run,config,model,case_id')); assert.ok(lines.length >= run.results.length + 1);
  const j = JSON.parse(RP.resultsJSON(run)); assert.strictEqual(j.kind, 'evalboard-run'); assert.ok(j.run.simulated);
});
