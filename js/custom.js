/* EvalBoard custom scorers: you write a function score({ input, expected, output, context, tags, vars }) that
   returns a number from 0 to 1, true/false, or { score, pass, reason }. In the page it runs in a Web Worker with
   network APIs removed and a time limit; in the CLI it runs in a node:vm context with a timeout. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.EB = root.EB || {}).custom = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const EXAMPLE = '// Return 0..1, true/false, or { score, pass, reason }.\n// helpers.normalize(text) and helpers.words(text) are available.\nfunction score({ input, expected, output, context, tags }) {\n  const want = helpers.normalize(expected);\n  const got = helpers.normalize(output);\n  if (!got) return { score: 0, pass: false, reason: "Empty output." };\n  const words = helpers.words(output).length;\n  const ok = got.includes(want) && words <= 40;\n  return { score: ok ? 1 : 0, pass: ok, reason: ok ? "Contains the answer in 40 words or fewer." : "Missing the answer or too long (" + words + " words)." };\n}';
  /* Wrap user code so it yields the score function (or a clear error). */
  function wrap(code) { return '"use strict";\n' + String(code || '') + '\n;return (typeof score === "function") ? score : null;'; }
  function normalizeResult(r, threshold) {
    const th = threshold == null ? 0.5 : threshold;
    if (typeof r === 'boolean') return { score: r ? 1 : 0, pass: r, reason: r ? 'Custom scorer returned true.' : 'Custom scorer returned false.' };
    if (typeof r === 'number' && isFinite(r)) { const s = Math.max(0, Math.min(1, r)); return { score: s, pass: s >= th, reason: 'Custom score ' + s.toFixed(3) + '.' }; }
    if (r && typeof r === 'object') { const s = Number(r.score); const sc = isFinite(s) ? Math.max(0, Math.min(1, s)) : r.pass ? 1 : 0; return { score: sc, pass: r.pass != null ? !!r.pass : sc >= th, reason: String(r.reason || 'Custom scorer.').slice(0, 300) }; }
    throw new Error('score() must return a number, a boolean or { score, pass, reason }; it returned ' + (r === undefined ? 'undefined' : typeof r) + '.');
  }
  function payload(c, output) { return { input: String(c.input || ''), expected: String(c.expected || ''), output: String(output || ''), context: String(c.context || ''), tags: (c.tags || []).slice(), vars: Object.assign({}, c.vars || {}) }; }
  return { EXAMPLE, wrap, normalizeResult, payload };
});
