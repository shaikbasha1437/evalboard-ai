const test = require('node:test'); const assert = require('node:assert'); const L = require('../js/llm.js');
const FAKE = 'test-key-not-real';
const msg = { system: 's', messages: [{ role: 'user', content: 'hi' }], maxTokens: 50, temperature: 0 };
const jsonRes = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });
function sse(events) { const enc = new TextEncoder(); const chunks = events.map((e) => enc.encode('data: ' + (typeof e === 'string' ? e : JSON.stringify(e)) + '\n\n')); let i = 0; return { ok: true, status: 200, body: { getReader: () => ({ read: async () => (i < chunks.length ? { value: chunks[i++], done: false } : { done: true }) }) } }; }
test('request shapes for each provider (Anthropic carries the browser-access header)', () => {
  const a = L.buildRequest({ provider: 'anthropic', model: 'claude-haiku-4-5', key: FAKE }, msg); assert.strictEqual(a.init.headers['anthropic-dangerous-direct-browser-access'], 'true'); assert.strictEqual(a.init.headers['x-api-key'], FAKE);
  const g = L.buildRequest({ provider: 'gemini', model: 'gemini-2.5-flash', key: FAKE }, msg); assert.match(g.url, /:generateContent$/); assert.strictEqual(g.init.headers['x-goog-api-key'], FAKE);
  const o = L.buildRequest({ provider: 'openai', model: 'gpt-4o-mini', key: FAKE }, msg); assert.match(o.url, /\/chat\/completions$/); assert.match(o.init.headers.authorization || o.init.headers.Authorization, /Bearer/);
  const c = L.buildRequest({ provider: 'compatible', model: 'llama3.2', baseUrl: 'http://localhost:11434/v1/' }, msg); assert.strictEqual(c.url, 'http://localhost:11434/v1/chat/completions');
});
test('a non-streaming call reports usage and errors carry the HTTP status', async () => {
  const ok = await L.call({ provider: 'openai', model: 'gpt-4o-mini', key: FAKE }, msg, { fetch: async () => jsonRes(200, { choices: [{ message: { content: 'yo' }, finish_reason: 'stop' }], usage: { prompt_tokens: 7, completion_tokens: 2 } }) });
  assert.strictEqual(ok.text, 'yo'); assert.deepStrictEqual(ok.usage, { input: 7, output: 2 }); assert.strictEqual(ok.usageReported, true);
  await assert.rejects(L.call({ provider: 'openai', model: 'gpt-4o-mini', key: FAKE }, msg, { fetch: async () => jsonRes(429, { error: { message: 'slow down' } }) }), (e) => e.status === 429);
  await assert.rejects(L.call({ provider: 'openai', model: 'gpt-4o-mini' }, msg, { fetch: async () => { throw new Error('should not be called'); } }), /key/);
});
test('streaming reads SSE, measures time to first token and picks up usage', async () => {
  let t = 0; const now = () => (t += 10); let sent = null;
  const r = await L.call({ provider: 'openai', model: 'gpt-4o-mini', key: FAKE }, Object.assign({ stream: true }, msg), { now, fetch: async (u, init) => { sent = JSON.parse(init.body); return sse([{ choices: [{ delta: { content: 'Hel' } }] }, { choices: [{ delta: { content: 'lo' }, finish_reason: 'stop' }] }, { choices: [], usage: { prompt_tokens: 5, completion_tokens: 2 } }, '[DONE]']); } });
  assert.strictEqual(sent.stream, true); assert.deepStrictEqual(sent.stream_options, { include_usage: true }); assert.strictEqual(r.text, 'Hello'); assert.ok(r.ttftMs > 0 && r.ttftMs < r.latencyMs); assert.strictEqual(r.usageReported, true);
  const a = await L.call({ provider: 'anthropic', model: 'claude-haiku-4-5', key: FAKE }, Object.assign({ stream: true }, msg), { now, fetch: async () => sse([{ type: 'message_start', message: { usage: { input_tokens: 9 } } }, { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi' } }, { type: 'message_delta', usage: { output_tokens: 1 }, delta: { stop_reason: 'end_turn' } }]) });
  assert.strictEqual(a.text, 'Hi'); assert.strictEqual(a.usage.input, 9); assert.strictEqual(a.usage.output, 1);
  const n = await L.call({ provider: 'compatible', model: 'llama3.2' }, Object.assign({ stream: true }, msg), { now, fetch: async () => sse([{ choices: [{ delta: { content: 'x' } }] }]) }); assert.strictEqual(n.usageReported, false);
});
