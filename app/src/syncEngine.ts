import type { Dream } from './dreams';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

export type Baseline = Record<string, { version: number; digest: string }>;
export type SyncRecord = { id: string; payload: string; version: number };
type Encoded = Pick<SyncRecord, 'id' | 'payload'>;
export const noteDigest = (dream: Dream) => bytesToHex(sha256(utf8ToBytes(JSON.stringify(dream))));
export function mergeWhileEditing(current: Dream[], snapshot: Dream[], incoming: Dream[]): Dream[] {
  const before = new Map(snapshot.map(note => [note.id, JSON.stringify(note)]));
  const currentById = new Map(current.map(note => [note.id, note]));
  const merged = incoming.map(note => {
    const local = currentById.get(note.id);
    return local && before.has(note.id) && before.get(note.id) !== JSON.stringify(local) ? local : note;
  });
  const ids = new Set(merged.map(note => note.id));
  for (const local of current) if (!ids.has(local.id) && !before.has(local.id)) merged.push(local);
  return merged;
}
export async function runSync(local: Dream[], previous: Baseline, io: {
  list: () => Promise<SyncRecord[]>; id: (id: string) => Promise<string>;
  encode: (dream: Dream) => Promise<Encoded>; decode: (record: SyncRecord) => Promise<Dream>;
  insert: (record: Encoded) => Promise<void>; update: (record: Encoded, version: number) => Promise<boolean>;
}): Promise<{ dreams: Dream[]; baseline: Baseline; conflicts: number }> {
  const remote = await io.list(), remoteById = new Map(remote.map(record => [record.id, record]));
  const localById = new Map<string, Dream>();
  for (const dream of local) localById.set(await io.id(dream.id), dream);
  const merged = new Map<string, Dream>(), baseline: Baseline = {};
  let conflicts = 0;
  for (const id of new Set([...remoteById.keys(), ...localById.keys()])) {
    const localDream = localById.get(id), record = remoteById.get(id);
    if (!record && localDream) {
      await io.insert(await io.encode(localDream)); merged.set(localDream.id, localDream);
      baseline[id] = { version: 1, digest: noteDigest(localDream) }; continue;
    }
    if (!record) continue;
    const remoteDream = await io.decode(record), remoteDigest = noteDigest(remoteDream);
    if (!localDream) { merged.set(remoteDream.id, remoteDream); baseline[id] = { version: record.version, digest: remoteDigest }; continue; }
    const localDigest = noteDigest(localDream), base = previous[id];
    if (localDigest === remoteDigest) {
      merged.set(localDream.id, localDream); baseline[id] = { version: record.version, digest: localDigest };
    } else if (base && localDigest === base.digest) {
      merged.set(remoteDream.id, remoteDream); baseline[id] = { version: record.version, digest: remoteDigest };
    } else if (base && record.version === base.version && remoteDigest === base.digest) {
      if (!await io.update(await io.encode(localDream), record.version)) throw new Error('云端同时发生了修改，请重试同步');
      merged.set(localDream.id, localDream); baseline[id] = { version: record.version + 1, digest: localDigest };
    } else {
      // Stable ID and timestamps make a retry reuse an already uploaded conflict copy.
      const seed = bytesToHex(sha256(utf8ToBytes(JSON.stringify([localDream.id, localDigest, record.version, remoteDigest]))));
      const copy: Dream = { ...localDream, id: `conflict-${seed}`, title: `${localDream.title || '未命名的梦'}（冲突副本）` };
      const encoded = await io.encode(copy), saved = remoteById.get(encoded.id);
      if (!saved) await io.insert(encoded);
      const preserved = saved ? await io.decode(saved) : copy;
      merged.set(remoteDream.id, remoteDream); merged.set(preserved.id, preserved);
      baseline[id] = { version: record.version, digest: remoteDigest };
      baseline[encoded.id] = { version: saved?.version || 1, digest: noteDigest(preserved) }; conflicts++;
    }
  }
  return { dreams: [...merged.values()], baseline, conflicts };
}
