/* EvalBoard charts: small dependency-free SVG builders. Scatter (with 95% interval whiskers and the Pareto
   frontier), histogram, and a multi-line trend chart. Points are focusable buttons (data-act="point"). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./text.js'));
  else (root.EB = root.EB || {}).charts = factory(root.EB.text);
})(typeof self !== 'undefined' ? self : this, function (T) {
  'use strict';
  const PALETTE = ['#2f6fdf', '#0f8a78', '#c2410c', '#8b5cf6', '#be185d', '#0e7490', '#a16207', '#4d7c0f'];
  const esc = T.esc;
  function ticks(lo, hi, n) { if (!(hi > lo)) return [lo]; const raw = (hi - lo) / (n || 4); const p = Math.pow(10, Math.floor(Math.log10(raw))); const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) || raw; const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v / step) * step); return out; }
  function scatter(o) {
    const W = o.width || 560; const H = o.height || 320; const m = { l: 54, r: 16, t: 14, b: 44 };
    const pts = o.points.filter((p) => isFinite(p.x) && isFinite(p.y));
    if (!pts.length) return '<p class="muted small">Nothing to plot yet.</p>';
    let x0 = Math.min.apply(null, pts.map((p) => p.x)); let x1 = Math.max.apply(null, pts.map((p) => p.x));
    if (x1 - x0 < 1e-12) { x0 = x0 * 0.8 - 1e-6; x1 = x1 * 1.2 + 1e-6; } const padX = (x1 - x0) * 0.12; x0 = Math.max(0, x0 - padX); x1 += padX;
    const lows = pts.map((p) => (isFinite(p.lo) ? p.lo : p.y)); const highs = pts.map((p) => (isFinite(p.hi) ? p.hi : p.y));
    let y0 = Math.max(0, Math.floor((Math.min.apply(null, lows) - 0.05) * 10) / 10); let y1 = Math.min(1, Math.ceil((Math.max.apply(null, highs) + 0.03) * 10) / 10); if (y1 - y0 < 0.2) { y0 = Math.max(0, y1 - 0.2); }
    const X = (v) => m.l + ((v - x0) / (x1 - x0)) * (W - m.l - m.r); const Y = (v) => H - m.b - ((v - y0) / (y1 - y0)) * (H - m.t - m.b);
    const xf = o.xFmt || ((v) => String(v)); const yf = o.yFmt || ((v) => Math.round(v * 100) + '%');
    let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.title || 'scatter chart') + '">';
    for (const t of ticks(y0, y1, 4)) s += '<line class="grid" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + Y(t) + '" y2="' + Y(t) + '"/><text class="tick" x="' + (m.l - 6) + '" y="' + (Y(t) + 4) + '" text-anchor="end">' + esc(yf(t)) + '</text>';
    for (const t of ticks(x0, x1, 4)) s += '<text class="tick" x="' + X(t) + '" y="' + (H - m.b + 16) + '" text-anchor="middle">' + esc(xf(t)) + '</text>';
    s += '<text class="axis" x="' + ((m.l + W - m.r) / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(o.xLabel || '') + '</text><text class="axis" transform="rotate(-90)" x="' + (-(m.t + H - m.b) / 2) + '" y="14" text-anchor="middle">' + esc(o.yLabel || '') + '</text>';
    const front = pts.filter((p) => p.frontier).sort((a, b) => a.x - b.x);
    if (front.length > 1) s += '<polyline class="frontier" points="' + front.map((p) => X(p.x) + ',' + Y(p.y)).join(' ') + '"/>';
    pts.forEach((p, i) => {
      const c = p.color || PALETTE[i % PALETTE.length]; const cx = X(p.x); const cy = Y(p.y);
      if (isFinite(p.lo) && isFinite(p.hi)) s += '<line class="ci" x1="' + cx + '" x2="' + cx + '" y1="' + Y(p.lo) + '" y2="' + Y(p.hi) + '" stroke="' + c + '"/>';
      s += '<g class="pt" tabindex="0" role="button" data-act="point" data-id="' + esc(p.id) + '" aria-label="' + esc(p.label + ': ' + yf(p.y) + ', ' + xf(p.x) + (p.frontier ? ', on the Pareto frontier' : '')) + '"><circle cx="' + cx + '" cy="' + cy + '" r="' + (p.frontier ? 8 : 6.5) + '" fill="' + c + '"' + (p.frontier ? ' class="on-front"' : '') + '/><text class="lbl" x="' + Math.min(W - m.r - 4, cx + 10) + '" y="' + (cy - 9) + '" text-anchor="' + (cx > W - 120 ? 'end' : 'start') + '">' + esc(T.clip(p.label, 26)) + '</text><title>' + esc(p.label + ' \u2014 ' + yf(p.y) + ' (95% CI ' + yf(p.lo) + '\u2013' + yf(p.hi) + '), ' + xf(p.x)) + '</title></g>';
    });
    return s + '</svg>';
  }
  function histogram(o) {
    const W = o.width || 560; const H = o.height || 220; const m = { l: 40, r: 10, t: 10, b: 38 };
    const h = o.hist; if (!h || !h.counts.length) return '<p class="muted small">No latencies to show.</p>';
    const max = Math.max.apply(null, h.counts) || 1; const k = h.counts.length; const bw = (W - m.l - m.r) / k; const xf = o.xFmt || ((v) => String(Math.round(v)));
    let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.title || 'histogram') + '">';
    for (const t of ticks(0, max, 3)) { const y = H - m.b - (t / max) * (H - m.t - m.b); s += '<line class="grid" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y + '" y2="' + y + '"/><text class="tick" x="' + (m.l - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + t + '</text>'; }
    h.counts.forEach((c, i) => { const bh = (c / max) * (H - m.t - m.b); s += '<rect class="hbar" x="' + (m.l + i * bw + 1) + '" y="' + (H - m.b - bh) + '" width="' + Math.max(1, bw - 2) + '" height="' + bh + '" fill="' + (o.color || PALETTE[0]) + '"><title>' + esc(xf(h.edges[i]) + '\u2013' + xf(h.edges[i + 1]) + ': ' + c) + '</title></rect>'; });
    [0, Math.floor(k / 2), k].forEach((i) => { s += '<text class="tick" x="' + (m.l + i * bw) + '" y="' + (H - m.b + 15) + '" text-anchor="middle">' + esc(xf(h.edges[i])) + '</text>'; });
    for (const mk of o.markers || []) { if (!isFinite(mk.v)) continue; const x = m.l + ((mk.v - h.edges[0]) / (h.edges[k] - h.edges[0])) * (W - m.l - m.r); s += '<line class="marker" x1="' + x + '" x2="' + x + '" y1="' + m.t + '" y2="' + (H - m.b) + '"/><text class="tick" x="' + (x + 3) + '" y="' + (m.t + 10) + '">' + esc(mk.label) + '</text>'; }
    return s + '<text class="axis" x="' + ((m.l + W - m.r) / 2) + '" y="' + (H - 4) + '" text-anchor="middle">' + esc(o.xLabel || '') + '</text></svg>';
  }
  function lines(o) {
    const W = o.width || 560; const H = o.height || 240; const m = { l: 56, r: 12, t: 12, b: 40 };
    const sets = o.lines.map((s) => Object.assign({}, s, { points: s.points.filter((p) => isFinite(p.x) && isFinite(p.y)) })); const all = sets.flatMap((s) => s.points); if (!all.length) return '<p class="muted small">No runs to show yet.</p>';
    let x0 = Math.min.apply(null, all.map((p) => p.x)); let x1 = Math.max.apply(null, all.map((p) => p.x)); if (x1 === x0) { x0 -= 86400000; x1 += 86400000; }
    const y1 = Math.max.apply(null, all.map((p) => p.y)) * 1.15 || 1; const X = (v) => m.l + ((v - x0) / (x1 - x0)) * (W - m.l - m.r); const Y = (v) => H - m.b - (v / y1) * (H - m.t - m.b);
    const yf = o.yFmt || ((v) => String(v)); const xf = o.xFmt || ((v) => new Date(v).toISOString().slice(5, 10));
    let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.title || 'line chart') + '">';
    for (const t of ticks(0, y1, 4)) s += '<line class="grid" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + Y(t) + '" y2="' + Y(t) + '"/><text class="tick" x="' + (m.l - 6) + '" y="' + (Y(t) + 4) + '" text-anchor="end">' + esc(yf(t)) + '</text>';
    const xs = Array.from(new Set(all.map((p) => p.x))).sort((a, b) => a - b); let lastX = -1e9; xs.forEach((x, i) => { if ((xs.length <= 6 || i % Math.ceil(xs.length / 6) === 0) && X(x) - lastX >= 44) { lastX = X(x); s += '<text class="tick" x="' + X(x) + '" y="' + (H - m.b + 16) + '" text-anchor="middle">' + esc(xf(x)) + '</text>'; } });
    sets.forEach((se, i) => { const c = se.color || PALETTE[i % PALETTE.length]; const ps = se.points.slice().sort((a, b) => a.x - b.x); if (ps.length > 1) s += '<polyline class="line" stroke="' + c + '" points="' + ps.map((p) => X(p.x) + ',' + Y(p.y)).join(' ') + '"/>'; for (const p of ps) s += '<circle cx="' + X(p.x) + '" cy="' + Y(p.y) + '" r="4" fill="' + c + '"><title>' + esc(se.label + ' \u00b7 ' + xf(p.x) + ': ' + yf(p.y)) + '</title></circle>'; });
    return s + '<text class="axis" x="' + ((m.l + W - m.r) / 2) + '" y="' + (H - 4) + '" text-anchor="middle">' + esc(o.xLabel || '') + '</text></svg>';
  }
  function legend(items) { return '<div class="legend">' + items.map((it, i) => '<span><i style="background:' + (it.color || PALETTE[i % PALETTE.length]) + '"></i>' + esc(it.label) + '</span>').join('') + '</div>'; }
  return { PALETTE, scatter, histogram, lines, legend, ticks };
});
