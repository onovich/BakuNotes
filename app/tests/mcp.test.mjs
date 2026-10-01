import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createPathGuard } from '../tools/pathScope.mjs';

const script = fileURLToPath(new URL('../tools/mcp.mjs', import.meta.url));
async function connect(root, vault, readOnly = false) {
  const client = new Client({ name: 'baku-test', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath,
    args: ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', script, '--vault', vault, '--root', root,
      ...(readOnly ? ['--read-only'] : [])], stderr: 'pipe' });
  await client.connect(transport);
  return client;
}
const call = async (client, name, args = {}) => {
  const result = await client.callTool({ name, arguments: args });
  assert.equal(result.isError, undefined, JSON.stringify(result.structuredContent));
  return result.structuredContent;
};
test('MCP protocol imports, retries, exports and restores with CLI-compatible storage', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'baku-mcp-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const first = await connect(root, path.join(root, 'vault'));
  t.after(() => first.close());
  assert.equal((await first.listTools()).tools.length, 7);
  assert.equal((await call(first, 'journal_status')).count, 0);
  const file = path.join(root, '虚构.txt'), plan = path.join(root, 'plan.json');
  await fs.writeFile(file, '2026年10月1日\n虚构梦见一盏灯');
  const preview = await call(first, 'import_preview', { files: [file], output: plan });
  const choices = [{ id: preview.records[0].id, selected: true,
    time: { key: 'first:0', manual: '', target: 'both' } }];
  assert.equal((await call(first, 'import_commit', { plan, choices })).imported, 1);
  assert.equal((await call(first, 'import_commit', { plan, choices })).replayed, true);
  const record = (await call(first, 'notes_get', { id: choices[0].id })).record;
  assert.equal(record.dreamDate, '2026-10-01');
  const backup = path.join(root, 'backup.jsonl');
  const exported = await call(first, 'backup_export', { output: backup });
  assert.equal((await call(first, 'backup_verify', { file: backup })).sha256, exported.sha256);
  assert.equal((await call(first, 'notes_list', { query: '灯' })).total, 1);
  const otherVault = path.join(root, 'other');
  const second = await connect(root, otherVault);
  t.after(() => second.close());
  const restore = path.join(root, 'restore.json');
  await call(second, 'import_preview', { files: [backup], output: restore });
  assert.equal((await call(second, 'import_commit', { plan: restore, selectAll: true })).imported, 1);
  assert.deepEqual((await call(second, 'notes_get', { id: record.id })).record, record);
  const cli = fileURLToPath(new URL('../tools/baku.mjs', import.meta.url));
  const output = spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', cli, 'status', '--vault', otherVault, '--json'], { encoding: 'utf8' });
  assert.equal(output.status, 0); assert.equal(JSON.parse(output.stdout).count, 1);
  const outside = await first.callTool({ name: 'backup_verify', arguments: { file: path.join(root, '..', 'outside.jsonl') } });
  assert.equal(outside.isError, true); assert.equal(outside.structuredContent.code, 'PATH_OUTSIDE_ROOT');
  const invalid = await first.callTool({ name: 'notes_list', arguments: { limit: 501 } });
  assert.equal(invalid.isError, true);
  const readonly = await connect(root, otherVault, true);
  t.after(() => readonly.close());
  assert.deepEqual((await readonly.listTools()).tools.map(tool => tool.name).sort(), ['backup_verify','journal_status','notes_get','notes_list']);
  assert.equal((await call(readonly, 'journal_status')).count, 1);
});

test('directory scope rejects symlink escapes, sibling prefixes and forged plan sources', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'baku-scope-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const allowed = path.join(root, 'allowed'), outside = path.join(root, 'allowed-sibling');
  await fs.mkdir(allowed); await fs.mkdir(outside);
  await fs.symlink(outside, path.join(allowed, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  const guard = await createPathGuard([allowed]);
  await assert.rejects(guard(path.join(allowed, 'escape', 'new.json')), { code: 'PATH_OUTSIDE_ROOT' });
  await assert.rejects(guard(path.join(outside, 'new.json')), { code: 'PATH_OUTSIDE_ROOT' });
  await guard(path.join(allowed, 'new', 'file.json'));
  const client = await connect(allowed, path.join(allowed, 'vault'));
  t.after(() => client.close());
  const source = path.join(allowed, 'note.txt'), planPath = path.join(allowed, 'plan.json');
  await fs.writeFile(source, '虚构笔记');
  await call(client, 'import_preview', { files: [source], output: planPath });
  const plan = JSON.parse(await fs.readFile(planPath, 'utf8'));
  plan.files[0].path = path.join(outside, 'private.txt');
  const { id: ignored, ...payload } = plan;
  plan.id = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  await fs.writeFile(planPath, JSON.stringify(plan));
  const rejected = await client.callTool({ name: 'import_commit', arguments: { plan: planPath, selectAll: true } });
  assert.equal(rejected.isError, true); assert.equal(rejected.structuredContent.code, 'PATH_OUTSIDE_ROOT');
  assert.equal((await call(client, 'journal_status')).count, 0);
});
