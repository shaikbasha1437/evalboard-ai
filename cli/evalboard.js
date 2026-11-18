#!/usr/bin/env node
/* EvalBoard CLI: run an eval config from the command line or CI, write report.json and report.md, and exit 1
   when the pass rate is under the threshold or drops significantly against a baseline.

   Usage: node cli/evalboard.js <config.json> [--out dir] [--mock] [--write-baseline file] [--quiet]

   By default every config runs on the deterministic mock model, so CI needs no key and sends nothing. A config
   with "provider": "openai" | "anthropic" | "gemini" | "compatible" calls that API with the key from the
   environment variable named in "keyEnv" (for example a GitHub Actions secret). --mock forces the mock model. */
'use strict';
const fs = require('node:fs'); const path = require('node:path'); const vm = require('node:vm');
const ROOT = path.join(__dirname, '..'); const J = (f) => require(path.join(ROOT, 'js', f));
const T = J('text.js'); const D = J('datasets.js'); const R = J('runner.js'); const MK = J('mock.js'); const M = J('metrics.js'); const S = J('scorers.js');
const JU = J('judge.js'); const F = J('fixtures.js'); const RP = J('report.js'); const CU = J('custom.js'); const L = J('llm.js'); const SEED = J('seed.js'); const G = J('guard.js');

function parseArgs(argv) {
  const a = { config: null, out: null, mock: false, writeBaseline: null, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--out') a.out = argv[++i]; else if (x === '--mock') a.mock = true; else if (x === '--write-baseline') a.writeBaseline = argv[++i];
    else if (x === '--quiet') a.quiet = true; else if (x === '--help' || x === '-h') a.help = true; else if (!a.config) a.config = x; else throw new Error('Unexpected argument: ' + x);
  }
  return a;
}
let sqlP = null;
function sqlLoader() { if (!sqlP) { const init = require(path.join(ROOT, 'vendor', 'sqljs', 'sql-wasm.js')); sqlP = init({ locateFile: (f) => path.join(ROOT, 'vendor', 'sqljs', f) }); } return sqlP; }

/* Custom scorers run in a fresh node:vm context with no require, process or network, and a time limit. Like the
   browser's Web Worker, this keeps honest code honest; it is not a hardened sandbox for hostile code. */
function customScorer(code, threshold, timeoutMs) {
  const ms = timeoutMs || 1000; const ctx = vm.createContext({ helpers: { normalize: T.normalize, words: T.words } }, { codeGeneration: { strings: false, wasm: false } });
  const fn = new vm.Script('(function(){' + CU.wrap(code) + '})()').runInContext(ctx, { timeout: ms });
  if (typeof fn !== 'function') throw new Error('The custom scorer must define function score(...).');
  return (c, out) => { ctx.__p = CU.payload(c, out); ctx.__f = fn; try { return CU.normalizeResult(new vm.Script('__f(__p)').runInContext(ctx, { timeout: ms }), threshold); } catch (e) { if (/timed out/i.test(e.message)) throw new Error('Custom scorer timed out after ' + ms + ' ms.'); throw e; } };
}
function loadDataset(conf, base) {
  if (conf.demoDataset) { const ds = SEED.datasets().find((d) => d.id === conf.demoDataset); if (!ds) throw new Error('No demo dataset ' + conf.demoDataset + '.'); return { name: ds.name, cases: ds.cases, prompt: ds.prompt, scorers: ds.scorers }; }
  if (!conf.dataset) throw new Error('The config needs "dataset" (a CSV, JSONL or JSON file) or "demoDataset".');
  const file = path.resolve(base, conf.dataset); const r = D.parse(fs.readFileSync(file, 'utf8'), file);
  if (r.errors.length && !r.cases.length) throw new Error('Could not read ' + conf.dataset + ': ' + r.errors.join(' '));
  return { name: r.name || path.basename(file), cases: r.cases, warnings: r.warnings.concat(r.errors) };
}
function liveCaller(cfg, env) {
  const key = cfg.keyEnv ? env[cfg.keyEnv] : '';
  if (L.PROVIDERS[cfg.provider].needsKey && !key) throw new Error('Config ' + cfg.id + ' uses ' + cfg.provider + ' but the environment variable ' + (cfg.keyEnv || '(keyEnv not set)') + ' is empty. Add it as a secret, or run with --mock.');
  const secrets = key ? [key] : [];
  return async (c, prompt, kase, o) => {
    G.assertNoSecrets(prompt.system + '\n' + prompt.user, secrets);
    const r = await L.call({ provider: c.provider, model: c.model, key, baseUrl: c.baseUrl || '' }, { system: prompt.system, messages: [{ role: 'user', content: prompt.user }], maxTokens: c.maxTokens || 512, temperature: c.temperature }, { timeoutMs: c.timeoutMs || 60000 });
    return r;
  };
}
async function run(conf, base, opts) {
  const o = opts || {}; const env = o.env || process.env; const ds = loadDataset(conf, base);
  const prompt = Object.assign({ system: '', template: '{{input}}' }, ds.prompt || {}, conf.prompt || {});
  let cases = ds.cases; if (conf.tags && conf.tags.length) cases = D.slice(cases, conf.tags); if (conf.limit) cases = cases.slice(0, conf.limit);
  const scorers = (conf.scorers || ds.scorers || [{ id: 'normalized', type: 'normalized', gate: true }]).map((s) => Object.assign({ gate: true }, s));
  const customs = {}; for (const cs of conf.custom || []) { const code = cs.code || fs.readFileSync(path.resolve(base, cs.file), 'utf8'); customs[cs.id] = customScorer(code, cs.threshold, cs.timeoutMs); scorers.push({ id: cs.id, type: 'custom', gate: cs.gate !== false, options: { threshold: cs.threshold } }); }
  const configs = (conf.configs || []).map((c, i) => { const x = Object.assign({ id: 'cfg-' + (i + 1), label: c.model, provider: 'mock', temperature: 0, maxTokens: 512 }, c); if (o.mock) x.provider = 'mock'; x.system = x.system || prompt.system; x.template = x.template || prompt.template; x.simulated = x.provider === 'mock'; return x; });
  if (!configs.length) throw new Error('The config needs at least one entry in "configs".');
  const callers = {}; for (const c of configs) callers[c.id] = c.provider === 'mock' ? async (cfg, p, k, x) => MK.call(cfg, p, k, x) : liveCaller(c, env);
  const judgeCall = conf.judge && conf.judge.provider && conf.judge.provider !== 'mock' && !o.mock ? (() => { const f = liveCaller(Object.assign({ id: 'judge' }, conf.judge), env); return async (m) => (await f(conf.judge, { system: m.system, user: m.user }, {}, {})).text; })() : null;
  const scoreCtx = { sql: sqlLoader, fixtures: F.all(), judge: (sp, c, out) => JU.grade(sp, c, out, judgeCall), custom: (sp, c, out) => customs[sp.id](c, out) };
  const live = configs.some((c) => c.provider !== 'mock');
  const runner = R.createRun({ cases, configs, scorers, concurrency: conf.concurrency || 4, retries: conf.retries == null ? 3 : conf.retries, budgetUsd: conf.budgetUsd == null ? null : conf.budgetUsd, prices: conf.prices || null, useCache: false, seed: conf.seed || 1,
    call: (cfg, p, k, x) => callers[cfg.id](cfg, p, k, x), sleep: live ? undefined : () => Promise.resolve(), scoreCtx });
  const out = await runner.start();
  const runObj = { id: 'cli-' + Date.now().toString(36), name: conf.name || 'EvalBoard CLI run', datasetName: ds.name, version: 1, at: new Date().toISOString(), configs, scorers, results: out.results, simulated: !live, status: out.status };
  return { run: runObj, cases, out, warnings: ds.warnings || [] };
}
function perCase(run) { const m = {}; for (const c of run.configs) { m[c.id] = {}; for (const i of run.results) if (i.configId === c.id && !i.skipped) m[c.id][i.caseId] = M.passOf(i); } return m; }
function gate(run, cases, conf, baseline) {
  const g = Object.assign({ minPassRate: null, maxDrop: null, alpha: 0.05 }, conf.gate || {}); const failures = []; const rows = [];
  for (const c of run.configs) {
    const items = run.results.filter((i) => i.configId === c.id); const s = M.summarize(items, cases);
    const row = { id: c.id, label: c.label, model: c.model, provider: c.provider, n: s.n, passed: s.passed, passRate: s.passRate, wilson: s.wilson, errors: s.errors, costPer1k: s.costPer1k, p50: s.p50, p90: s.p90, p99: s.p99, estimatedTokens: s.estimatedShare };
    if (g.minPassRate != null && !(s.passRate >= g.minPassRate)) failures.push(c.label + ': pass rate ' + T.fmtPct(s.passRate, 1) + ' is under the threshold ' + T.fmtPct(g.minPassRate, 1) + '.');
    const bl = baseline && baseline.cases && (baseline.cases[c.id] || (g.baselineConfig && baseline.cases[g.baselineConfig]));
    if (bl) {
      const baseItems = Object.entries(bl).map(([caseId, pass]) => ({ caseId, pass })); const cmp = M.compare(baseItems, items, { alpha: g.alpha });
      row.baseline = { n: cmp.n, baseRate: cmp.baseRate, candRate: cmp.candRate, diff: cmp.diff, exactP: cmp.mcnemar.exactP, regressed: cmp.regressed, improved: cmp.improved, verdict: cmp.verdict, paired: cmp.paired };
      if (cmp.verdict === 'significant regression') failures.push(c.label + ': significant regression against the baseline (' + T.fmtPct(cmp.baseRate, 1) + ' \u2192 ' + T.fmtPct(cmp.candRate, 1) + ', McNemar exact p = ' + cmp.mcnemar.exactP.toFixed(4) + '; flipped: ' + cmp.regressed.join(', ') + ').');
      else if (g.maxDrop != null && cmp.diff < -g.maxDrop - 1e-12) failures.push(c.label + ': pass rate dropped ' + (-cmp.diff * 100).toFixed(1) + ' points against the baseline (allowed: ' + (g.maxDrop * 100).toFixed(1) + ').');
    }
    rows.push(row);
  }
  return { rows, failures, gate: g };
}
function markdown(rep) {
  const L2 = ['# ' + rep.name, '', '- Dataset: ' + rep.dataset + ' (' + rep.n + ' cases)', '- Status: ' + rep.status + (rep.simulated ? ' \u00b7 **simulated results (mock model), not real model benchmarks**' : ''), '- Gate: ' + (rep.passed ? '**passed**' : '**failed**'), ''];
  L2.push('| Config | Pass rate | 95% CI | Errors | Cost / 1k cases (sample prices) | p50 | p90 | vs baseline |', '|---|---:|---:|---:|---:|---:|---:|---|');
  for (const r of rep.configs) L2.push('| ' + r.label + ' | ' + T.fmtPct(r.passRate, 1) + ' (' + r.passed + '/' + r.n + ') | ' + T.fmtPct(r.wilson.lo, 1) + '\u2013' + T.fmtPct(r.wilson.hi, 1) + ' | ' + r.errors + ' | ' + T.fmtUsd(r.costPer1k) + ' | ' + T.fmtMs(r.p50) + ' | ' + T.fmtMs(r.p90) + ' | ' + (r.baseline ? r.baseline.verdict + ' (p = ' + r.baseline.exactP.toFixed(3) + ')' : '\u2014') + ' |');
  if (rep.failures.length) { L2.push('', '## Why the gate failed', ''); for (const f of rep.failures) L2.push('- ' + f); }
  L2.push('', '_Latencies on the mock model are simulated. Costs use the sample price table, not live vendor prices. Errors count as failures._', '');
  return L2.join('\n');
}
async function main(argv, io) {
  const x = io || {}; const log = x.log || ((s) => process.stdout.write(s + '\n')); const env = x.env || process.env;
  const a = parseArgs(argv);
  if (a.help || !a.config) { log('Usage: evalboard <config.json> [--out dir] [--mock] [--write-baseline file] [--quiet]'); return a.help ? 0 : 2; }
  const cfgPath = path.resolve(a.config); const conf = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); const base = path.dirname(cfgPath);
  const r = await run(conf, base, { mock: a.mock, env });
  let baseline = null; const bf = conf.gate && conf.gate.baseline;
  if (bf && !a.writeBaseline) { const p = path.resolve(base, bf); if (fs.existsSync(p)) baseline = JSON.parse(fs.readFileSync(p, 'utf8')); else log('No baseline at ' + bf + ' yet; skipping the regression check.'); }
  const g = gate(r.run, r.cases, conf, baseline);
  const rep = RP.stripSecrets({ kind: 'evalboard-cli-report', v: 1, name: r.run.name, dataset: r.run.datasetName, n: r.cases.length, at: r.run.at, status: r.out.status, simulated: r.run.simulated, passed: !g.failures.length && r.out.status === 'done', failures: g.failures.concat(r.out.status === 'done' ? [] : ['The run ended early: ' + r.out.status + '.']), gate: g.gate, configs: g.rows, cases: perCase(r.run), spentUsd: r.out.spent, warnings: r.warnings });
  if (r.out.status !== 'done') rep.passed = false;
  const outDir = path.resolve(a.out || conf.out || 'evalboard-report'); fs.mkdirSync(outDir, { recursive: true });
  const md = markdown(rep); fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(rep, null, 2)); fs.writeFileSync(path.join(outDir, 'report.md'), md);
  if (env.GITHUB_STEP_SUMMARY) { try { fs.appendFileSync(env.GITHUB_STEP_SUMMARY, md + '\n'); } catch (e) { /* not fatal */ } }
  if (a.writeBaseline) { fs.writeFileSync(path.resolve(a.writeBaseline), JSON.stringify({ kind: 'evalboard-baseline', v: 1, name: rep.name, at: rep.at, simulated: rep.simulated, cases: rep.cases }, null, 2) + '\n'); log('Wrote baseline ' + a.writeBaseline); }
  if (!a.quiet) log(md);
  log(rep.passed ? 'EvalBoard gate passed.' : 'EvalBoard gate FAILED:\n- ' + rep.failures.join('\n- '));
  return rep.passed || a.writeBaseline ? 0 : 1;
}
module.exports = { main, run, gate, markdown, parseArgs, customScorer };
if (require.main === module) main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => { process.stderr.write('evalboard: ' + e.message + '\n'); process.exitCode = 2; });
