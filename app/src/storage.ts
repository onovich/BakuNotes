import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Dream } from './dreams';
import { createFileStorage } from './fileStorage';
import type { RecoverySnapshot } from './journal';

export const connectedLibrary = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('local-vault') === '1';
const remote = connectedLibrary ? createFileStorage(window.location.origin,
  new URLSearchParams(window.location.hash.slice(1)).get('token') || '') : null;
export const storageLabel = () => remote?.label || '此设备的本地笔记库';

const KEY = 'dream-journal-v1';
const recoveryKey = () => `dream-recovery-v1:${remote?.identity || 'device'}`;
export async function saveRecovery(value: RecoverySnapshot) { await AsyncStorage.setItem(recoveryKey(), JSON.stringify(value)); }
export async function loadRecovery(): Promise<RecoverySnapshot | null> {
  const raw = await AsyncStorage.getItem(recoveryKey());
  if (!raw) return null;
  const value = JSON.parse(raw) as RecoverySnapshot;
  if (!value || typeof value.id !== 'string' || !Array.isArray(value.snapshot) || !Array.isArray(value.baseline)) throw new Error('恢复副本格式不正确');
  return value;
}

export async function loadDreams(): Promise<Dream[]> {
  if (remote) return remote.load();
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('本地梦境数据格式不正确');
  return parsed as Dream[];
}

export async function saveDreams(dreams: Dream[]): Promise<void> {
  if (remote) return remote.save(dreams);
  await AsyncStorage.setItem(KEY, JSON.stringify(dreams));
}
