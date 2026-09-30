import assert from 'node:assert/strict';
import test from 'node:test';
import { buildImportCandidates, parseImportFiles, serializeDreamArchive } from '../src/import.ts';
import { SaveQueue } from '../src/saveQueue.ts';
import { makeSyntheticDreams } from './fixtures/syntheticDreams.mjs';

test('1,500 records survive save, reload and JSONL restore without metadata loss', async () => {
  const records = makeSyntheticDreams(1500);
  let stored = '';
  const queue = new SaveQueue(async (snapshot) => { stored = JSON.stringify(snapshot); }, () => {});
  queue.acknowledgeLoaded([]);
  queue.schedule(records);
  await queue.flush();
  const reloaded = JSON.parse(stored);
  assert.deepEqual(reloaded, records);
  const backup = serializeDreamArchive(reloaded);
  const restored = parseImportFiles([{ name: 'synthetic-backup.jsonl', content: backup }]).dreams;
  assert.equal(restored.length, 1500);
  assert.equal(serializeDreamArchive(restored), backup);
  assert.ok(buildImportCandidates(restored, records.map((record) => record.id))
    .every((candidate) => candidate.duplicate === 'existing'));
});
