/* EvalBoard text helpers: escaping, normalisation, tokenising, hashing, seeded random numbers and a
   small RFC 4180 CSV reader/writer. Shared by the page, the scorers, the CLI and the tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.EB = root.EB || {}).text = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => MAP[c]); }
  /* Lower-case, strip accents, punctuation and articles, collapse whitespace. */
  function normalize(s) {
    return String(s == null ? '' : s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
      .replace(/(\d),(?=\d{3}\b)/g, '$1').replace(/[^\p{L}\p{N}\s.%$-]/gu, ' ').replace(/\.(?=\s|$)/g, ' ')
      .replace(/\b(a|an|the)\b/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const STOP = new Set('a an the of to in on for and or is are was were be been it this that with as at by from what which who how do does did can i you your our we my me their its not no yes'.split(' '));
  function words(s) { return normalize(s).split(' ').filter(Boolean); }
  function stem(w) { return w.length > 4 ? w.replace(/(ingly|edly|ing|ed|es|s|ly)$/, '') : w; }
  function content(s) { return words(s).filter((w) => !STOP.has(w)).map(stem); }
  /* FNV-1a 32-bit hash, hex. Used for cache keys and deterministic choices; not for security. */
  function hash(s) { let h = 0x811c9dc5; const t = String(s); for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return ('0000000' + h.toString(16)).slice(-8); }
  function hash2(s) { return hash(s) + hash('\u0001' + s); }
  /* mulberry32: small seeded PRNG so simulations and bootstraps are reproducible. */
  function rng(seed) { let a = (typeof seed === 'number' ? seed : parseInt(hash(seed), 16)) >>> 0; return function () { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function unit(seed) { return rng(seed)(); }
  /* CSV reader: quoted fields, doubled quotes, CRLF, embedded newlines. Returns rows of strings. */
  function parseCSV(text) {
    const s = String(text || '').replace(/^\uFEFF/, ''); const rows = []; let row = []; let f = ''; let q = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
      if (c === '"' && f === '') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
      else f += c;
    }
    if (q) throw new Error('CSV has an unclosed quote.');
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows.filter((r) => r.some((x) => x.trim() !== ''));
  }
  function csvCell(v) { const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s; return /[",\n\r]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe; }
  function toCSV(header, rows) { return [header].concat(rows).map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'; }
  function clip(s, n) { const t = String(s == null ? '' : s); return t.length > n ? t.slice(0, n - 1) + '\u2026' : t; }
  function fmtUsd(x, digits) { if (x == null || !isFinite(x)) return '\u2014'; const d = digits != null ? digits : x >= 1 ? 2 : x >= 0.01 ? 3 : x > 0 ? 5 : 2; return '$' + x.toFixed(d); }
  function fmtMs(x) { if (x == null || !isFinite(x)) return '\u2014'; return x >= 1000 ? (x / 1000).toFixed(x >= 10000 ? 1 : 2) + ' s' : Math.round(x) + ' ms'; }
  function fmtPct(x, d) { if (x == null || !isFinite(x)) return '\u2014'; return (x * 100).toFixed(d == null ? 1 : d) + '%'; }
  return { esc, normalize, words, content, stem, STOP, hash, hash2, rng, unit, parseCSV, toCSV, csvCell, clip, fmtUsd, fmtMs, fmtPct };
});
