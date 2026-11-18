/* EvalBoard price table: USD per 1M input and output tokens. These are SAMPLE prices for estimating cost,
   dated below and editable in Settings. They are not authoritative; check each vendor's pricing page. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.EB = root.EB || {}).prices = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const AS_OF = '2026-11-18';
  const SAMPLE = [
    { model: 'atlas-l', in: 3, out: 15, note: 'fictional simulated model' },
    { model: 'atlas-m', in: 0.8, out: 4, note: 'fictional simulated model' },
    { model: 'swift-s', in: 0.1, out: 0.4, note: 'fictional simulated model' },
    { model: 'local-8b', in: 0, out: 0, note: 'fictional, runs on your own hardware' },
    { model: 'gpt-5-mini', in: 0.25, out: 2, note: 'sample' }, { model: 'gpt-5-nano', in: 0.05, out: 0.4, note: 'sample' }, { model: 'gpt-5', in: 1.25, out: 10, note: 'sample' },
    { model: 'gpt-4.1-mini', in: 0.4, out: 1.6, note: 'sample' }, { model: 'gpt-4o-mini', in: 0.15, out: 0.6, note: 'sample' },
    { model: 'claude-haiku-4-5', in: 1, out: 5, note: 'sample' }, { model: 'claude-sonnet-4-5', in: 3, out: 15, note: 'sample' },
    { model: 'gemini-2.5-flash', in: 0.3, out: 2.5, note: 'sample' }, { model: 'gemini-2.5-flash-lite', in: 0.1, out: 0.4, note: 'sample' }, { model: 'gemini-2.5-pro', in: 1.25, out: 10, note: 'sample' },
    { model: 'llama3.2', in: 0, out: 0, note: 'local' }
  ];
  function table(rows) { const t = {}; for (const r of rows || SAMPLE) if (r && r.model) t[String(r.model).trim()] = { in: Number(r.in) || 0, out: Number(r.out) || 0 }; return t; }
  function lookup(model, rows) { const t = table(rows); const m = String(model || ''); if (t[m]) return t[m]; const k = Object.keys(t).find((x) => m.endsWith('/' + x) || m.replace(/\./g, '-').endsWith(x) || m.startsWith(x + '-')); return k ? t[k] : null; }
  function cost(usage, model, rows) { const p = lookup(model, rows); if (!p || !usage) return null; return ((usage.input || 0) * p.in + (usage.output || 0) * p.out) / 1e6; }
  /* Worst case for a call that hasn't happened yet: estimated input plus the full max_tokens of output. */
  function worstCase(inputTokens, maxTokens, model, rows) { const p = lookup(model, rows); if (!p) return 0; return (inputTokens * p.in + (maxTokens || 0) * p.out) / 1e6; }
  function validate(rows) {
    const errs = []; const seen = new Set();
    (rows || []).forEach((r, i) => { const m = String(r.model || '').trim(); if (!m) errs.push('Row ' + (i + 1) + ': model name is empty.'); else if (seen.has(m)) errs.push('Row ' + (i + 1) + ': ' + m + ' is listed twice.'); seen.add(m); for (const k of ['in', 'out']) if (!(Number(r[k]) >= 0) || r[k] === '' || r[k] == null) errs.push('Row ' + (i + 1) + ': ' + k + 'put price must be 0 or more.'); });
    return errs;
  }
  return { AS_OF, SAMPLE, table, lookup, cost, worstCase, validate };
});
