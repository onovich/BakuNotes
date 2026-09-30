import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Dream } from './dreams';

const KEY = 'dream-journal-v1';

export async function loadDreams(): Promise<Dream[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('本地梦境数据格式不正确');
  return parsed as Dream[];
}

export async function saveDreams(dreams: Dream[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(dreams));
}
