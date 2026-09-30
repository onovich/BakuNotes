import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import type { EncryptedDream, VaultEnvelope } from './crypto';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const cloud = url && publishableKey ? createClient(url, publishableKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
}) : null;

if (cloud && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') cloud?.auth.startAutoRefresh();
    else cloud?.auth.stopAutoRefresh();
  });
}

export type CloudRecord = EncryptedDream & { version: number };

export async function readVault(userId: string): Promise<VaultEnvelope | null> {
  if (!cloud) throw new Error('云同步尚未配置');
  const { data, error } = await cloud.from('dream_vaults').select('envelope').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data?.envelope as VaultEnvelope | null;
}

export async function createCloudVault(userId: string, envelope: VaultEnvelope): Promise<void> {
  if (!cloud) throw new Error('云同步尚未配置');
  const { error } = await cloud.from('dream_vaults').insert({ user_id: userId, envelope });
  if (error) throw error;
}

export async function listCloudRecords(userId: string): Promise<CloudRecord[]> {
  if (!cloud) throw new Error('云同步尚未配置');
  const all: CloudRecord[] = [];
  let after: string | null = null;
  for (;;) {
    let query = cloud.from('dream_records').select('id,payload,version').eq('user_id', userId);
    if (after) query = query.gt('id', after);
    const { data, error } = await query.order('id').limit(500);
    if (error) throw error;
    all.push(...(data as CloudRecord[]));
    if (!data || data.length < 500) break;
    after = data[data.length - 1].id;
  }
  return all;
}

export async function insertCloudRecord(userId: string, record: EncryptedDream): Promise<void> {
  if (!cloud) throw new Error('云同步尚未配置');
  const { error } = await cloud.from('dream_records').insert({ user_id: userId, ...record, version: 1 });
  if (error) throw error;
}

export async function updateCloudRecord(userId: string, record: EncryptedDream, expectedVersion: number): Promise<boolean> {
  if (!cloud) throw new Error('云同步尚未配置');
  const { data, error } = await cloud.from('dream_records')
    .update({ payload: record.payload, version: expectedVersion + 1, updated_at: new Date().toISOString() })
    .eq('user_id', userId).eq('id', record.id).eq('version', expectedVersion)
    .select('version').maybeSingle();
  if (error) throw error;
  return data?.version === expectedVersion + 1;
}
