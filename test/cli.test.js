const test = require('node:test'); const assert = require('node:assert'); const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path'); const { spawnSync } = require('node:child_process');
const ROOT = path.join(__dirname, '..'); const CLI = path.join(ROOT, 'cli', 'evalboard.js'); const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'evalboard-'));
const run = (args, env) => spawnSync(process.execPath, [CLI].concat(args), { encoding: 'utf8', env: Object.assign({}, process.env, { GITHUB_STEP_SUMMARY: '' }, env || {}) });
test('the example config passes the gate with the mock model and writes JSON and Markdown', () => {
  const out = tmp(); const r = run([path.join(ROOT, 'examples/evalboard.config.json'), '--out', out, '--quiet']); assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  const rep = JSON.parse(fs.readFileSync(path.join(out, 'report.json'), 'utf8')); assert.ok(rep.passed && rep.simulated); assert.strictEqual(rep.configs.length, 2); assert.ok(rep.configs.every((c) => c.baseline));
  assert.match(fs.readFileSync(path.join(out, 'report.md'), 'utf8'), /not real model benchmarks/);
});
test('a regressed config fails the build with the flipped cases', () => {
  const out = tmp(); const r = run([path.join(ROOT, 'examples/regressed.config.json'), '--out', out, '--quiet']); assert.strictEqual(r.status, 1, r.stdout);
  const rep = JSON.parse(fs.readFileSync(path.join(out, 'report.json'), 'utf8')); assert.ok(!rep.passed); assert.ok(rep.configs[0].baseline.regressed.length > 0); assert.match(rep.failures.join(' '), /baseline/);
});
test('a threshold above the pass rate fails, and the step summary is appended', () => {
  const dir = tmp(); const conf = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/evalboard.config.json'), 'utf8')); conf.dataset = path.join(ROOT, 'examples', conf.dataset); conf.custom[0].file = path.join(ROOT, 'examples', conf.custom[0].file); delete conf.gate.baseline; conf.gate.minPassRate = 0.95;
  fs.writeFileSync(path.join(dir, 'c.json'), JSON.stringify(conf)); const sum = path.join(dir, 'summary.md');
  const r = run([path.join(dir, 'c.json'), '--out', path.join(dir, 'o'), '--quiet'], { GITHUB_STEP_SUMMARY: sum }); assert.strictEqual(r.status, 1); assert.match(fs.readFileSync(sum, 'utf8'), /Why the gate failed/);
});
test('a live provider without its key stops before sending anything; --mock runs it on the mock model', () => {
  const r = run([path.join(ROOT, 'examples/live.config.json'), '--out', tmp(), '--quiet'], { OPENAI_API_KEY: '' }); assert.strictEqual(r.status, 2); assert.match(r.stderr, /OPENAI_API_KEY/);
  const m = run([path.join(ROOT, 'examples/live.config.json'), '--out', tmp(), '--quiet', '--mock']); assert.strictEqual(m.status, 0, m.stdout + m.stderr);
});
test('a live run sends the key only in the request header and never writes it to the report', async () => {
  const cli = require(CLI); const KEY = 'test-only-key-0000'; const sent = []; const orig = global.fetch;
  global.fetch = async (url, init) => { sent.push({ url, init }); return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: 'You can return items within 30 days of delivery [kb-returns].' }, finish_reason: 'stop' }], usage: { prompt_tokens: 50, completion_tokens: 12 } }) }; };
  try {
    const dir = tmp(); const conf = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/live.config.json'), 'utf8')); conf.dataset = path.join(ROOT, 'examples', conf.dataset); conf.custom = []; conf.limit = 3; conf.out = path.join(dir, 'o');
    fs.writeFileSync(path.join(dir, 'c.json'), JSON.stringify(conf));
    const code = await cli.main([path.join(dir, 'c.json'), '--quiet'], { env: { OPENAI_API_KEY: KEY }, log: () => {} }); assert.ok(code === 0 || code === 1);
    assert.strictEqual(sent.length, 3); assert.ok(sent.every((s) => /api\.openai\.com/.test(s.url) && JSON.stringify(s.init.headers).includes(KEY) && !s.init.body.includes(KEY)));
    for (const f of ['report.json', 'report.md']) assert.ok(!fs.readFileSync(path.join(dir, 'o', f), 'utf8').includes(KEY), f);
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'o', 'report.json'), 'utf8')).simulated, false);
  } finally { global.fetch = orig; }
});
test('custom scorers in the CLI time out and cannot reach require or process', () => {
  const cli = require(CLI); const f = cli.customScorer('function score(){ while(true){} }', 0.5, 50); assert.throws(() => f({ input: 'q' }, 'x'), /timed out/);
  const g = cli.customScorer('function score(){ return typeof require === "undefined" && typeof process === "undefined" && typeof fetch === "undefined"; }', 0.5, 200); assert.ok(g({ input: 'q' }, 'x').pass);
});
test('the action entry point runs the CLI and sets outputs', () => {
  const dir = tmp(); const outF = path.join(dir, 'out.txt'); fs.writeFileSync(outF, '');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'action', 'index.js')], { encoding: 'utf8', env: Object.assign({}, process.env, { INPUT_CONFIG: 'examples/evalboard.config.json', INPUT_OUT_DIR: path.join(dir, 'rep'), INPUT_MOCK: 'true', GITHUB_WORKSPACE: ROOT, GITHUB_OUTPUT: outF, GITHUB_STEP_SUMMARY: '' }) });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr); assert.match(fs.readFileSync(outF, 'utf8'), /passed=true/);
  const bad = spawnSync(process.execPath, [path.join(ROOT, 'action', 'index.js')], { encoding: 'utf8', env: Object.assign({}, process.env, { INPUT_CONFIG: 'examples/regressed.config.json', INPUT_OUT_DIR: path.join(dir, 'rep2'), GITHUB_WORKSPACE: ROOT, GITHUB_OUTPUT: outF, GITHUB_STEP_SUMMARY: '' }) });
  assert.strictEqual(bad.status, 1); assert.match(bad.stdout, /::error::/);
});
