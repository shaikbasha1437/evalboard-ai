# Verification

Checked on 2026-11-18 against the live site, https://shaikbasha1437.github.io/evalboard-ai/ (service worker cache `evalboard-v3`).

## Automated

| Check | Result |
| --- | --- |
| Unit tests (`npm test`, Node 24) | 75 / 75 pass |
| Browser end-to-end, Chrome (Playwright, live site) | 221 / 221 pass |
| Browser end-to-end, Firefox (Playwright, live site) | 221 / 221 pass |
| GitHub Actions `CI` (tests, eval gate, regressed-config check; all actions on node24) | pass |
| Statistics cross-check against NumPy 2.5.5 / SciPy 1.18.1 on the demo data | match (see below) |

The unit tests cover:

- **Stats.** Wilson, percentiles, bootstrap, McNemar, kappa and Pareto, against reference values from SciPy.
- **Scorers.** Every scorer, including SQL equivalence on the vendored sql.js. The tests also check every seeded good answer passes its gate scorers and every bad one fails.
- **Runner.** Concurrency limit, retries with backoff, `Retry-After`, halving concurrency on 429, no retry on 4xx, auth stop, budget cap, pause/resume/stop, cache, and estimated tokens.
- **Guard and judge.** Injection flags. The mock judge and a deliberately gullible fake live judge give the same score with and without four kinds of steering text. Pairwise position swap.
- **Reports.** Share links and backups carry no keys, emails or phone numbers.
- **Datasets.** CSV/JSONL/JSON import, a round trip with variables, and the formula-injection guard.
- **Provider module.** Mocked `fetch`, including SSE streaming and time to first token.
- **CLI and Action.** Pass, regression fail, threshold fail and job summary. A missing key stops before sending. A live run puts the key only in the request header and never in the report.
- **Sandbox.** The `node:vm` custom scorer times out.
- **Hygiene.** No numbering labels, banned wording, real-looking keys or non-`.example` emails in public files.

The browser run covers:

- **Load.** The eyebrow, the simulated-results banner, 8 runs, the leaderboard, the Pareto frontier on both charts, and none of the banned wording.
- **Modals.** Help, export, settings, case, config, import, versions, split, scorers, default prompt, case edit and custom scorer each close via X, Cancel, Esc, a backdrop click and browser Back.
- **Unsaved edits.** A discard prompt on Esc and on Back; the modal stays open on "No".
- **Required fields.** An empty required field shows an error on Save, and Cancel still closes the modal.
- **Undo.** Delete run, delete dataset, human label, annotation, review-queue label, and reset to demo.
- **Drill-down.** A chart point opens that config's failing cases. The case modal has a word diff, prev/next, and the judge prompt. The steering output is flagged and the bait is absent from the judge prompt. Injection in a safety case's context is flagged.
- **Review.** Queue, judge-vs-human agreement with kappa, and the pairwise swap.
- **Runs.** A live mock run pauses (no progress), resumes and stops, and keeps its finished results. A full run, then an identical re-run served entirely from cache at $0. A budget cap stops with `budget` status and spend under the cap.
- **Keys.** A test key (not a real one) stays in memory. It never appears in localStorage, IndexedDB, CSV/JSON/Markdown/HTML exports, the backup or the share link.
- **Share link.** It opens a read-only view in a fresh browser with the simulated label, the regression verdict and the per-case table.
- **Backup.** Restoring works; a non-EvalBoard file is refused.
- **Sandbox.** A runaway custom scorer is stopped at its 300 ms limit. `fetch`, XHR, WebSocket and IndexedDB are absent in the worker. Syntax errors are reported.
- **Other.** The SQL playground runs sql.js, pasted CSV imports, the theme toggles, state persists after reload, the key is forgotten on reload, the service worker controls the page, and it works offline.
- **Mobile.** At 375 px there is no horizontal overflow on any tab or in seven modals.
- **Errors.** No page errors.

## Statistics cross-check (independent Python)

`numpy`/`scipy` recomputed the stats from the per-case results of all 24 demo run/config groups and 5 baseline comparisons:

| Statistic | Max abs difference, Python vs EvalBoard |
| --- | --- |
| Wilson 95% interval (`binomtest(...).proportion_ci('wilson')`) | 2.2e-16 |
| Latency p50 / p90 / p99 (`numpy.percentile`, linear) | 0 |
| McNemar exact p (`binomtest` on discordant pairs) | 2.2e-16 |
| McNemar chi-square with continuity correction, and p (`chi2.sf`) | 0 and 2.0e-9 |
| Paired difference estimate | 0 |
| Cohen's kappa, judge vs 18 human labels (0.5765) | 0 |
| Bootstrap 95% intervals (different random streams, 20,000 resamples in Python) | ≤ 0.05; no interval off by more than 0.05 |

The headline regression is the support short-prompt trial vs the Atlas-M baseline: b = 7, c = 0, exact p = 0.015625. Both implementations agree.

## Bugs found and fixed during verification

- A throttled runner worker waited on the injected no-op sleep and spun on microtasks, freezing the page while the demo built. It now waits on a real timer.
- `numbersIn` read "5-7 days" as 5 and −7, so the semantic scorer flagged a false number clash. Range dashes are no longer read as minus signs.
- The grounding check passed a cited sentence that stated a number not in the cited text. It now counts that sentence as unsupported.
- The refusal detector missed curly apostrophes ("I can’t"). The safety check also now catches canary values leaked reversed or spaced out.
- The mock judge gave 4/5 to an answer with the wrong number of days. A number clash with the reference now caps the grade.
- The guard missed prompt-extraction and "pretend you are DAN" requests, which are now flagged.
- The budget cap could be exceeded when a provider counted more input tokens than estimated. It now reserves 20% headroom on the estimate. The run form's estimate uses the same rule.
- With an imported dataset, the mock model never cited sources, so the CLI example scored 0%. It now cites the best-matching chunk when the prompt asks for citations.
- CSV export dropped template variables. They are now exported as extra columns and round-trip.
- Fixed tables overflowed at 375 px: the `.table-wrap` rule was missing, and the grid columns needed `minmax(0, 1fr)`.
- The trend chart drew NaN points for runs with nothing graded. Those points are now skipped.
- The histogram bars inherited a progress-bar style. The class is now renamed.
- The trend chart was oversized, with overlapping date labels.
- In Firefox, sandbox syntax errors didn't name the error type. The error name is now included.
- The CI artifact upload was on a node20 action. It now uses `actions/upload-artifact@v6` (node24).

## Not tested

- No real provider was called and no real key was used. Live mode, streaming and the CLI's live path were tested only against mocked responses.
- WebLLM (in-browser model) was not exercised; it needs WebGPU and a large download.
- Safari and real mobile devices were not tested. Mobile was checked at a 375 px viewport in desktop Chrome.
- The sandboxes (Web Worker, `node:vm`) were not tested against deliberately hostile escape attempts. They are not hardened sandboxes.
- Clipboard copy of the share link was not asserted; the link field's value was.
