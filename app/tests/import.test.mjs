import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { buildImportCandidates, parseImportFiles, serializeDreamArchive } from '../src/import.ts';

const note = {
  id: 'note-1',
  title: '海上的灯',
  body: '梦见一座灯塔。',
  dream_date: null,
  recorded_at: null,
  source_created_at: '2026-09-29T23:00:00+00:00',
  source_updated_at: '2026-09-30T00:00:00+00:00',
  tags: ['海'],
  source: { system: 'enex', export_file: 'sample.enex', note_index: 1 },
  attachments: [{ path: 'attachments/light.txt', filename: 'light.txt' }],
};
const jsonl = JSON.stringify(note) + '\n';
const checksum = bytesToHex(sha256(utf8ToBytes(jsonl)));
const manifest = {
  format: 'bakunotes-import-v1',
  source_file: 'sample.enex',
  source_note_count: 2,
  converted_count: 1,
  error_count: 1,
  errors: [{ note_index: 2, title: '坏笔记', error: 'invalid resource' }],
  archive_sha256: checksum,
};

test('previews a verified conversion report and preserves source metadata on backup', () => {
  const preview = parseImportFiles([
    { name: 'dreams.jsonl', content: jsonl },
    { name: 'manifest.json', content: JSON.stringify(manifest) },
  ]);
  assert.equal(preview.report.errors[0].noteIndex, 2);
  assert.equal(preview.dreams[0].recordedAt, null);
  assert.equal(preview.dreams[0].sourceDetails.export_file, 'sample.enex');
  const restored = parseImportFiles([{ name: 'backup.jsonl', content: serializeDreamArchive(preview.dreams) }]);
  assert.deepEqual(restored.dreams[0].attachments, note.attachments);
  assert.equal(restored.dreams[0].sourceCreatedAt, note.source_created_at);
  assert.equal(restored.dreams[0].recordedAt, null);
});

test('rejects a report paired with different JSONL content', () => {
  assert.throws(() => parseImportFiles([
    { name: 'dreams.jsonl', content: jsonl.replace('灯塔', '城市') },
    { name: 'manifest.json', content: JSON.stringify(manifest) },
  ]), /校验值不一致/);
});

test('asks for conversion before an ENEX file is imported into the journal', () => {
  assert.throws(() => parseImportFiles([{ name: 'sample.enex', content: '<en-export />' }]), /先用 ENEX 转换器/);
});

test('shows existing and in-file duplicates before selection', () => {
  const preview = parseImportFiles([{ name: 'backup.jsonl', content: jsonl + jsonl }]);
  assert.deepEqual(buildImportCandidates(preview.dreams, []).map((item) => item.duplicate), [null, 'file']);
  assert.deepEqual(buildImportCandidates(preview.dreams, ['note-1']).map((item) => item.duplicate),
    ['existing', 'existing']);
});

test('allows a conversion with only failures when its report matches the empty JSONL', () => {
  const emptyManifest = {
    ...manifest,
    source_note_count: 1,
    converted_count: 0,
    archive_sha256: bytesToHex(sha256(utf8ToBytes(''))),
  };
  const preview = parseImportFiles([
    { name: 'dreams.jsonl', content: '' },
    { name: 'manifest.json', content: JSON.stringify(emptyManifest) },
  ]);
  assert.equal(preview.dreams.length, 0);
  assert.equal(preview.report.errors.length, 1);
});

test('imports multiple text files with literal Markdown and unknown dates', () => {
  const preview = parseImportFiles([
    { name: '海边.TXT', content: '\uFEFF普通文字。\r\n第二行。\r\n' },
    { name: '灯塔.md', content: '# 灯塔\n\n- 海浪\n**醒来**\n' },
  ]);
  assert.equal(preview.format, 'text');
  assert.equal(preview.dreams.length, 2);
  assert.equal(preview.dreams[0].title, '海边');
  assert.equal(preview.dreams[0].body, '普通文字。\n第二行。\n');
  assert.equal(preview.dreams[1].body, '# 灯塔\n\n- 海浪\n**醒来**\n');
  for (const dream of preview.dreams) {
    assert.equal(dream.dreamDate, '');
    assert.equal(dream.createdAt, '');
    assert.equal(dream.recordedAt, null);
  }
  const backup = serializeDreamArchive(preview.dreams);
  const restored = parseImportFiles([{ name: 'backup.jsonl', content: backup }]);
  assert.equal(serializeDreamArchive(restored.dreams), backup);
  assert.equal(restored.dreams[1].sourceDetails.filename, '灯塔.md');
});

test('text IDs are repeatable across BOM and newline conventions, and changes create a new ID', () => {
  const original = parseImportFiles([{ name: '梦.markdown', content: '\uFEFF一行\r\n两行' }]).dreams[0];
  const repeated = parseImportFiles([{ name: '梦.markdown', content: '一行\n两行' }]).dreams[0];
  assert.equal(original.id, repeated.id);
  assert.equal(buildImportCandidates([repeated], [original.id])[0].duplicate, 'existing');
  const changed = parseImportFiles([{ name: '梦.markdown', content: '一行\n修改' }]).dreams[0];
  const renamed = parseImportFiles([{ name: '改名.markdown', content: '一行\n两行' }]).dreams[0];
  assert.notEqual(changed.id, original.id);
  assert.notEqual(renamed.id, original.id);
});

test('rejects empty or non-text notes and mixed archive selections before import', () => {
  assert.throws(() => parseImportFiles([{ name: '空白.txt', content: ' \n' }]), /空白.txt：文件没有正文/);
  assert.throws(() => parseImportFiles([{ name: 'utf16.txt', content: 'a\0b' }]), /UTF-8/);
  assert.throws(() => parseImportFiles([{ name: 'gbk.txt', content: '乱码\uFFFD' }]), /检查编码/);
  assert.throws(() => parseImportFiles([
    { name: '梦.txt', content: '梦' }, { name: 'backup.jsonl', content: jsonl },
  ]), /不要与 JSONL/);
});
