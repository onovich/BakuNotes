import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createNote, validateNoteFields, searchDreams, setNoteTrashed, recoverNoteCopies } from '../src/journal.ts';
import { parseDreamArchive, serializeDreamArchive, parseImportFiles } from '../src/import.ts';
import { executeOperation } from '../tools/operations.mjs';

test('trash, restore, tags and unknown-date sorting survive backup without losing sources', () => {
  const first = createNote(validateNoteFields({ body: '梦见纸船', dreamDate: '2026-10-02', tags: ['海'] }), 'first', '2026-10-02T08:00:00Z');
  const second = { ...first, id: 'second', dreamDate: '', sourceDetails: { system: 'evernote', notebook: '合成来源' } };
  const trashed = setNoteTrashed(second, true, '2026-10-02T09:00:00Z');
  const restoredBackup = parseDreamArchive(serializeDreamArchive([first, trashed]));
  assert.equal(searchDreams(restoredBackup, '').length, 1);
  assert.equal(searchDreams(restoredBackup, '', { trash: true })[0].id, second.id);
  assert.deepEqual(restoredBackup[1].sourceDetails, second.sourceDetails);
  const restored = setNoteTrashed(restoredBackup[1], false, '2026-10-02T10:00:00Z');
  assert.equal(searchDreams([restored, first], '')[1].id, restored.id);
  assert.equal(searchDreams([restored, first], '', { sort: 'oldest' })[1].id, restored.id);
  assert.equal(searchDreams([restored, first], '', { tag: '不存在' }).length, 0);
  assert.equal(searchDreams([restored, first], '', { tag: '海', sort: 'updated' })[0].id, restored.id);
  assert.throws(() => parseDreamArchive(serializeDreamArchive([{ ...first, trashedAt: 'invalid' }])));
});
test('recovery copies only unsaved changes, never overwrites current records and is repeatable', () => {
  const before = createNote({ body: '保存前' }, 'original', '2026-10-02T08:00:00Z');
  const untouched = { ...before, id: 'untouched' };
  const local = { ...before, body: '本地未保存草稿' };
  const remote = { ...before, body: '另一个窗口已经保存' };
  const recovery = { id: 'test', baseline: [before, untouched], snapshot: [local, untouched], savedAt: '2026-10-02T09:00:00Z' };
  const merged = recoverNoteCopies([remote, untouched], recovery, '2026-10-02T10:00:00Z');
  assert.equal(merged.length, 3);
  assert.equal(merged.find(note => note.id === 'original').body, remote.body);
  assert.equal(merged[0].body, local.body);
  assert.equal(recoverNoteCopies(merged, recovery, '2026-10-02T11:00:00Z').length, 3);
});
test('text import reports individual failures and aligns remaining timestamp candidates', () => {
  const preview = parseImportFiles([{ name: 'empty.txt', content: '' }, { name: 'folder/dream.md', content: '2026年10月2日\n合成梦境' }, { name: 'broken.txt', content: '', error: '读取失败' }]);
  assert.equal(preview.dreams.length, 1);
  assert.equal(preview.report.errors.length, 2);
  assert.equal(preview.timeCandidates[0].find(time => time.source === 'first').value, '2026-10-02');
  assert.equal(preview.dreams[0].sourceDetails.filename, 'folder/dream.md');
});
test('recursive folder import keeps stable relative paths and names through plan commit', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'baku-folder-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const folder = path.join(root, 'source'); await fs.mkdir(path.join(folder, 'nested'), { recursive: true });
  await fs.writeFile(path.join(folder, 'same.md'), '合成第一篇');
  await fs.writeFile(path.join(folder, 'nested', 'same.md'), '合成第二篇');
  await fs.writeFile(path.join(folder, 'empty.txt'), '');
  await fs.writeFile(path.join(folder, 'ignore.png'), 'not-an-image');
  const vault = path.join(root, 'vault'), plan = path.join(root, 'plan.json');
  const preview = await executeOperation('import preview', { vault, files: [folder], output: plan });
  assert.equal(preview.records.length, 2); assert.equal(preview.errors.length, 1);
  const committed = await executeOperation('import commit', { vault, plan, 'select-all': true });
  assert.equal(committed.imported, 2);
  const list = await executeOperation('notes list', { vault });
  assert.deepEqual(new Set(list.records.map(note => note.id)), new Set(preview.records.map(note => note.id)));
});
