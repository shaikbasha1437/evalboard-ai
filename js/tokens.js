/* EvalBoard token counts. Providers usually report usage; when one doesn't (some local servers, the
   in-browser model, a stream that ends early) we estimate. The estimate is an approximation, not a tokenizer:
   roughly 4 characters per token for English, 1 per CJK character, with a floor based on word count. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.EB = root.EB || {}).tokens = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function estimate(text) {
    const s = String(text || ''); if (!s) return 0;
    const cjk = (s.match(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g) || []).length;
    const rest = s.length - cjk; const wordsN = (s.match(/[A-Za-z0-9]+|[^\sA-Za-z0-9]/g) || []).length;
    return Math.max(1, Math.round(Math.max(rest / 4, wordsN * 0.75)) + cjk);
  }
  /* Usage for one call: provider numbers when present, otherwise an estimate flagged as such. */
  function usage(reported, prompt, output) {
    if (reported && (reported.input || reported.output)) return { input: reported.input || estimate(prompt), output: reported.output || estimate(output), estimated: !reported.input || !reported.output };
    return { input: estimate(prompt) + 4, output: estimate(output), estimated: true };
  }
  return { estimate, usage };
});
