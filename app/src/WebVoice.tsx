import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { captureVoice } from './voiceCapture';

export function WebVoice({ onRecorded }: { onRecorded: (blob: Blob) => Promise<void> }) {
  const [recording, setRecording] = useState(false), [status, setStatus] = useState('');
  const [rawUrl, setRawUrl] = useState('');
  const active = useRef<ReturnType<typeof captureVoice> | null>(null);
  const pending = useRef(false), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (timer.current) clearTimeout(timer.current); void active.current?.stop().catch(() => {}); }; }, []);
  useEffect(() => () => { if (rawUrl) URL.revokeObjectURL(rawUrl); }, [rawUrl]);
  const start = async () => {
    if (pending.current || active.current) return;
    pending.current = true;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('当前浏览器不支持录音，请使用系统录音并保留原音');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { stream.getTracks().forEach(track => track.stop()); return; }
      const capture = captureVoice(stream); active.current = capture; setRecording(true); setStatus('正在录音，最长 2 分钟');
      timer.current = setTimeout(() => { void capture.stop(); }, 120000);
      try {
        const blob = await capture.done;
        if (mounted.current) { setRawUrl(URL.createObjectURL(blob)); setStatus('原音已生成，正在保存…'); }
        await onRecorded(blob);
        if (mounted.current) setStatus(capture.warning || '原音已交给笔记保存，请确认上方保存状态');
      } finally { if (timer.current) clearTimeout(timer.current); active.current = null; }
    } catch (error) { if (mounted.current) setStatus(error instanceof Error ? error.message : '录音失败，请检查麦克风权限'); }
    finally { pending.current = false; if (mounted.current) setRecording(false); }
  };
  return <View style={{ gap: 8, marginVertical: 12 }}>
    <Pressable accessibilityRole="button" onPress={() => { if (recording) void active.current?.stop(); else void start(); }}>
      <Text style={{ color: '#2E6D73', fontWeight: '700' }}>{recording ? '停止并保存原音' : '录一段梦（保存原音）'}</Text>
    </Pressable>
    {!!status && <Text accessibilityLiveRegion="polite" style={{ color: '#60757C' }}>{status}</Text>}
    {!!rawUrl && <a href={rawUrl} download="梦境原音">下载本次原音</a>}
  </View>;
}
export function VoiceClips({ attachments }: { attachments: Record<string, unknown>[] }) {
  return <View style={{ gap: 8 }}>{attachments.filter(file => file.encoding === 'base64' && typeof file.data === 'string' && typeof file.mime === 'string' && file.mime.startsWith('audio/'))
    .map(file => <audio key={String(file.path)} controls preload="none" aria-label="梦境原音" src={`data:${file.mime};base64,${file.data}`} style={{ maxWidth: '100%' }} />)}</View>;
}
