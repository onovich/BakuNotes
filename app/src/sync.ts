import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AESEncryptionKey } from 'expo-crypto';
import { runSync, type Baseline } from './syncEngine';
import { cloudIdForDream, decryptDream, encryptDream } from './crypto';
import { insertCloudRecord, listCloudRecords, updateCloudRecord } from './cloud';
import type { Dream } from './dreams';
export type { Baseline } from './syncEngine';

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

export async function syncSnapshot(userId: string, local: Dream[], previous: Baseline, key: AESEncryptionKey) {
  return runSync(local, previous, {
    list: () => listCloudRecords(userId), id: id => cloudIdForDream(id, key),
    encode: dream => encryptDream(dream, key), decode: record => decryptDream(record, key),
    insert: record => insertCloudRecord(userId, record), update: (record, version) => updateCloudRecord(userId, record, version),
  });
}
