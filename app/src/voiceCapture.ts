export function captureVoice(stream: MediaStream, Recorder: typeof MediaRecorder = MediaRecorder) {
  let recorder: MediaRecorder;
  const close = () => stream.getTracks().forEach(track => track.stop());
  try { recorder = new Recorder(stream, { audioBitsPerSecond: 32000 }); }
  catch (error) { close(); throw error; }
  const chunks: Blob[] = [];
  let warning = '';
  let fail: (reason: Error) => void = () => {};
  const done = new Promise<Blob>((resolve, reject) => {
    fail = reject;
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    // MediaRecorder emits final data and stop after an error; preserve that partial audio.
    recorder.onerror = () => { warning = '录音中断，仅保存已收到的原音，请试听检查'; };
    recorder.onstop = () => {
      close();
      const blob = new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type || 'audio/webm' });
      if (!blob.size) reject(new Error(warning || '没有录到声音')); else resolve(blob);
    };
  });
  void done.catch(() => {});
  try { recorder.start(500); } catch (error) { close(); fail(error instanceof Error ? error : new Error('录音启动失败')); }
  return { done, get warning() { return warning; }, stop: () => { if (recorder.state !== 'inactive') recorder.stop(); return done; } };
}
export async function voiceAttachment(blob: Blob, id: string): Promise<Record<string, unknown>> {
  if (!blob.type.startsWith('audio/') || !blob.size || blob.size > 4 * 1024 * 1024) throw new Error('录音超过 4 MiB 或格式不受支持，请下载原音保存');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return { path: `inline-audio/${id}`, mime: blob.type, encoding: 'base64', data: btoa(binary), size: bytes.length };
}
