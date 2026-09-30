import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { useCloudSync } from './useCloudSync';

type SyncControl = ReturnType<typeof useCloudSync>;

export function CloudPanel({ sync }: { sync: SyncControl }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  const run = async (action: () => Promise<unknown>) => {
    setError('');
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败'); }
  };
  const button = (label: string, action: () => void, subtle = false) =>
    <Pressable accessibilityRole="button" onPress={action} disabled={sync.busy}
      style={[s.button, subtle && s.subtle]}><Text style={[s.buttonText, subtle && s.subtleText]}>{label}</Text></Pressable>;

  return <View style={s.panel}>
    <Text style={s.title}>加密同步</Text>
    <Text style={s.info}>标题、日期、标签和正文会在本机加密后上传；搜索也只在本机解密后进行。</Text>
    <Text style={s.status} accessibilityLiveRegion="polite">{sync.status}</Text>
    {!sync.configured ? <Text style={s.info}>需要先配置你自己的 Supabase 项目。当前记录仍保存在此设备。</Text>
      : !sync.userId ? <>
        <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder="邮箱"
          autoCapitalize="none" keyboardType="email-address" accessibilityLabel="同步账号邮箱" />
        <TextInput style={s.input} value={password} onChangeText={setPassword} placeholder="账号密码"
          secureTextEntry accessibilityLabel="同步账号密码" />
        {button('登录', () => void run(async () => { await sync.signIn(email, password); setPassword(''); }))}
        {button('注册账号', () => void run(async () => { await sync.signUp(email, password); setPassword(''); }), true)}
      </> : sync.vault === undefined ? <ActivityIndicator />
      : !sync.unlocked ? <>
        <Text style={s.info}>{sync.vault ? '输入你的加密口令以解锁。' : '首次使用请创建至少 16 字符的加密口令；丢失后云端无法帮你恢复正文。'}</Text>
        <TextInput style={s.input} value={passphrase} onChangeText={setPassphrase}
          placeholder="加密口令" secureTextEntry accessibilityLabel="加密口令" />
        {!sync.vault && <TextInput style={s.input} value={confirm} onChangeText={setConfirm}
          placeholder="再次输入加密口令" secureTextEntry accessibilityLabel="确认加密口令" />}
        {button(sync.vault ? '解锁并同步' : '创建加密档案', () => void run(async () => {
          if (!sync.vault && passphrase !== confirm) throw new Error('两次输入的口令不一致');
          if (sync.vault) await sync.unlock(passphrase);
          else await sync.createEncryptedVault(passphrase);
          setPassphrase(''); setConfirm('');
        }))}
        {button('退出账号', () => void run(sync.signOut), true)}
      </> : <>
        {button('立即同步', () => void sync.syncNow())}
        {button('锁定加密档案', sync.lock, true)}
        {button('退出账号', () => void run(sync.signOut), true)}
      </>}
    {!!error && <Text style={s.error} accessibilityLiveRegion="polite">{error}</Text>}
  </View>;
}

const s = StyleSheet.create({
  panel: { width: '100%', maxWidth: 440, alignSelf: 'center', gap: 12, padding: 24, backgroundColor: '#F9FBFA', borderRadius: 12 },
  title: { fontSize: 22, fontWeight: '700', color: '#203640' },
  info: { fontSize: 13, lineHeight: 20, color: '#60757C' },
  status: { fontSize: 13, color: '#2E6D73', fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#CDDADB', borderRadius: 8, paddingHorizontal: 13, paddingVertical: 11, fontSize: 15, color: '#203640', backgroundColor: '#FFF' },
  button: { paddingVertical: 12, paddingHorizontal: 15, backgroundColor: '#2E6D73', borderRadius: 9, alignItems: 'center' },
  buttonText: { color: '#FFF', fontWeight: '700' },
  subtle: { backgroundColor: '#E6F0EF' },
  subtleText: { color: '#2E6D73' },
  error: { color: '#A6473F', fontSize: 13, lineHeight: 19 },
});
