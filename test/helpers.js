/* Shared test helpers: sql.js from the vendored copy, and the demo built once the same way the page builds it. */
const path = require('node:path');
const init = require('../vendor/sqljs/sql-wasm.js');
let p = null; const sql = () => p || (p = init({ locateFile: (f) => path.join(__dirname, '..', 'vendor', 'sqljs', f) }));
const D = require('../js/demo.js'); let demoP = null; const demo = () => demoP || (demoP = D.build(sql));
const itemsOf = (run, cfgId) => run.results.filter((i) => i.configId === cfgId);
const dsOf = (st, run) => st.datasets.find((d) => d.id === run.datasetId);
module.exports = { sql, demo, itemsOf, dsOf };
