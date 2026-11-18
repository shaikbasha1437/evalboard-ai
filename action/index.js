/* GitHub Action entry point for the EvalBoard gate. No dependencies: inputs come from INPUT_* variables and
   outputs go to the GITHUB_OUTPUT file. API keys, when a config uses a live provider, come from the env
   variables the workflow maps from secrets; they are never written to the report. */
'use strict';
const fs = require('node:fs'); const path = require('node:path');
const cli = require(path.join(__dirname, '..', 'cli', 'evalboard.js'));
const input = (name, def) => { const v = process.env['INPUT_' + name.toUpperCase()]; return v == null || v === '' ? def : v.trim(); };
function setOutput(name, value) { const f = process.env.GITHUB_OUTPUT; if (f) fs.appendFileSync(f, name + '=' + String(value).replace(/\r?\n/g, ' ') + '\n'); }
async function main() {
  const ws = process.env.GITHUB_WORKSPACE || process.cwd();
  const config = path.resolve(ws, input('config', '')); const outDir = path.resolve(ws, input('out_dir', 'evalboard-report'));
  const args = [config, '--out', outDir, '--quiet']; if (input('mock', 'true') !== 'false') args.push('--mock');
  const code = await cli.main(args);
  setOutput('passed', code === 0 ? 'true' : 'false'); setOutput('report_json', path.join(outDir, 'report.json')); setOutput('report_md', path.join(outDir, 'report.md'));
  if (code === 0) return 0;
  if (code === 1 && input('fail_on_gate', 'true') === 'false') { process.stdout.write('::warning::EvalBoard gate failed (fail_on_gate is false).\n'); return 0; }
  process.stdout.write('::error::EvalBoard gate failed. See the job summary or ' + path.join(outDir, 'report.md') + '.\n');
  return code;
}
main().then((c) => { process.exitCode = c; }, (e) => { process.stdout.write('::error::' + e.message + '\n'); process.exitCode = 2; });
