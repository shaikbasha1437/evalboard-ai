/* EvalBoard exports: results as CSV or JSON, a Markdown or standalone HTML report, a read-only share link
   (summary numbers only by default, personal data scrubbed, never any key), and a full JSON backup/restore. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./text.js'), require('./guard.js'), require('./metrics.js'), require('./charts.js'), require('./stats.js'));
  else (root.EB = root.EB || {}).report = factory(root.EB.text, root.EB.guard, root.EB.metrics, root.EB.charts, root.EB.stats);
})(typeof self !== 'undefined' ? self : this, function (T, G, M, C, S) {
  'use strict';
  const SECRET_FIELDS = /^(key|apikey|api_key|token|secret|authorization|password|keys)$/i;
  function stripSecrets(o) { return JSON.parse(JSON.stringify(o, (k, v) => (SECRET_FIELDS.test(k) ? undefined : typeof v === 'string' ? G.redactKeys(v) : v))); }
  const pubConfig = (c) => ({ id: c.id, label: c.label, provider: c.provider, model: c.model, temperature: c.temperature, maxTokens: c.maxTokens, simulated: !!c.simulated || c.provider === 'mock' });
  /* Build the report model for one run. labels: { caseId: { pass } } per config key "runId|configId". */
  function model(run, cases, labelsAll, o) {
    const op = o || {}; const cfgs = run.configs;
    const lab = (cid) => { const l = (labelsAll || {})[run.id + '|' + cid] || {}; const out = {}; for (const [k, v] of Object.entries(l)) if (v && v.pass != null) out[k] = v.pass; return out; };
    const rows = cfgs.map((c) => ({ config: pubConfig(c), s: M.summarize(run.results.filter((i) => i.configId === c.id), cases, { labels: lab(c.id) }) }));
    const pc = S.pareto(rows.map((r) => ({ id: r.config.id, x: r.s.costPer1k, y: r.s.passRate })));
    const pl = S.pareto(rows.map((r) => ({ id: r.config.id, x: r.s.p50, y: r.s.passRate })));
    for (const r of rows) { r.frontierCost = pc.includes(r.config.id); r.frontierLatency = pl.includes(r.config.id); }
    let cmp = null;
    if (op.baseline && op.baseline.items) cmp = { label: op.baseline.label, target: op.baseline.target, result: M.compare(op.baseline.items, run.results.filter((i) => i.configId === op.baseline.target), { baseLabels: op.baseline.labels, candLabels: lab(op.baseline.target) }) };
    return { title: run.name, dataset: run.datasetName, version: run.version, at: run.at, simulated: !!run.simulated, n: cases.length, rows, compare: cmp, scorers: (run.scorers || []).map((s) => ({ id: s.id, type: s.type, gate: s.gate !== false })) };
  }
  const pct = (x) => T.fmtPct(x, 1); const ci = (s) => pct(s.wilson.lo) + '\u2013' + pct(s.wilson.hi);
  function markdown(rep) {
    const L = ['# ' + rep.title, '', '- Dataset: ' + rep.dataset + ' (v' + rep.version + ', ' + rep.n + ' cases)', '- Run: ' + String(rep.at || '').replace('T', ' ').slice(0, 16) + ' UTC', '- Gate scorers: ' + rep.scorers.filter((s) => s.gate).map((s) => s.type).join(', ')];
    if (rep.simulated) L.push('- **Simulated results, not real model benchmarks.** Configs ran against EvalBoard\u2019s deterministic mock model.');
    L.push('', '| Config | Pass rate | 95% CI (Wilson) | Cost / 1k cases | p50 | p90 | p99 | Errors | Pareto |', '|---|---:|---:|---:|---:|---:|---:|---:|---|');
    for (const r of rep.rows) L.push('| ' + r.config.label + ' | ' + pct(r.s.passRate) + ' | ' + ci(r.s) + ' | ' + T.fmtUsd(r.s.costPer1k) + ' | ' + T.fmtMs(r.s.p50) + ' | ' + T.fmtMs(r.s.p90) + ' | ' + T.fmtMs(r.s.p99) + ' | ' + r.s.errors + ' | ' + [r.frontierCost ? 'cost' : '', r.frontierLatency ? 'latency' : ''].filter(Boolean).join(', ') + ' |');
    const tags = Array.from(new Set(rep.rows.flatMap((r) => Object.keys(r.s.byTag)))).sort();
    if (tags.length) { L.push('', '## By tag', '', '| Tag | ' + rep.rows.map((r) => r.config.label).join(' | ') + ' |', '|---|' + rep.rows.map(() => '---:').join('|') + '|'); for (const t of tags) L.push('| ' + t + ' | ' + rep.rows.map((r) => (r.s.byTag[t] ? pct(r.s.byTag[t].rate) + ' (' + r.s.byTag[t].passed + '/' + r.s.byTag[t].n + ')' : '\u2014')).join(' | ') + ' |'); }
    if (rep.compare) { const c = rep.compare.result; L.push('', '## Against baseline', '', '- Baseline: ' + rep.compare.label, '- ' + pct(c.baseRate) + ' \u2192 ' + pct(c.candRate) + ' (' + (c.diff >= 0 ? '+' : '') + (c.diff * 100).toFixed(1) + ' points, paired bootstrap 95% CI ' + (c.paired.lo * 100).toFixed(1) + ' to ' + (c.paired.hi * 100).toFixed(1) + ')', '- McNemar exact p = ' + c.mcnemar.exactP.toFixed(4) + ' (' + c.mcnemar.b + ' regressed, ' + c.mcnemar.c + ' improved): **' + c.verdict + '**', '- Regressed cases: ' + (c.regressed.join(', ') || 'none'), '- Improved cases: ' + (c.improved.join(', ') || 'none')); }
    L.push('', '_Costs use the editable sample price table, not live vendor prices. Token counts are estimated where a provider did not report usage. Pass rates count errors as failures._', '');
    return L.join('\n');
  }
  function html(rep) {
    const e = T.esc; const pts = (k) => rep.rows.map((r, i) => ({ id: r.config.id, label: r.config.label, x: k === 'cost' ? r.s.costPer1k : r.s.p50, y: r.s.passRate, lo: r.s.wilson.lo, hi: r.s.wilson.hi, frontier: k === 'cost' ? r.frontierCost : r.frontierLatency, color: C.PALETTE[i % C.PALETTE.length] }));
    const tbl = (head, rows) => '<div class="tw"><table><thead><tr>' + head.map((h) => '<th>' + e(h) + '</th>').join('') + '</tr></thead><tbody>' + rows.map((r) => '<tr>' + r.map((c) => '<td>' + e(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
    let b = '<h1>' + e(rep.title) + '</h1><p>' + e(rep.dataset) + ' \u00b7 v' + rep.version + ' \u00b7 ' + rep.n + ' cases \u00b7 ' + e(String(rep.at || '').replace('T', ' ').slice(0, 16)) + ' UTC</p>' + (rep.simulated ? '<p class="warn"><b>Simulated results, not real model benchmarks.</b> These configs ran against a deterministic mock model.</p>' : '');
    b += '<div class="charts"><figure>' + C.scatter({ points: pts('cost'), xLabel: 'Cost per 1,000 cases (sample prices)', yLabel: 'Pass rate', xFmt: (v) => T.fmtUsd(v) }) + '<figcaption>Accuracy vs cost (dashed: Pareto frontier)</figcaption></figure><figure>' + C.scatter({ points: pts('lat'), xLabel: 'Median latency', yLabel: 'Pass rate', xFmt: (v) => T.fmtMs(v) }) + '<figcaption>Accuracy vs latency</figcaption></figure></div>';
    b += '<h2>Leaderboard</h2>' + tbl(['Config', 'Pass rate', '95% CI', 'Cost / 1k', 'p50', 'p90', 'p99', 'Errors'], rep.rows.map((r) => [r.config.label, pct(r.s.passRate), ci(r.s), T.fmtUsd(r.s.costPer1k), T.fmtMs(r.s.p50), T.fmtMs(r.s.p90), T.fmtMs(r.s.p99), String(r.s.errors)]));
    const tags = Array.from(new Set(rep.rows.flatMap((r) => Object.keys(r.s.byTag)))).sort();
    if (tags.length) b += '<h2>By tag</h2>' + tbl(['Tag'].concat(rep.rows.map((r) => r.config.label)), tags.map((t) => [t].concat(rep.rows.map((r) => (r.s.byTag[t] ? pct(r.s.byTag[t].rate) + ' (' + r.s.byTag[t].passed + '/' + r.s.byTag[t].n + ')' : '\u2014')))));
    if (rep.compare) { const c = rep.compare.result; b += '<h2>Against baseline</h2><p>' + e(rep.compare.label) + ': ' + pct(c.baseRate) + ' \u2192 ' + pct(c.candRate) + '. McNemar exact p = ' + c.mcnemar.exactP.toFixed(4) + ' (' + c.mcnemar.b + ' regressed, ' + c.mcnemar.c + ' improved): <b>' + e(c.verdict) + '</b>.</p>'; }
    b += '<p class="muted">Costs use an editable sample price table, not live vendor prices. Token counts are estimated where a provider did not report usage. Errors count as failures. Made with EvalBoard AI.</p>';
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + e(rep.title) + ' \u2014 EvalBoard report</title><style>body{font:15px/1.5 system-ui,sans-serif;max-width:980px;margin:24px auto;padding:0 14px;color:#14213d}.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;margin:10px 0;font-size:13px}td,th{border-bottom:1px solid #dce2ea;padding:6px 8px;text-align:left;white-space:nowrap}.charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}figure{margin:0}svg{width:100%;height:auto}.grid{stroke:#e5e9f0}.tick,.axis,.lbl{font-size:11px;fill:#5c6878}.frontier{fill:none;stroke:#0f8a78;stroke-width:2;stroke-dasharray:5 4}.ci{stroke-width:2;opacity:.5}.warn{background:#fff4cc;padding:8px 10px;border-radius:8px}.muted{color:#5c6878;font-size:13px}</style></head><body>' + b + '</body></html>';
  }
  /* Share payload: summaries only (and, optionally, per-case pass/fail by id). Strings are scrubbed. */
  function sharePayload(rep, o) {
    const op = o || {};
    const p = { v: 1, kind: 'evalboard-report', title: rep.title, dataset: rep.dataset, version: rep.version, at: rep.at, n: rep.n, simulated: rep.simulated, scorers: rep.scorers,
      rows: rep.rows.map((r) => ({ config: r.config, frontierCost: r.frontierCost, frontierLatency: r.frontierLatency, s: { n: r.s.n, passed: r.s.passed, passRate: r.s.passRate, wilson: r.s.wilson, bootstrap: r.s.bootstrap, errors: r.s.errors, errorRate: r.s.errorRate, cost: r.s.cost, costPer1k: r.s.costPer1k, tokensIn: r.s.tokensIn, tokensOut: r.s.tokensOut, estimatedShare: r.s.estimatedShare, p50: r.s.p50, p90: r.s.p90, p99: r.s.p99, ttftP50: r.s.ttftP50, byTag: r.s.byTag } })),
      compare: rep.compare ? { label: rep.compare.label, result: Object.assign({}, rep.compare.result) } : null };
    if (op.cases) p.cases = op.cases;
    const scrub = (x) => JSON.parse(JSON.stringify(x, (k, v) => (SECRET_FIELDS.test(k) ? undefined : typeof v === 'string' ? G.scrubPII(v).text : v)));
    return scrub(p);
  }
  const b64u = { enc(bytes) { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return (typeof btoa !== 'undefined' ? btoa(s) : Buffer.from(s, 'binary').toString('base64')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
    dec(str) { const s = str.replace(/-/g, '+').replace(/_/g, '/'); const bin = typeof atob !== 'undefined' ? atob(s + '==='.slice((s.length + 3) % 4)) : Buffer.from(s, 'base64').toString('binary'); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; } };
  async function pipe(bytes, Stream) { const s = new Blob([bytes]).stream().pipeThrough(new Stream('deflate-raw')); return new Uint8Array(await new Response(s).arrayBuffer()); }
  async function encodeShare(payload) {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    if (typeof CompressionStream !== 'undefined') { try { return 'z' + b64u.enc(await pipe(bytes, CompressionStream)); } catch (e) { /* fall back */ } }
    return 'j' + b64u.enc(bytes);
  }
  async function decodeShare(str) {
    const s = String(str || ''); const kind = s[0]; let bytes = b64u.dec(s.slice(1));
    if (kind === 'z') { if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open compressed share links.'); bytes = await pipe(bytes, DecompressionStream); } else if (kind !== 'j') throw new Error('Not an EvalBoard share link.');
    const p = JSON.parse(new TextDecoder().decode(bytes)); if (!p || p.kind !== 'evalboard-report') throw new Error('Not an EvalBoard report.'); return p;
  }
  function resultsCSV(run, cases) {
    const scorerIds = (run.scorers || []).map((s) => s.id); const cfg = {}; for (const c of run.configs) cfg[c.id] = c; const cm = {}; for (const c of cases) cm[c.id] = c;
    const rows = run.results.map((i) => [run.id, (cfg[i.configId] || {}).label || i.configId, (cfg[i.configId] || {}).model || '', i.caseId, ((cm[i.caseId] || {}).tags || []).join(';'), i.skipped ? 'skipped' : i.pass == null ? '' : i.pass ? 'pass' : 'fail', i.error || '', i.latencyMs == null ? '' : i.latencyMs, i.ttftMs == null ? '' : i.ttftMs, i.usage ? i.usage.input : '', i.usage ? i.usage.output : '', i.usage ? (i.usage.estimated ? 'yes' : 'no') : '', i.fullCost != null ? i.fullCost.toFixed(6) : '', i.cached ? 'yes' : 'no', i.attempts || ''].concat(scorerIds.map((s) => (i.scores && i.scores[s] ? i.scores[s].score.toFixed(3) : ''))).concat([G.redactKeys(i.output || '')]));
    return T.toCSV(['run', 'config', 'model', 'case_id', 'tags', 'result', 'error', 'latency_ms', 'ttft_ms', 'input_tokens', 'output_tokens', 'tokens_estimated', 'cost_usd', 'cached', 'attempts'].concat(scorerIds.map((s) => 'score_' + s)).concat(['output']), rows);
  }
  function resultsJSON(run) { return JSON.stringify(stripSecrets({ kind: 'evalboard-run', run: { id: run.id, name: run.name, dataset: run.datasetName, datasetId: run.datasetId, version: run.version, at: run.at, simulated: run.simulated, configs: run.configs.map((c) => Object.assign(pubConfig(c), { system: c.system, template: c.template })), scorers: run.scorers, results: run.results } }), null, 2); }
  const BACKUP_KIND = 'evalboard-backup';
  function backup(state) { const s = stripSecrets(state); delete s.cache; return JSON.stringify({ kind: BACKUP_KIND, v: 1, at: new Date().toISOString(), state: s }); }
  function restore(text) {
    let j; try { j = JSON.parse(text); } catch (e) { throw new Error('That file is not JSON.'); }
    if (!j || j.kind !== BACKUP_KIND || !j.state) throw new Error('That is not an EvalBoard backup.');
    const s = j.state; for (const k of ['datasets', 'configs', 'runs']) if (!Array.isArray(s[k])) throw new Error('The backup is missing ' + k + '.');
    return stripSecrets(s);
  }
  return { model, markdown, html, sharePayload, encodeShare, decodeShare, resultsCSV, resultsJSON, backup, restore, stripSecrets, b64u };
});
