import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AESEncryptionKey } from 'expo-crypto';
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { cloud, createCloudVault, readVault } from './cloud';
import { createVault, openVault, type VaultEnvelope } from './crypto';
import { loadBaseline, saveBaseline, syncSnapshot, type Baseline } from './sync';
import type { Dream } from './dreams';

const OWNER_KEY = 'dream-cloud-owner-v1';

export function useCloudSync(dreams: Dream[], setDreams: Dispatch<SetStateAction<Dream[]>>, loaded: boolean, enabled = true,
  persistMerged?: (incoming: Dream[], snapshot: Dream[]) => Promise<void>) {
  const [userId, setUserId] = useState<string | null>(null);
  const [vault, setVault] = useState<VaultEnvelope | null | undefined>(undefined);
  const [key, setKey] = useState<AESEncryptionKey | null>(null);
  const [status, setStatus] = useState(cloud ? '未登录' : '云同步尚未配置');
  const [busy, setBusy] = useState(false);
  const dreamsRef = useRef(dreams);
  const userIdRef = useRef<string | null>(null);
  const baselineRef = useRef<Baseline | null>(null);
  const runningRef = useRef(false);
  const keyRef = useRef(key);
  useEffect(() => { keyRef.current = key; }, [key]);

  useEffect(() => { dreamsRef.current = dreams; }, [dreams]);

  useEffect(() => {
    if (!cloud || !enabled) return;
    const client = cloud;
    const applyUser = (next: string | null) => {
      if (userIdRef.current === next) return;
      userIdRef.current = next;
      keyRef.current = null;
      setKey(null); setVault(undefined); baselineRef.current = null;
      setUserId(next);
      if (!next) setStatus('未登录');
    };
    client.auth.getUser().then(({ data, error }) => {
      if (error && error.name !== 'AuthSessionMissingError') setStatus(`登录检查失败：${error.message}`);
      applyUser(data.user?.id || null);
    });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      applyUser(session?.user.id || null);
    });
    return () => data.subscription.unsubscribe();
  }, [enabled]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    readVault(userId).then((value) => {
      if (!active) return;
      setVault(value);
      setStatus(value ? '已登录 · 请解锁加密档案' : '已登录 · 请创建加密档案');
    }).catch((error) => { if (active) setStatus(`读取加密档案失败：${error instanceof Error ? error.message : String(error)}`); });
    return () => { active = false; };
  }, [userId]);

  const signIn = async (email: string, password: string) => {
    if (!cloud) throw new Error('云同步尚未配置');
    setBusy(true);
    try {
      const { error } = await cloud.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      setStatus('登录成功');
    } finally { setBusy(false); }
  };
  const signUp = async (email: string, password: string) => {
    if (!cloud) throw new Error('云同步尚未配置');
    setBusy(true);
    try {
      const { data, error } = await cloud.auth.signUp({ email: email.trim(), password });
      if (error) throw error;
      setStatus(data.session ? '账号已创建' : '请到邮箱完成验证，然后登录');
    } finally { setBusy(false); }
  };
  const signOut = async () => {
    if (!cloud) return;
    const { error } = await cloud.auth.signOut();
    if (error) throw error;
    userIdRef.current = null; keyRef.current = null; setKey(null); setVault(undefined); setUserId(null); baselineRef.current = null;
  };
  const createEncryptedVault = async (passphrase: string) => {
    if (!userId) throw new Error('请先登录');
    setBusy(true);
    try {
      const created = await createVault(passphrase);
      await createCloudVault(userId, created.envelope);
      setVault(created.envelope); setKey(created.key);
      setStatus('加密档案已创建，正在准备同步');
    } finally { setBusy(false); }
  };
  const unlock = async (passphrase: string) => {
    if (!vault) throw new Error('加密档案未加载');
    setBusy(true);
    try {
      const opened = await openVault(passphrase, vault);
      setKey(opened); setStatus('加密档案已解锁，正在准备同步');
    } finally { setBusy(false); }
  };
  const lock = () => { keyRef.current = null; setKey(null); baselineRef.current = null; setStatus('已锁定'); };

  const syncNow = useCallback(async () => {
    if (!loaded || !userId || !key || runningRef.current) return;
    runningRef.current = true;
    setStatus('正在加密同步…');
    try {
      const owner = await AsyncStorage.getItem(OWNER_KEY);
      if (owner && owner !== userId && dreamsRef.current.length) {
        throw new Error('此设备的本地梦境已绑定其他账号，请先导出备份并核对账号');
      }
      const baseline = baselineRef.current ?? await loadBaseline(userId);
      const snapshot = dreamsRef.current;
      const result = await syncSnapshot(userId, snapshot, baseline, key);
      if (userIdRef.current !== userId || keyRef.current !== key) return;
      if (!persistMerged) throw new Error('本地保存接口尚未配置');
      await persistMerged(result.dreams, snapshot);
      if (userIdRef.current !== userId || keyRef.current !== key) return;
      await saveBaseline(userId, result.baseline);
      baselineRef.current = result.baseline;
      if (!owner) await AsyncStorage.setItem(OWNER_KEY, userId);
      setStatus(result.conflicts ? `已同步，保留 ${result.conflicts} 篇冲突副本` : '已加密同步');
    } catch (error) {
      setStatus(`同步失败：${error instanceof Error ? error.message : String(error)}`);
    } finally { runningRef.current = false; }
  }, [userId, key, loaded, persistMerged]);

  useEffect(() => {
    if (!key) return;
    const timer = setTimeout(() => { void syncNow(); }, 3000);
    return () => clearTimeout(timer);
  }, [dreams, key, syncNow]);
  useEffect(() => {
    if (!key) return;
    const timer = setInterval(() => { void syncNow(); }, 30_000);
    return () => clearInterval(timer);
  }, [key, syncNow]);

  return { configured: !!cloud, userId, vault, unlocked: !!key, status, busy,
    signIn, signUp, signOut, createEncryptedVault, unlock, lock, syncNow };
}
