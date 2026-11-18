/* EvalBoard metrics: pass rate with Wilson and bootstrap 95% intervals, cost per run and per 1,000 cases, token
   counts (and how many were estimated), latency p50/p90/p99, time to first token, error rate, per-tag breakdowns,
   and regression checks against a baseline (McNemar's test and a paired bootstrap) with the flipped cases. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./stats.js'));
  else (root.EB = root.EB || {}).metrics = factory(root.EB.stats);
})(typeof self !== 'undefined' ? self : this, function (S) {
  'use strict';
  /* items: results for ONE config. A case "counts" when it ran (or errored); skipped cases are excluded.
     Errors count as failures in the pass rate, and human overrides (labels[caseId] = true/false) win over scorers. */
  function passOf(it, labels) { if (labels && labels[it.caseId] != null) return !!labels[it.caseId]; return it.error ? false : it.pass; }
  function summarize(items, cases, o) {
    const op = o || {}; const labels = op.labels || null; const tagOf = {}; for (const c of cases || []) tagOf[c.id] = c.tags || [];
    const ran = items.filter((i) => !i.skipped); const graded = ran.filter((i) => passOf(i, labels) != null);
    const passed = graded.filter((i) => passOf(i, labels)).length; const n = graded.length;
    const w = S.wilson(passed, n); const bs = S.bootstrap(graded.map((i) => (passOf(i, labels) ? 1 : 0)), { seed: op.seed || 2026, iters: op.iters || 2000 });
    const ok = ran.filter((i) => !i.error); const lat = ok.map((i) => i.latencyMs).filter((x) => x != null); const ttft = ok.map((i) => i.ttftMs).filter((x) => x != null);
    const cost = ran.reduce((a, i) => a + (i.fullCost || 0), 0); const spent = ran.reduce((a, i) => a + (i.cost || 0), 0);
    const tokIn = ok.reduce((a, i) => a + ((i.usage && i.usage.input) || 0), 0); const tokOut = ok.reduce((a, i) => a + ((i.usage && i.usage.output) || 0), 0);
    const est = ok.filter((i) => i.usage && i.usage.estimated).length;
    const byTag = {};
    for (const i of graded) for (const t of tagOf[i.caseId] || []) { const b = byTag[t] || (byTag[t] = { n: 0, passed: 0 }); b.n++; if (passOf(i, labels)) b.passed++; }
    for (const b of Object.values(byTag)) { const x = S.wilson(b.passed, b.n); b.rate = x.p; b.lo = x.lo; b.hi = x.hi; }
    const scorerMeans = {}; for (const i of ok) for (const [k, v] of Object.entries(i.scores || {})) { const m = scorerMeans[k] || (scorerMeans[k] = { sum: 0, n: 0, pass: 0 }); m.sum += v.score; m.n++; if (v.pass) m.pass++; }
    for (const m of Object.values(scorerMeans)) { m.mean = m.sum / m.n; m.passRate = m.pass / m.n; }
    return {
      n, ran: ran.length, skipped: items.length - ran.length, passed, passRate: w.p, wilson: { lo: w.lo, hi: w.hi }, bootstrap: { lo: bs.lo, hi: bs.hi },
      errors: ran.filter((i) => i.error).length, errorRate: ran.length ? ran.filter((i) => i.error).length / ran.length : 0,
      cost, spent, costPer1k: ran.length ? (cost / ran.length) * 1000 : NaN, tokensIn: tokIn, tokensOut: tokOut, estimatedShare: ok.length ? est / ok.length : 0,
      p50: S.percentile(lat, 50), p90: S.percentile(lat, 90), p99: S.percentile(lat, 99), meanLatency: lat.length ? S.mean(lat) : NaN, ttftP50: ttft.length ? S.percentile(ttft, 50) : null, ttftN: ttft.length,
      cached: ran.filter((i) => i.cached).length, retries: ran.reduce((a, i) => a + Math.max(0, (i.attempts || 1) - 1), 0), byTag, scorerMeans
    };
  }
  /* Compare a candidate config's results with a baseline's over the cases both graded. */
  function compare(baseItems, candItems, o) {
    const op = o || {}; const lb = op.baseLabels || null; const lc = op.candLabels || op.labels || null;
    const bm = new Map(baseItems.filter((i) => !i.skipped).map((i) => [i.caseId, passOf(i, lb)]));
    const pairs = []; for (const i of candItems) { if (i.skipped) continue; const b = bm.get(i.caseId); const c = passOf(i, lc); if (b == null || c == null) continue; pairs.push({ caseId: i.caseId, base: !!b, cand: !!c }); }
    const b = pairs.filter((p) => p.base && !p.cand); const c = pairs.filter((p) => !p.base && p.cand);
    const mc = S.mcnemar(b.length, c.length); const pd = S.pairedDiff(pairs.map((p) => (p.base ? 1 : 0)), pairs.map((p) => (p.cand ? 1 : 0)), { seed: op.seed || 4242, iters: op.iters || 2000 });
    const baseRate = pairs.length ? pairs.filter((p) => p.base).length / pairs.length : NaN; const candRate = pairs.length ? pairs.filter((p) => p.cand).length / pairs.length : NaN;
    const alpha = op.alpha || 0.05; const sig = mc.exactP < alpha;
    return { n: pairs.length, baseRate, candRate, diff: candRate - baseRate, regressed: b.map((p) => p.caseId), improved: c.map((p) => p.caseId), mcnemar: mc, paired: pd, significant: sig,
      verdict: !pairs.length ? 'no overlap' : sig ? (candRate < baseRate ? 'significant regression' : 'significant improvement') : 'no significant difference' };
  }
  return { summarize, compare, passOf };
});
