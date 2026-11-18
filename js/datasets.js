/* EvalBoard datasets: import test cases from CSV, JSONL or JSON (columns input, expected, and optional context,
   tags, rubric, id), validate them, slice and split by tag, and keep numbered versions. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./text.js'));
  else (root.EB = root.EB || {}).datasets = factory(root.EB.text);
})(typeof self !== 'undefined' ? self : this, function (T) {
  'use strict';
  const KNOWN = ['id', 'input', 'expected', 'context', 'tags', 'rubric', 'notes'];
  const ALIASES = { question: 'input', prompt: 'input', query: 'input', answer: 'expected', reference: 'expected', target: 'expected', ideal: 'expected', label: 'expected', documents: 'context', passages: 'context', tag: 'tags', labels: 'tags', criteria: 'rubric' };
  const str = (v) => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  function tagsOf(v) { if (Array.isArray(v)) return v.map((x) => String(x).trim().toLowerCase()).filter(Boolean); return String(v || '').split(/[,;|]/).map((x) => x.trim().toLowerCase()).filter(Boolean); }
  function canon(k) { const c = String(k || '').trim().toLowerCase().replace(/\s+/g, '_'); return ALIASES[c] || c; }
  /* Normalise one raw object into a case. Unknown columns become template variables (case.vars). */
  function toCase(o, i) {
    const c = { id: '', input: '', expected: '', context: '', tags: [], rubric: '', vars: {} };
    for (const [k0, v] of Object.entries(o || {})) {
      const k = canon(k0);
      if (k === 'tags') c.tags = tagsOf(v);
      else if (k === 'context' && Array.isArray(v)) c.context = v.map((x, j) => (typeof x === 'object' && x ? '[' + (x.id || 'doc-' + (j + 1)) + '] ' + (x.text || x.content || JSON.stringify(x)) : str(x))).join('\n');
      else if (KNOWN.includes(k)) c[k] = str(v);
      else if (k) c.vars[k] = str(v);
    }
    c.id = String(c.id || '').trim() || 'case-' + String(i + 1).padStart(3, '0');
    return c;
  }
  function detect(text, name) {
    const n = String(name || '').toLowerCase(); const t = String(text || '').trim();
    if (/\.jsonl$|\.ndjson$/.test(n)) return 'jsonl'; if (/\.json$/.test(n)) return 'json'; if (/\.csv$|\.tsv$/.test(n)) return 'csv';
    if (t.startsWith('[') || (t.startsWith('{') && /^\{[\s\S]*"cases"\s*:/.test(t))) return 'json';
    if (t.startsWith('{')) return 'jsonl'; return 'csv';
  }
  /* Parse an import. Returns { cases, errors, warnings, format, name? }. Never throws on bad rows. */
  function parse(text, name) {
    const format = detect(text, name); const errors = []; const warnings = []; let raw = []; let dsName = '';
    try {
      if (format === 'json') { const j = JSON.parse(String(text).replace(/^\uFEFF/, '')); raw = Array.isArray(j) ? j : Array.isArray(j.cases) ? j.cases : Array.isArray(j.data) ? j.data : null; dsName = (j && !Array.isArray(j) && j.name) || ''; if (!raw) throw new Error('JSON must be an array of cases or an object with a "cases" array.'); }
      else if (format === 'jsonl') { String(text).split(/\r?\n/).forEach((line, i) => { if (!line.trim()) return; try { raw.push(JSON.parse(line)); } catch (e) { errors.push('Line ' + (i + 1) + ': not valid JSON.'); } }); }
      else {
        const isTsv = /\.tsv$/i.test(String(name || '')); const rows = isTsv ? String(text).split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split('\t')) : T.parseCSV(text);
        if (!rows.length) throw new Error('The file is empty.');
        const head = rows[0].map(canon); if (!head.includes('input')) throw new Error('The CSV needs an "input" column (also accepted: question, prompt, query).');
        raw = rows.slice(1).map((r, i) => { if (r.length > head.length) warnings.push('Row ' + (i + 2) + ' has more cells than headers; extras ignored.'); const o = {}; head.forEach((h, j) => { o[h] = r[j] == null ? '' : r[j]; }); return o; });
      }
    } catch (e) { return { cases: [], errors: [e.message], warnings, format }; }
    const cases = []; const seen = new Set();
    raw.forEach((o, i) => {
      if (!o || typeof o !== 'object' || Array.isArray(o)) { errors.push('Case ' + (i + 1) + ': not an object.'); return; }
      const c = toCase(o, i);
      if (!c.input.trim()) { errors.push('Case ' + (i + 1) + ' (' + c.id + '): input is empty, skipped.'); return; }
      if (seen.has(c.id)) { const nid = c.id + '-' + (i + 1); warnings.push('Duplicate id ' + c.id + ' renamed to ' + nid + '.'); c.id = nid; }
      if (!c.expected.trim()) warnings.push(c.id + ': no expected answer (only judge, safety or custom scorers can grade it).');
      seen.add(c.id); cases.push(c);
    });
    if (cases.length > 5000) { warnings.push('Only the first 5,000 cases were kept.'); cases.length = 5000; }
    return { cases, errors, warnings, format, name: dsName };
  }
  function allTags(cases) { const m = {}; for (const c of cases) for (const t of c.tags || []) m[t] = (m[t] || 0) + 1; return Object.entries(m).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag, n]) => ({ tag, n })); }
  /* Slice: cases having ALL of the include tags and NONE of the exclude tags. */
  function slice(cases, include, exclude) { const inc = include || []; const exc = exclude || []; return cases.filter((c) => inc.every((t) => (c.tags || []).includes(t)) && !exc.some((t) => (c.tags || []).includes(t))); }
  /* Split by tag: one group per value of a tag family ("difficulty:hard" style) or per listed tag; the rest go to "other". */
  function splitByTag(cases, tags) {
    const groups = {}; for (const t of tags) groups[t] = [];
    const other = [];
    for (const c of cases) { const t = tags.find((x) => (c.tags || []).includes(x)); if (t) groups[t].push(c); else other.push(c); }
    if (other.length) groups.other = other; return groups;
  }
  function fingerprint(cases) { return T.hash2(JSON.stringify(cases.map((c) => [c.id, c.input, c.expected, c.context, (c.tags || []).join(','), c.rubric]))); }
  /* Save the current cases as a new numbered version (no-op if nothing changed since the last one). */
  function addVersion(ds, note, at) {
    const fp = fingerprint(ds.cases); const vs = ds.versions || (ds.versions = []);
    const last = vs[vs.length - 1]; if (last && last.fp === fp) return { added: false, version: last.v };
    const v = (last ? last.v : 0) + 1; vs.push({ v, fp, at: at || new Date().toISOString(), note: note || '', n: ds.cases.length, cases: JSON.parse(JSON.stringify(ds.cases)) });
    ds.version = v; return { added: true, version: v };
  }
  function currentVersion(ds) { const vs = ds.versions || []; const last = vs[vs.length - 1]; return last && last.fp === fingerprint(ds.cases) ? last.v : null; }
  function exportJSONL(cases) { return cases.map((c) => JSON.stringify(Object.assign({ id: c.id, input: c.input, expected: c.expected }, c.context ? { context: c.context } : {}, c.tags && c.tags.length ? { tags: c.tags } : {}, c.rubric ? { rubric: c.rubric } : {}, c.vars && Object.keys(c.vars).length ? c.vars : {}))).join('\n') + '\n'; }
  /* CSV export keeps template variables as extra columns, so a re-import gives the same cases back. */
  function exportCSV(cases) { const keys = Array.from(new Set(cases.flatMap((c) => Object.keys(c.vars || {})))).filter((k) => !['id', 'input', 'expected', 'context', 'tags', 'rubric'].includes(k)); return T.toCSV(['id', 'input', 'expected', 'context', 'tags', 'rubric'].concat(keys), cases.map((c) => [c.id, c.input, c.expected, c.context, (c.tags || []).join(';'), c.rubric].concat(keys.map((k) => (c.vars || {})[k] == null ? '' : String(c.vars[k]))))); }
  function validateCase(c, others) {
    const e = {}; if (!String(c.id || '').trim()) e.id = 'Give the case an id.'; else if (/\s/.test(c.id)) e.id = 'No spaces in ids.'; else if ((others || []).some((o) => o.id === c.id)) e.id = 'Another case already uses this id.';
    if (!String(c.input || '').trim()) e.input = 'Input is required.'; return e;
  }
  return { parse, toCase, detect, tagsOf, allTags, slice, splitByTag, fingerprint, addVersion, currentVersion, exportJSONL, exportCSV, validateCase };
});
