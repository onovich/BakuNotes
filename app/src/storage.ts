import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Dream } from './dreams';
import { createFileStorage } from './fileStorage';

export const connectedLibrary = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('local-vault') === '1';
const remote = connectedLibrary ? createFileStorage(window.location.origin,
  new URLSearchParams(window.location.hash.slice(1)).get('token') || '') : null;
export const storageLabel = () => remote?.label || '此设备的本地笔记库';

const KEY = 'dream-journal-v1';

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
