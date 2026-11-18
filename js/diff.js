/* EvalBoard word diff for the case view: longest-common-subsequence over words, rendered as <del>/<ins>. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./text.js'));
  else (root.EB = root.EB || {}).diff = factory(root.EB.text);
})(typeof self !== 'undefined' ? self : this, function (T) {
  'use strict';
  function ops(a, b) {
    const x = String(a || '').split(/(\s+)/).filter((s) => s !== ''); const y = String(b || '').split(/(\s+)/).filter((s) => s !== '');
    if (x.length * y.length > 400000) return [{ op: 'del', t: x.join('') }, { op: 'ins', t: y.join('') }];
    const n = x.length; const m = y.length; const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const out = []; let i = 0; let j = 0; const push = (op, t) => { const l = out[out.length - 1]; if (l && l.op === op) l.t += t; else out.push({ op, t }); };
    while (i < n && j < m) { if (x[i] === y[j]) { push('eq', x[i]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) { push('del', x[i]); i++; } else { push('ins', y[j]); j++; } }
    while (i < n) push('del', x[i++]); while (j < m) push('ins', y[j++]);
    return out;
  }
  function html(a, b) { return ops(a, b).map((o) => (o.op === 'eq' ? T.esc(o.t) : o.op === 'del' ? '<del>' + T.esc(o.t) + '</del>' : '<ins>' + T.esc(o.t) + '</ins>')).join(''); }
  return { ops, html };
});
