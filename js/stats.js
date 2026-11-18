/* EvalBoard statistics: Wilson and bootstrap confidence intervals, percentiles, McNemar's test (exact and
   chi-square), paired bootstrap differences, Cohen's kappa, Pareto frontiers and histograms. Pure functions;
   cross-checked against SciPy/NumPy on the demo data (see VERIFICATION.md). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./text.js'));
  else (root.EB = root.EB || {}).stats = factory(root.EB.text);
})(typeof self !== 'undefined' ? self : this, function (T) {
  'use strict';
  const Z95 = 1.959963984540054;
  function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
  function sd(a) { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1)); }
  /* Wilson score interval for k successes in n trials. */
  function wilson(k, n, z) {
    if (!n) return { p: NaN, lo: NaN, hi: NaN };
    const zz = z || Z95; const p = k / n; const d = 1 + zz * zz / n;
    const c = (p + zz * zz / (2 * n)) / d; const h = zz * Math.sqrt(p * (1 - p) / n + zz * zz / (4 * n * n)) / d;
    return { p, lo: Math.max(0, c - h), hi: Math.min(1, c + h) };
  }
  /* Percentile with linear interpolation between closest ranks (NumPy's default "linear" method). */
  function percentile(arr, q) {
    const a = arr.filter((x) => x != null && isFinite(x)).slice().sort((x, y) => x - y);
    if (!a.length) return NaN; const pos = (q / 100) * (a.length - 1); const lo = Math.floor(pos); const hi = Math.ceil(pos);
    return a[lo] + (a[hi] - a[lo]) * (pos - lo);
  }
  /* Percentile bootstrap CI for a statistic (default: mean). Seeded, so the same data gives the same interval. */
  function bootstrap(values, o) {
    const op = o || {}; const n = values.length; const iters = op.iters || 2000; const alpha = op.alpha || 0.05; const stat = op.stat || mean;
    if (!n) return { est: NaN, lo: NaN, hi: NaN };
    const r = T.rng(op.seed == null ? 12345 : op.seed); const out = new Float64Array(iters); const buf = new Array(n);
    for (let i = 0; i < iters; i++) { for (let j = 0; j < n; j++) buf[j] = values[(r() * n) | 0]; out[i] = stat(buf); }
    const s = Array.from(out); return { est: stat(values), lo: percentile(s, 100 * alpha / 2), hi: percentile(s, 100 * (1 - alpha / 2)) };
  }
  /* log-gamma (Lanczos), for exact binomial tails. */
  const LG = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  function lgamma(x) { if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x); x -= 1; let a = 0.99999999999980993; const t = x + 7.5; for (let i = 0; i < 8; i++) a += LG[i] / (x + i + 1); return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a); }
  function binomPmf(k, n, p) { return Math.exp(lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1) + k * Math.log(p) + (n - k) * Math.log(1 - p)); }
  function binomCdf(k, n, p) { let s = 0; for (let i = 0; i <= k; i++) s += binomPmf(i, n, p); return Math.min(1, s); }
  /* Complementary error function (Numerical Recipes erfcc, |error| < 1.2e-7). */
  function erfc(x) { const z = Math.abs(x); const t = 1 / (1 + 0.5 * z); const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return x >= 0 ? r : 2 - r; }
  function chi2sf1(x) { return x <= 0 ? 1 : erfc(Math.sqrt(x / 2)); }
  /* McNemar's test on discordant pairs: b = baseline right & candidate wrong, c = baseline wrong & candidate right. */
  function mcnemar(b, c) {
    const n = b + c; if (!n) return { b, c, n, exactP: 1, chi2: 0, chi2P: 1, method: 'exact' };
    const exactP = Math.min(1, 2 * binomCdf(Math.min(b, c), n, 0.5));
    const chi2 = Math.pow(Math.max(0, Math.abs(b - c) - 1), 2) / n;
    return { b, c, n, exactP, chi2, chi2P: chi2sf1(chi2), method: n < 25 ? 'exact' : 'exact (chi-square also shown)' };
  }
  /* Paired bootstrap of the difference in mean score (candidate minus baseline) over the same cases. */
  function pairedDiff(base, cand, o) {
    const op = o || {}; const n = Math.min(base.length, cand.length); const iters = op.iters || 2000; const r = T.rng(op.seed == null ? 777 : op.seed);
    if (!n) return { diff: NaN, lo: NaN, hi: NaN, p: 1 };
    const d = []; for (let i = 0; i < n; i++) d.push(cand[i] - base[i]);
    const est = mean(d); const out = new Float64Array(iters); let le = 0; let ge = 0;
    for (let i = 0; i < iters; i++) { let s = 0; for (let j = 0; j < n; j++) s += d[(r() * n) | 0]; const m = s / n; out[i] = m; if (m <= 0) le++; if (m >= 0) ge++; }
    const s = Array.from(out);
    return { diff: est, lo: percentile(s, 2.5), hi: percentile(s, 97.5), p: Math.min(1, 2 * Math.min(le, ge) / iters) };
  }
  /* Cohen's kappa for two raters over the same items (any label values). */
  function kappa(a, b) {
    const n = Math.min(a.length, b.length); if (!n) return { agree: NaN, kappa: NaN, n: 0 };
    const labels = Array.from(new Set(a.slice(0, n).concat(b.slice(0, n)).map(String)));
    let po = 0; const ca = {}; const cb = {};
    for (let i = 0; i < n; i++) { const x = String(a[i]); const y = String(b[i]); if (x === y) po++; ca[x] = (ca[x] || 0) + 1; cb[y] = (cb[y] || 0) + 1; }
    po /= n; let pe = 0; for (const l of labels) pe += ((ca[l] || 0) / n) * ((cb[l] || 0) / n);
    return { agree: po, kappa: pe >= 1 ? 1 : (po - pe) / (1 - pe), n };
  }
  /* Pareto frontier: points that no other point beats on both axes (lower x is better, higher y is better). */
  function pareto(points) {
    return points.filter((p) => !points.some((q) => q !== p && q.x <= p.x && q.y >= p.y && (q.x < p.x || q.y > p.y))).map((p) => p.id);
  }
  function histogram(values, bins) {
    const v = values.filter((x) => x != null && isFinite(x)); const k = bins || 12;
    if (!v.length) return { edges: [], counts: [] };
    let lo = Math.min.apply(null, v); let hi = Math.max.apply(null, v); if (hi === lo) hi = lo + 1;
    const w = (hi - lo) / k; const counts = new Array(k).fill(0);
    for (const x of v) counts[Math.min(k - 1, Math.floor((x - lo) / w))]++;
    return { edges: Array.from({ length: k + 1 }, (_, i) => lo + i * w), counts };
  }
  return { Z95, mean, sd, wilson, percentile, bootstrap, lgamma, binomPmf, binomCdf, erfc, chi2sf1, mcnemar, pairedDiff, kappa, pareto, histogram };
});
