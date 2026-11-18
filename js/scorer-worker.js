/* EvalBoard custom-scorer sandbox. Runs user code off the main thread with network and storage APIs removed.
   The page terminates this worker if a call takes longer than the time limit. */
/* global importScripts */
importScripts('text.js', 'custom.js');
(function lockDown() {
  const kill = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'indexedDB', 'caches', 'importScripts', 'BroadcastChannel', 'Worker', 'SharedWorker', 'WebTransport', 'RTCPeerConnection'];
  for (const k of kill) { try { Object.defineProperty(self, k, { value: undefined, configurable: false, writable: false }); } catch (e) { try { self[k] = undefined; } catch (x) { /* ignore */ } } }
  try { Object.defineProperty(navigator, 'sendBeacon', { value: undefined }); } catch (e) { /* ignore */ }
})();
let compiled = null; let compiledSrc = null;
const helpers = Object.freeze({ normalize: self.EB.text.normalize, words: self.EB.text.words });
self.onmessage = (ev) => {
  const { id, code, payload, threshold } = ev.data || {};
  try {
    if (code !== compiledSrc) { compiled = new Function('helpers', self.EB.custom.wrap(code))(helpers); compiledSrc = code; } // eslint-disable-line no-new-func
    if (typeof compiled !== 'function') throw new Error('Define a function named score.');
    Promise.resolve(compiled(Object.freeze(payload))).then((r) => self.postMessage({ id, ok: true, result: self.EB.custom.normalizeResult(r, threshold) }), (e) => self.postMessage({ id, ok: false, error: String((e && e.message) || e) }));
  } catch (e) { self.postMessage({ id, ok: false, error: e && e.name && e.message ? e.name + ': ' + e.message : String(e) }); } // include the name: Firefox's syntax messages don't say "syntax"
};
