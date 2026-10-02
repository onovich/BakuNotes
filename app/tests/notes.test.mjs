import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { transact, readVault } from '../tools/fileVault.mjs';
import { createWebServer } from '../tools/webServer.mjs';
import { createFileStorage } from '../src/fileStorage.ts';

const cli = fileURLToPath(new URL('../tools/baku.mjs', import.meta.url));
const mcp = fileURLToPath(new URL('../tools/mcp.mjs', import.meta.url));
function invoke(...args) {
  const result = spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', cli, '--json', ...args], { encoding: 'utf8' });
  return { status: result.status, value: JSON.parse(result.status === 0 ? result.stdout : result.stderr) };
}
test('CLI create/update persist, replay without duplicates and protect source metadata and newer revisions', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'baku-note-cli-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const vault = path.join(root, 'vault'), input = path.join(root, 'input.json');
  await fs.writeFile(input, JSON.stringify({ body: '合成新笔记', tags: ['测试'] }));
  const createArgs = ['notes', 'create', '--vault', vault, '--input', input, '--expected-revision', '0', '--request-id', 'create-001'];
  const created = invoke(...createArgs); assert.equal(created.status, 0);
  assert.equal(created.value.record.dreamDate, '');
  assert.equal(created.value.record.recordedAt, created.value.record.createdAt);
  const replay = invoke(...createArgs); assert.equal(replay.value.replayed, true);
  assert.equal(replay.value.record.id, created.value.record.id);
  assert.equal(invoke('status', '--vault', vault).value.count, 1);
  await fs.writeFile(input, JSON.stringify({ body: '另一个请求内容' }));
  assert.equal(invoke(...createArgs).value.code, 'CONFLICT');
  assert.equal(invoke('notes', 'create', '--vault', vault, '--input', input, '--expected-revision', '0', '--request-id', 'stale-001').value.code, 'CONFLICT');
  await transact(vault, state => {
    const dreams = state.dreams.map(d => ({ ...d, source: 'evernote', sourcePath: 'source.enex',
      sourceDetails: { system: 'evernote', notebook: '合成来源' }, sourceCreatedAt: '2020-01-01',
      sourceUpdatedAt: '2020-02-01', importedAt: '2026-01-01T00:00:00Z', attachments: [{ path: 'assets/a.png', mime: 'image/png' }] }));
    return { next: { ...state, revision: state.revision + 1, dreams }, result: null };
  });
  const prior = (await readVault(vault)).dreams[0];
  await fs.writeFile(input, JSON.stringify({ body: '修改后的合成正文', dreamDate: '2026-10-02', recordedAt: null, tags: [] }));
  const updateArgs = ['notes', 'update', '--vault', vault, '--id', prior.id, '--input', input, '--expected-revision', '2', '--request-id', 'update-001'];
  const updated = invoke(...updateArgs); assert.equal(updated.status, 0);
  const record = updated.value.record;
  for (const key of ['id','createdAt','source','sourcePath','sourceDetails','sourceCreatedAt','sourceUpdatedAt','importedAt','attachments']) assert.deepEqual(record[key], prior[key], key);
  assert.equal(record.recordedAt, null); assert.equal(record.body, '修改后的合成正文');
  assert.equal(invoke(...updateArgs).value.replayed, true);
  assert.equal(invoke('notes','get','--vault',vault,'--id',prior.id).value.record.body, record.body);
  for (const invalid of [{ dreamDate: '2026-02-30' }, { id: 'replacement' }, { source: 'new' }, {}, { recordedAt: 'yesterday' }, { tags: [1] }]) {
    await fs.writeFile(input, JSON.stringify(invalid));
    const result = invoke('notes','update','--vault',vault,'--id',prior.id,'--input',input,'--expected-revision','3','--request-id','invalid-001');
    assert.notEqual(result.status, 0);
    assert.equal((await readVault(vault)).revision, 3);
  }
  await fs.writeFile(input, JSON.stringify({ title: '新标题' }));
  assert.equal(invoke('notes','update','--vault',vault,'--id','absent','--input',input,'--expected-revision','3','--request-id','missing-001').value.code, 'NOT_FOUND');
  assert.equal(invoke('notes','create','--vault',vault,'--input',input,'--request-id','no-revision').value.code, 'INVALID_ARGUMENT');
  await fs.writeFile(input, JSON.stringify({ title: ' ', body: '' }));
  assert.notEqual(invoke('notes','create','--vault',vault,'--input',input,'--expected-revision','3','--request-id','empty-001').status, 0);
  assert.equal((await readVault(vault)).revision, 3);
});

test('MCP create/update are idempotent, enforce revisions and readonly, and appear in the web adapter', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'baku-note-mcp-'));
  const vault = path.join(root, 'vault');
  const client = new Client({ name: 'note-test', version: '1' });
  const readonly = new Client({ name: 'readonly-test', version: '1' });
  let server;
  t.after(async () => { await client.close(); await readonly.close(); if (server) await new Promise(resolve => server.close(resolve)); await fs.rm(root, { recursive: true, force: true }); });
  const transport = readOnly => new StdioClientTransport({ command: process.execPath,
    args: ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',mcp,'--vault',vault,'--root',root,...(readOnly ? ['--read-only'] : [])], stderr: 'pipe' });
  await client.connect(transport(false)); await readonly.connect(transport(true));
  const tools = (await client.listTools()).tools;
  assert.equal(tools.length, 9);
  assert.equal(tools.find(tool => tool.name === 'notes_update').annotations.idempotentHint, true);
  assert.equal((await readonly.listTools()).tools.some(tool => tool.name === 'notes_create'), false);
  const call = async (name, args) => (await client.callTool({ name, arguments: args })).structuredContent;
  const args = { expectedRevision: 0, requestId: 'mcp-create-001', title: '合成 MCP 笔记', body: '基础 Markdown **原样保留**', dreamDate: '2026-10-02' };
  const created = await call('notes_create', args); assert.equal(created.ok, true);
  assert.equal((await call('notes_create', args)).replayed, true);
  assert.equal((await call('notes_create', { ...args, body: 'changed' })).code, 'CONFLICT');
  const dist = path.join(root, 'dist'); await fs.mkdir(dist); await fs.writeFile(path.join(dist, 'index.html'), 'test');
  const host = await createWebServer({ vault, dist }); server = host.server;
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const storage = createFileStorage(`http://127.0.0.1:${server.address().port}`, host.token);
  const loaded = await storage.load(); assert.equal(loaded[0].id, created.record.id);
  const edit = { expectedRevision: 1, requestId: 'mcp-update-001', id: created.record.id, patch: { title: '编辑后标题', recordedAt: '2026年10月2日 08:30' } };
  const updated = await call('notes_update', edit); assert.equal(updated.ok, true);
  assert.equal(updated.record.body, args.body);
  assert.equal((await call('notes_update', edit)).replayed, true);
  assert.equal((await call('notes_update', { ...edit, requestId: 'stale-edit-001' })).code, 'CONFLICT');
  await assert.rejects(storage.save(loaded), /文件库已被其他/);
  assert.equal((await storage.load())[0].title, '编辑后标题');
  assert.equal((await call('notes_update', { ...edit, expectedRevision: 2, requestId: 'bad-patch-001', patch: {} })).ok, false);
  const immutable = await client.callTool({ name: 'notes_update', arguments: { ...edit, patch: { source: 'other' } } });
  assert.equal(immutable.isError, true);
  const denied = await readonly.callTool({ name: 'notes_create', arguments: args });
  assert.equal(denied.isError, true);
  assert.equal((await readVault(vault)).revision, 2);
});
