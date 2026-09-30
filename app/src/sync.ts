import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID, type AESEncryptionKey } from 'expo-crypto';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { cloudIdForDream, decryptDream, encryptDream } from './crypto';
import { insertCloudRecord, listCloudRecords, updateCloudRecord } from './cloud';
import type { Dream } from './dreams';

export type Baseline = Record<string, { version: number; digest: string }>;

function digest(dream: Dream): string {
  return bytesToHex(sha256(utf8ToBytes(JSON.stringify(dream))));
}

export async function loadBaseline(userId: string): Promise<Baseline> {
  const raw = await AsyncStorage.getItem(`dream-sync-baseline:${userId}`);
  if (!raw) return {};
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('同步基线格式不正确');
  return parsed as Baseline;
}

export async function saveBaseline(userId: string, baseline: Baseline): Promise<void> {
  await AsyncStorage.setItem(`dream-sync-baseline:${userId}`, JSON.stringify(baseline));
}

export async function syncSnapshot(userId: string, local: Dream[], previous: Baseline, key: AESEncryptionKey):
  Promise<{ dreams: Dream[]; baseline: Baseline; conflicts: number }> {
  const remote = await listCloudRecords(userId);
  const remoteById = new Map(remote.map((record) => [record.id, record]));
  const localById = new Map<string, Dream>();
  for (const dream of local) localById.set(await cloudIdForDream(dream.id, key), dream);
  const ids = new Set([...remoteById.keys(), ...localById.keys()]);
  const merged: Dream[] = [];
  const nextBaseline: Baseline = {};
  let conflicts = 0;

  for (const id of ids) {
    const localDream = localById.get(id);
    const remoteRecord = remoteById.get(id);
    if (!remoteRecord && localDream) {
      await insertCloudRecord(userId, await encryptDream(localDream, key));
      merged.push(localDream);
      nextBaseline[id] = { version: 1, digest: digest(localDream) };
      continue;
    }
    if (!remoteRecord) continue;
    const remoteDream = await decryptDream(remoteRecord, key);
    const remoteDigest = digest(remoteDream);
    if (!localDream) {
      merged.push(remoteDream);
      nextBaseline[id] = { version: remoteRecord.version, digest: remoteDigest };
      continue;
    }
    const localDigest = digest(localDream);
    const base = previous[id];
    if (localDigest === remoteDigest) {
      merged.push(localDream);
      nextBaseline[id] = { version: remoteRecord.version, digest: localDigest };
    } else if (base && localDigest === base.digest) {
      merged.push(remoteDream);
      nextBaseline[id] = { version: remoteRecord.version, digest: remoteDigest };
    } else if (base && remoteRecord.version === base.version && remoteDigest === base.digest) {
      const updated = await updateCloudRecord(userId, await encryptDream(localDream, key), remoteRecord.version);
      if (!updated) throw new Error('云端同时发生了修改，请重试同步');
      merged.push(localDream);
      nextBaseline[id] = { version: remoteRecord.version + 1, digest: localDigest };
    } else {
      // Keep both sides. The original ID follows the remote record; the local edit gets a new ID.
      const now = new Date().toISOString();
      const copy: Dream = { ...localDream, id: randomUUID(), title: `${localDream.title || '未命名的梦'}（冲突副本）`, createdAt: now, updatedAt: now };
      const encryptedCopy = await encryptDream(copy, key);
      await insertCloudRecord(userId, encryptedCopy);
      merged.push(remoteDream, copy);
      nextBaseline[id] = { version: remoteRecord.version, digest: remoteDigest };
      nextBaseline[encryptedCopy.id] = { version: 1, digest: digest(copy) };
      conflicts++;
    }
  }
  return { dreams: merged, baseline: nextBaseline, conflicts };
}
