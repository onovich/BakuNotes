import test from 'node:test';
import assert from 'node:assert/strict';
import { captureVoice, voiceAttachment } from '../src/voiceCapture.ts';
import { serializeDreamArchive, parseDreamArchive } from '../src/import.ts';

test('voice capture keeps the last stop chunk, closes tracks and survives JSONL backup', async () => {
  let closed = 0, instance;
  const stream = { getTracks: () => [{ stop: () => { closed++; } }] };
  class Recorder {
    state = 'inactive'; mimeType = 'audio/webm';
    constructor() { instance = this; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable({ data: new Blob(['last'], { type: this.mimeType }) }); this.onstop(); }
  }
  const capture = captureVoice(stream, Recorder);
  instance.ondataavailable({ data: new Blob(['first'], { type: 'audio/webm' }) });
  const blob = await capture.stop(); assert.equal(await blob.text(), 'firstlast'); assert.equal(closed, 1);
  const attachment = await voiceAttachment(blob, 'synthetic');
  const note = { id: 'test', title: '合成音频', body: '', dreamDate: '', createdAt: '', updatedAt: '', tags: [], attachments: [attachment] };
  const restored = parseDreamArchive(serializeDreamArchive([note]));
  assert.equal(atob(restored[0].attachments[0].data), 'firstlast');
  assert.equal(await capture.stop(), blob); assert.equal(closed, 1);
});
test('voice capture start failure and invalid audio do not report saved recordings', async () => {
  let closed = 0;
  const stream = { getTracks: () => [{ stop: () => { closed++; } }] };
  class Recorder { state = 'inactive'; start() { throw new Error('device error'); } }
  await assert.rejects(captureVoice(stream, Recorder).done, /device error/); assert.equal(closed, 1);
  await assert.rejects(voiceAttachment(new Blob(['text'], { type: 'text/plain' }), 'x'), /格式/);
  await assert.rejects(voiceAttachment(new Blob([], { type: 'audio/webm' }), 'x'));
});

test('recorder interruption preserves partial and final audio with a visible warning', async () => {
  let instance;
  class Recorder {
    state = 'inactive'; mimeType = 'audio/webm';
    constructor() { instance = this; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable({ data: new Blob(['end']) }); this.onstop(); }
  }
  const capture = captureVoice({ getTracks: () => [{ stop() {} }] }, Recorder);
  instance.ondataavailable({ data: new Blob(['partial']) }); instance.onerror();
  assert.equal(await (await capture.stop()).text(), 'partialend');
  assert.match(capture.warning, /录音中断/);
});
