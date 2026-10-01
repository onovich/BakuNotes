#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { executeOperation } from './operations.mjs';
let flags, positionals;
try { ({ values: flags, positionals } = parseArgs({ allowPositionals: true, options: {
  vault: { type: 'string' }, json: { type: 'boolean' }, files: { type: 'string', multiple: true },
  output: { type: 'string' }, plan: { type: 'string' }, choices: { type: 'string' },
  'choices-output': { type: 'string' },
  'select-all': { type: 'boolean' }, file: { type: 'string' }, id: { type: 'string' },
  query: { type: 'string' }, offset: { type: 'string' }, limit: { type: 'string' }, help: { type: 'boolean' },
} })); } catch (error) {
  console.error(JSON.stringify({ ok: false, code: 'INVALID_ARGUMENT', message: error.message }));
  process.exit(2);
}
const help = `BakuNotes CLI (Node 24+)\nCommands: status, notes list/get, import preview/commit, backup export/verify\nUse --vault DIRECTORY. baku-web --vault DIRECTORY connects the web app to this library.\npreview: --files PATH (repeat) --output PLAN.json\ncommit: --plan PLAN.json --choices CHOICES.json OR --select-all (keeps times unknown)\nexport: --output BACKUP.jsonl; verify: --file BACKUP.jsonl\nlist: --query WORDS --offset 0 --limit 50; get: --id ID\nUse --json for machine-readable results. Existing output files are never overwritten.`;

try {
  const result = flags.help || !positionals.length ? { help } : await executeOperation(positionals.join(' '), flags);
  console.log(flags.json ? JSON.stringify({ ok: true, ...result }) : result.help || JSON.stringify(result, null, 2));
} catch (error) {
  const code = error.code || 'VALIDATION_FAILED';
  console.error(JSON.stringify({ ok: false, code, message: error.message }));
  process.exitCode = ['CONFLICT','SOURCE_CHANGED','VAULT_BUSY'].includes(code) ? 3 :
    ['INVALID_ARGUMENT','INVALID_PLAN','INVALID_CHOICES','VALIDATION_FAILED','NOT_FOUND','EMPTY_VAULT','INVALID_BACKUP'].includes(code) ? 2 : 4;
}
