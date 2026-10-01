import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { transact } from '../tools/fileVault.mjs';

const cli = fileURLToPath(new URL('../tools/baku.mjs', import.meta.url));
function invoke(...args) {
  const result = spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', cli, '--json', ...args], { encoding: 'utf8' });
  return { status: result.status, value: JSON.parse(result.status === 0 ? result.stdout : result.stderr) };
}
test('CLI survives process restart, restores backups, replays commits and rejects changed plans', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'baku-cli-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const vault = path.join(root, 'first'), second = path.join(root, 'second');
  const source = path.join(root, '虚构.txt'), plan = path.join(root, 'plan.json');
  const choices = path.join(root, 'choices.json');
  await fs.writeFile(source, '2026年10月1日\n虚构的海边梦境', 'utf8');
  let result = invoke('import', 'preview', '--vault', vault, '--files', source, '--output', plan, '--choices-output', choices);
  assert.equal(result.status, 0);
  assert.equal(result.value.records[0].timeCandidates[0].value, '2026-10-01');
  assert.deepEqual(JSON.parse(await fs.readFile(choices, 'utf8')), result.value.choicesTemplate);
  const rows = result.value.choicesTemplate;
  rows[0].selected = true; rows[0].time.key = 'first:0'; rows[0].time.target = 'both';
  await fs.writeFile(choices, JSON.stringify(rows));
  result = invoke('import', 'commit', '--vault', vault, '--plan', plan, '--choices', choices);
  assert.equal(result.status, 0); assert.equal(result.value.imported, 1);
  assert.equal(invoke('import', 'commit', '--vault', vault, '--plan', plan, '--choices', choices).value.replayed, true);
  const record = invoke('notes', 'get', '--vault', vault, '--id', rows[0].id).value.record;
  assert.equal(record.dreamDate, '2026-10-01'); assert.equal(record.recordedAt, '2026-10-01');
  const backup = path.join(root, 'backup.jsonl');
  assert.equal(invoke('backup', 'export', '--vault', vault, '--output', backup).status, 0);
  assert.equal(invoke('backup', 'verify', '--file', backup).value.count, 1);
  assert.equal(invoke('backup', 'export', '--vault', vault, '--output', backup).value.code, 'EEXIST');
  const restore = path.join(root, 'restore.json');
  assert.equal(invoke('import', 'preview', '--vault', second, '--files', backup, '--output', restore).status, 0);
  assert.equal(invoke('import', 'commit', '--vault', second, '--plan', restore, '--select-all').value.imported, 1);
  assert.deepEqual(invoke('notes', 'get', '--vault', second, '--id', record.id).value.record, record);
  assert.equal(invoke('notes', 'list', '--vault', second, '--query', '海边').value.total, 1);
  const duplicate = path.join(root, 'duplicate.json');
  assert.equal(invoke('import', 'preview', '--vault', second, '--files', backup, '--output', duplicate).value.records[0].duplicate, 'existing');
  assert.equal(invoke('import', 'commit', '--vault', second, '--plan', duplicate, '--select-all').value.imported, 0);
  const stale = path.join(root, 'stale.json'), fresh = path.join(root, 'fresh.json');
  invoke('import', 'preview', '--vault', vault, '--files', source, '--output', stale);
  invoke('import', 'preview', '--vault', vault, '--files', source, '--output', fresh);
  assert.equal(invoke('import', 'commit', '--vault', vault, '--plan', fresh, '--select-all').status, 0);
  assert.equal(invoke('import', 'commit', '--vault', vault, '--plan', stale, '--select-all').value.code, 'CONFLICT');
  const changed = path.join(root, 'changed.json');
  invoke('import', 'preview', '--vault', vault, '--files', source, '--output', changed);
  await fs.appendFile(source, '\n不同内容');
  assert.equal(invoke('import', 'commit', '--vault', vault, '--plan', changed, '--select-all').value.code, 'SOURCE_CHANGED');
  assert.equal(invoke('status', '--vault', vault).value.count, 1);
});

test('invalid time choices and disk write failures do not partially commit', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'baku-failure-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const vault = path.join(root, 'vault'), source = path.join(root, 'note.md'), plan = path.join(root, 'plan.json');
  await fs.writeFile(source, '虚构笔记，无时间');
  const preview = invoke('import', 'preview', '--vault', vault, '--files', source, '--output', plan).value;
  const choices = path.join(root, 'choices.json');
  await fs.writeFile(choices, JSON.stringify([{ id: preview.records[0].id, selected: true,
    time: { key: 'manual', manual: '2026-02-30', target: 'both' } }]));
  assert.equal(invoke('import', 'commit', '--vault', vault, '--plan', plan, '--choices', choices).status, 2);
  assert.equal(invoke('status', '--vault', vault).value.revision, 0);
  await fs.writeFile(path.join(vault, '.write-lock'), 'test owner');
  assert.equal(invoke('import', 'commit', '--vault', vault, '--plan', plan, '--select-all').value.code, 'VAULT_BUSY');
  await fs.rm(path.join(vault, '.write-lock'));
  // A destination directory prevents replacing vault.json after the snapshot was written.
  await assert.rejects(transact(vault, async state => {
    await fs.mkdir(path.join(vault, 'vault.json'));
    return { next: { ...state, revision: 1 }, result: {} };
  }));
  assert.deepEqual((await fs.readdir(vault)).sort(), ['vault.json']);
});
