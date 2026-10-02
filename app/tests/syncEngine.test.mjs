import test from 'node:test';
import assert from 'node:assert/strict';
import { runSync, mergeWhileEditing } from '../src/syncEngine.ts';

const note = { id: 'a', title: '合成同步笔记', body: '原文', dreamDate: '', tags: [], createdAt: '', updatedAt: '' };
function host() {
  const rows = new Map(); let loseInsert = false, loseUpdate = false, race = false;
  const io = { list: async () => [...rows.values()], id: async id => id,
    encode: async dream => ({ id: dream.id, payload: JSON.stringify(dream) }), decode: async record => JSON.parse(record.payload),
    insert: async record => { if (rows.has(record.id)) throw new Error('duplicate'); rows.set(record.id, { ...record, version: 1 }); if (loseInsert) { loseInsert = false; throw new Error('lost response'); } },
    update: async (record, version) => { if (race || rows.get(record.id)?.version !== version) return false; rows.set(record.id, { ...record, version: version + 1 }); if (loseUpdate) { loseUpdate = false; throw new Error('lost response'); } return true; },
  };
  return { rows, io, loseInsert: () => { loseInsert = true; }, loseUpdate: () => { loseUpdate = true; }, race: () => { race = true; } };
}
test('two-device offline edits, trash and restore merge without losing either side', async () => {
  const server = host();
  const a = await runSync([note], {}, server.io);
  const b = await runSync([], {}, server.io);
  const aEdit = { ...note, body: '设备 A 修改', updatedAt: '2026-10-02T09:00:00Z' };
  await runSync([aEdit], a.baseline, server.io);
  const bEdit = { ...note, body: '设备 B 离线修改', updatedAt: '2026-10-02T09:01:00Z' };
  const conflict = await runSync([bEdit], b.baseline, server.io);
  assert.equal(conflict.conflicts, 1); assert.equal(conflict.dreams.length, 2);
  assert.deepEqual(new Set(conflict.dreams.map(dream => dream.body)), new Set([aEdit.body, bEdit.body]));
  const deleted = conflict.dreams.map(dream => dream.id === 'a' ? { ...dream, trashedAt: '2026-10-02T10:00:00Z' } : dream);
  const trashSync = await runSync(deleted, conflict.baseline, server.io);
  const other = await runSync([], {}, server.io);
  assert.equal(other.dreams.find(dream => dream.id === 'a').trashedAt, '2026-10-02T10:00:00Z');
  await runSync(trashSync.dreams.map(dream => ({ ...dream, trashedAt: null })), trashSync.baseline, server.io);
  assert.equal((await runSync([], {}, server.io)).dreams.find(dream => dream.id === 'a').trashedAt, null);
});
test('lost insert/update responses and conflict retries do not multiply records', async () => {
  const server = host(); server.loseInsert();
  await assert.rejects(runSync([note], {}, server.io), /lost response/);
  const base = await runSync([note], {}, server.io); assert.equal(server.rows.size, 1);
  const edited = { ...note, body: '编辑' }; server.loseUpdate();
  await assert.rejects(runSync([edited], base.baseline, server.io), /lost response/);
  const recovered = await runSync([edited], base.baseline, server.io);
  assert.equal(recovered.dreams.length, 1); assert.equal(server.rows.get('a').version, 2);
  const local = { ...note, body: '离线冲突' }; server.loseInsert();
  await assert.rejects(runSync([local], base.baseline, server.io), /lost response/);
  const retry = await runSync([local], base.baseline, server.io);
  assert.equal(retry.dreams.length, 2); assert.equal(server.rows.size, 2);
  assert.equal((await runSync(retry.dreams, retry.baseline, server.io)).dreams.length, 2);
});
test('network, decode and revision failures do not yield a successful baseline; in-flight UI edits survive', async () => {
  const server = host(); const base = await runSync([note], {}, server.io);
  await assert.rejects(runSync([note], base.baseline, { ...server.io, list: async () => { throw new Error('offline'); } }), /offline/);
  await assert.rejects(runSync([note], base.baseline, { ...server.io, decode: async () => { throw new Error('authentication failed'); } }), /authentication/);
  server.race(); await assert.rejects(runSync([{ ...note, body: 'change' }], base.baseline, server.io), /同时发生/);
  const current = [{ ...note, body: '同步期间编辑', trashedAt: '2026-10-02T10:00:00Z' }, { ...note, id: 'new', body: '同步期间新建' }];
  const merged = mergeWhileEditing(current, [note], [{ ...note, body: '远端合成修改' }]);
  assert.equal(merged[0].body, current[0].body); assert.equal(merged[0].trashedAt, current[0].trashedAt); assert.equal(merged.length, 2);
});
