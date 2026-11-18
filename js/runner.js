/* EvalBoard runner: runs a dataset against several model configs side by side, with a concurrency limit,
   retries with exponential backoff and jitter, rate-limit handling (honours Retry-After and halves concurrency
   on a 429), pause / resume / stop, a cache of identical calls, and a per-run budget cap that reserves the
   worst-case cost of every call before making it, so a run stops before it can overspend. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./text.js'), require('./tokens.js'), require('./prices.js'), require('./scorers.js'));
  else (root.EB = root.EB || {}).runner = factory(root.EB.text, root.EB.tokens, root.EB.prices, root.EB.scorers);
})(typeof self !== 'undefined' ? self : this, function (T, TK, P, S) {
  'use strict';
  const VAR = /\{\{\s*([\w.-]+)\s*\}\}/g;
  function render(tpl, c, extra) {
    const vars = Object.assign({}, (c && c.vars) || {}, extra || {}, { input: c.input, context: c.context || '', tags: (c.tags || []).join(', '), id: c.id });
    const missing = [];
    const text = String(tpl || '').replace(VAR, (m, k) => { if (k === 'expected') { missing.push('expected (never sent to the model)'); return ''; } if (vars[k] == null) { missing.push(k); return ''; } return String(vars[k]); });
    return { text, missing };
  }
  function templateVars(tpl) { const out = new Set(); String(tpl || '').replace(VAR, (m, k) => { out.add(k); return m; }); return Array.from(out); }
  function buildPrompt(cfg, c) { const s = render(cfg.system || '', c, cfg.vars); const u = render(cfg.template || '{{input}}', c, cfg.vars); return { system: s.text, user: u.text, missing: s.missing.concat(u.missing) }; }
  function cacheKey(cfg, prompt) { return T.hash2(JSON.stringify([cfg.provider, cfg.model, cfg.baseUrl || '', Number(cfg.temperature) || 0, cfg.maxTokens || 0, prompt.system, prompt.user])); }
  const RETRYABLE = (e) => !e.status || e.status === 408 || e.status === 409 || e.status === 425 || e.status === 429 || e.status >= 500;
  function createRun(o) {
    const op = Object.assign({ concurrency: 4, retries: 3, backoffMs: 400, maxBackoffMs: 8000, budgetUsd: null, useCache: true, seed: 1 }, o);
    const sleep = op.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    // Throttled workers always wait on a real timer, even when op.sleep is instant, so they never starve the event loop.
    const idle = () => new Promise((r) => setTimeout(r, 25));
    const cache = op.cache || new Map(); const emit = (e) => { try { if (op.onEvent) op.onEvent(e); } catch (x) { /* ignore listener errors */ } };
    const jitter = T.rng(op.seed + 99);
    const queue = []; for (const c of op.cases) for (const cfg of op.configs) queue.push({ c, cfg });
    const total = queue.length; const results = []; const st = { status: 'idle', spent: 0, reserved: 0, cap: Math.max(1, op.concurrency | 0), okStreak: 0, retries: 0, rateLimited: 0, cacheHits: 0, unknownPrice: new Set(), stopReason: '', inflight: 0 };
    let paused = false; let stopped = false; let resumeFn = null; let pauseP = null; const ctls = new Set();
    function pause() { if (stopped || paused || st.status !== 'running') return; paused = true; st.status = 'paused'; pauseP = new Promise((r) => { resumeFn = r; }); emit({ type: 'paused' }); }
    function resume() { if (!paused) return; paused = false; st.status = 'running'; const f = resumeFn; resumeFn = null; pauseP = null; if (f) f(); emit({ type: 'resumed' }); }
    function stop(reason) { if (stopped) return; stopped = true; st.stopReason = reason || 'stopped'; for (const c of ctls) { try { c.abort(); } catch (e) { /* ignore */ } } if (paused) resume(); emit({ type: 'stopping', reason: st.stopReason }); }
    async function callWithRetry(it, prompt) {
      let last = null;
      for (let a = 0; a <= op.retries; a++) {
        if (stopped) throw Object.assign(new Error('Stopped before this call finished.'), { stopped: true });
        const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null; if (ctl) ctls.add(ctl);
        try { const r = await op.call(it.cfg, prompt, it.c, { attempt: a, signal: ctl && ctl.signal, seed: op.seed }); return { r, attempts: a + 1 }; }
        catch (e) {
          last = e; if (stopped) throw Object.assign(new Error('Stopped before this call finished.'), { stopped: true });
          if (e.status === 401 || e.status === 403) { stop('auth'); throw e; }
          if (!RETRYABLE(e) || a === op.retries) throw Object.assign(e, { attempts: a + 1 });
          if (e.status === 429) { st.rateLimited++; const before = st.cap; st.cap = Math.max(1, Math.floor(st.cap / 2)); st.okStreak = 0; if (before !== st.cap) emit({ type: 'throttle', cap: st.cap }); }
          const backoff = Math.min(op.maxBackoffMs, op.backoffMs * Math.pow(2, a)) * (0.75 + 0.5 * jitter());
          const wait = Math.max(e.retryAfterMs || 0, backoff); st.retries++;
          emit({ type: 'retry', caseId: it.c.id, configId: it.cfg.id, attempt: a + 1, status: e.status || 'network', waitMs: Math.round(wait), message: e.message });
          await sleep(wait);
        } finally { if (ctl) ctls.delete(ctl); }
      }
      throw last;
    }
    async function runItem(it) {
      const prompt = buildPrompt(it.cfg, it.c); const key = cacheKey(it.cfg, prompt);
      const base = { caseId: it.c.id, configId: it.cfg.id };
      let r; let attempts = 0; let cached = false;
      if (op.useCache && cache.has(key)) { r = JSON.parse(JSON.stringify(cache.get(key))); cached = true; st.cacheHits++; }
      else {
        // Reserve 20% headroom on the input estimate; providers count tokens a little differently from our estimate.
        const estIn = Math.ceil(TK.estimate(prompt.system + '\n' + prompt.user) * 1.2) + 16; const price = P.lookup(it.cfg.model, op.prices);
        if (!price && it.cfg.provider !== 'mock') st.unknownPrice.add(it.cfg.model);
        const worst = P.worstCase(estIn, it.cfg.maxTokens || 512, it.cfg.model, op.prices);
        if (op.budgetUsd != null && st.spent + st.reserved + worst > op.budgetUsd + 1e-12) { stop('budget'); return Object.assign(base, { skipped: 'budget' }); }
        st.reserved += worst;
        try { const x = await callWithRetry(it, prompt); r = x.r; attempts = x.attempts; }
        catch (e) {
          st.reserved -= worst;
          if (e.stopped) return Object.assign(base, { skipped: 'stopped' });
          return Object.assign(base, { error: String(e.message || e).slice(0, 300), status: e.status || null, attempts: e.attempts || 1, pass: false, scores: {}, latencyMs: null, usage: null, cost: 0, fullCost: 0 });
        }
        st.reserved -= worst;
        const usage = TK.usage(r.usageReported ? r.usage : null, prompt.system + '\n' + prompt.user, r.text);
        r = { text: String(r.text || ''), usage, latencyMs: r.latencyMs, ttftMs: r.ttftMs == null ? null : r.ttftMs, stop: r.stop || null, simulated: !!r.simulated, model: r.model || it.cfg.model };
        r.cost = P.cost(usage, it.cfg.model, op.prices) || 0; st.spent += r.cost;
        if (op.useCache) cache.set(key, r);
      }
      const sc = await S.scoreAll(op.scorers || [], it.c, r.text, op.scoreCtx || {});
      return Object.assign(base, { output: r.text, usage: r.usage, latencyMs: r.latencyMs, ttftMs: r.ttftMs, stop: r.stop, simulated: r.simulated, cost: cached ? 0 : r.cost, fullCost: r.cost, cached, attempts, scores: sc.scores, pass: sc.pass });
    }
    async function worker(id) {
      for (;;) {
        if (stopped) return; if (paused) { await pauseP; continue; }
        if (id >= st.cap) { await idle(); if (!queue.length) return; continue; }
        const it = queue.shift(); if (!it) return;
        st.inflight++; const res = await runItem(it); st.inflight--;
        if (res.skipped && queue.length === 0 && res.skipped === 'budget') { /* stop already requested */ }
        if (!res.skipped || res.skipped === 'cache') results.push(res); else results.push(res);
        if (!res.error && !res.skipped) { st.okStreak++; if (st.okStreak >= 8 && st.cap < op.concurrency) { st.cap++; st.okStreak = 0; emit({ type: 'throttle', cap: st.cap }); } }
        emit({ type: 'progress', done: results.filter((x) => !x.skipped).length, total, spent: st.spent, item: res });
      }
    }
    async function start() {
      st.status = 'running'; emit({ type: 'start', total });
      const ws = []; for (let i = 0; i < Math.max(1, op.concurrency | 0); i++) ws.push(worker(i));
      await Promise.all(ws);
      for (const it of queue.splice(0)) results.push({ caseId: it.c.id, configId: it.cfg.id, skipped: st.stopReason === 'budget' ? 'budget' : 'stopped' });
      st.status = stopped ? (st.stopReason === 'budget' ? 'budget' : st.stopReason === 'auth' ? 'auth' : 'stopped') : 'done';
      emit({ type: 'done', status: st.status, spent: st.spent });
      return { status: st.status, results, spent: st.spent, retries: st.retries, rateLimited: st.rateLimited, cacheHits: st.cacheHits, unknownPrice: Array.from(st.unknownPrice) };
    }
    return { start, pause, resume, stop, state: st, results, total, get paused() { return paused; }, get stopped() { return stopped; } };
  }
  return { render, templateVars, buildPrompt, cacheKey, createRun, RETRYABLE };
});
