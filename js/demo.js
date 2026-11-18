/* EvalBoard demo builder: replays the recorded demo plans through the real runner, scorers and mock model, so
   the demo dashboard is built by the same code a live run uses. Results are SIMULATED. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./seed.js'), require('./runner.js'), require('./mock.js'), require('./judge.js'), require('./fixtures.js'), require('./datasets.js'));
  else (root.EB = root.EB || {}).demo = factory(root.EB.seed, root.EB.runner, root.EB.mock, root.EB.judge, root.EB.fixtures, root.EB.datasets);
})(typeof self !== 'undefined' ? self : this, function (SEED, R, M, J, F, D) {
  'use strict';
  /* Merge a config with a dataset's default prompt: config fields win when they are set. */
  function effective(cfg, ds) { return Object.assign({}, cfg, { system: cfg.system || (ds.prompt && ds.prompt.system) || '', template: cfg.template || (ds.prompt && ds.prompt.template) || '{{input}}' }); }
  function scoreCtx(sqlLoader) { return { sql: sqlLoader, fixtures: F.all(), judge: (spec, c, out) => J.grade(spec, c, out, null) }; }
  const strip = (c) => { const x = Object.assign({}, c); delete x.sim; return x; };
  function casesAt(ds, v) { const x = (ds.versions || []).find((y) => y.v === v); return x ? x.cases : ds.cases; }
  async function build(sqlLoader, o) {
    const op = o || {}; const datasets = SEED.datasets(); const configs = SEED.configs(); const runs = [];
    for (const ds of datasets) {
      const vc = ds.versionCases || {}; delete ds.versionCases; const full = ds.cases;
      if (vc[1]) { ds.cases = vc[1]; D.addVersion(ds, 'First 24 questions', '2026-10-20T15:00:00Z'); ds.cases = full; D.addVersion(ds, 'Added 6 harder questions', '2026-11-05T15:00:00Z'); }
      else D.addVersion(ds, 'Initial version', '2026-11-01T15:00:00Z');
    }
    const ctx = scoreCtx(sqlLoader);
    for (const plan of SEED.runPlans()) {
      const ds = datasets.find((d) => d.id === plan.datasetId); const cases = casesAt(ds, plan.version);
      const snap = plan.configIds.map((id) => { const c = effective(configs.find((x) => x.id === id), ds); if (plan.promptTag) c.system = c.system + plan.promptTag; return c; });
      const run = R.createRun({ cases, configs: snap, scorers: ds.scorers, concurrency: 8, retries: 3, call: async (cfg, p, c, x) => M.call(cfg, p, c, x), sleep: () => Promise.resolve(), scoreCtx: ctx, seed: 1, useCache: false });
      const out = await run.start();
      runs.push({ id: plan.id, name: plan.name, datasetId: ds.id, datasetName: ds.name, version: plan.version, at: plan.at, configs: snap, scorers: JSON.parse(JSON.stringify(ds.scorers)), results: out.results, cases: cases.map(strip), status: out.status, simulated: true, baseline: plan.baseline || null, stats: { retries: out.retries, rateLimited: out.rateLimited, cacheHits: out.cacheHits }, opts: { concurrency: 8, retries: 3, budgetUsd: null } });
      if (op.onProgress) op.onProgress(runs.length, SEED.runPlans().length);
    }
    // demo human labels for judge-agreement
    const labels = {}; const h = SEED.HUMAN; const run = runs.find((r) => r.id === h.runId);
    const items = run.results.filter((i) => i.configId === h.configId && !i.error).slice(0, h.n);
    labels[h.runId + '|' + h.configId] = {};
    for (const i of items) labels[h.runId + '|' + h.configId][i.caseId] = { pass: h.overrule.includes(i.caseId) ? !i.pass : !!i.pass, by: 'Dana (reviewer)', at: '2026-11-17T20:00:00Z', note: h.overrule.includes(i.caseId) ? 'Overruled: see note.' : '' };
    return { datasets, configs, runs, labels };
  }
  return { build, effective, scoreCtx, casesAt, strip };
});
