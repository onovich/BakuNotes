import assert from 'node:assert/strict';
import test from 'node:test';
import { applyTimeChoice, batchTimeChoice, buildTimeCandidates, detectBoundaryTimes, emptyTimeChoice,
  parseImportTime, parseImportTimeOptions, resolveTimeChoice } from '../src/importTime.ts';
import { parseImportFiles, parseDreamArchive, serializeDreamArchive } from '../src/import.ts';

test('detects only explicit first and last nonempty line times', () => {
  assert.deepEqual(detectBoundaryTimes('\n记录：2026-09-30 23:15\n梦见车站。\n2026年10月1日\n'), [
    { key: 'first:0', source: 'first', label: '正文首行', value: '2026-09-30T23:15:00' },
    { key: 'last:0', source: 'last', label: '正文末行', value: '2026-10-01' },
  ]);
  assert.deepEqual(detectBoundaryTimes('梦见海浪\n2026-09-30\n醒来'), []);
  assert.deepEqual(detectBoundaryTimes('昨天晚上'), []);
  assert.equal(detectBoundaryTimes('2026-10-01').length, 1);
});

test('validates calendar dates and retains explicit zones and missing time precision', () => {
  assert.equal(parseImportTime('2024/2/29'), '2024-02-29');
  assert.equal(parseImportTime('2026-10-01T01:02:03+0800'), '2026-10-01T01:02:03+08:00');
  assert.equal(parseImportTime('2026-10-01T01:02Z'), '2026-10-01T01:02:00Z');
  for (const invalid of ['2026-02-29', '2026-13-01', '2026-10-01 24:00', '2026-10-01T12:00+14:30', '10/01/26']) {
    assert.equal(parseImportTime(invalid), null);
  }
  assert.deepEqual(detectBoundaryTimes('2026-02-30\n梦境\n2026-01-01 至 2026-01-03').map(c => c.value),
    ['2026-01-01', '2026-01-03']);
});

test('recognizes handwritten variants and presents ambiguous interpretations', () => {
  for (const [input, expected] of [
    ['２０２６年９月３０日２３时１５分', '2026-09-30T23:15:00'],
    ['2026.9.30 8:05:09', '2026-09-30T08:05:09'],
    ['20260930', '2026-09-30'],
    ['2026年9月30日8点5分9秒', '2026-09-30T08:05:09'],
  ]) {
    assert.equal(parseImportTime(input), expected, input);
    assert.equal(detectBoundaryTimes(`记录于 ${input}`)[0]?.value, expected, input);
  }
  assert.deepEqual(parseImportTimeOptions('01/10/2026').map(c => c.value), ['2026-10-01', '2026-01-10']);
  assert.equal(detectBoundaryTimes('01/10/2026').length, 2);
  assert.deepEqual(parseImportTimeOptions('30/9/2026').map(c => c.value), ['2026-09-30']);
  for (const input of ['9月30日', '昨晚', '1202609309', '2026-09-30T25:00', '2026-09-30T12:00:999']) {
    assert.deepEqual(detectBoundaryTimes(input), [], input);
  }
});

test('omits absent metadata and batch rules never silently substitute a timestamp', () => {
  const candidates = buildTimeCandidates('没有日期的正文', { modifiedAt: '2026-09-30T01:00Z' }, '2026-10-01T01:00Z');
  assert.deepEqual(candidates.map(c => c.source), ['modified', 'imported']);
  assert.equal(batchTimeChoice(candidates, 'modified', '', 'both').key, 'modified');
  assert.ok(resolveTimeChoice(candidates, batchTimeChoice(candidates, 'first', '', 'both')).error);
  const ambiguous = detectBoundaryTimes('01/10/2026');
  assert.ok(resolveTimeChoice(ambiguous, batchTimeChoice(ambiguous, 'first', '', 'dreamDate')).error);
  assert.ok(resolveTimeChoice([], { key: 'manual', manual: '01/10/2026', target: 'both' }).error);
  assert.equal(resolveTimeChoice([], { key: 'manual', manual: '2026年10月1日', target: 'both' }).value, '2026-10-01');
});

test('applies only the chosen field and persists import provenance across backup restoration', () => {
  const now = '2026-10-01T09:00:00Z';
  const preview = parseImportFiles([{ name: '时间.txt', content: '2026-09-30 23:15\n梦见车站' }], now);
  const dream = preview.dreams[0], candidates = preview.timeCandidates[0];
  const choice = { key: 'first:0', manual: '', target: 'recordedAt' };
  const recorded = applyTimeChoice(dream, candidates, choice, now);
  assert.equal(recorded.dreamDate, '');
  assert.equal(recorded.recordedAt, '2026-09-30T23:15:00');
  const dated = applyTimeChoice(dream, candidates, { ...choice, target: 'dreamDate' }, now);
  assert.equal(dated.dreamDate, '2026-09-30');
  assert.equal(dated.recordedAt, null);
  const both = applyTimeChoice(dream, candidates, { ...choice, target: 'both' }, now);
  assert.equal(both.dreamDate, '2026-09-30');
  assert.equal(both.id, dream.id);
  assert.equal(both.body, dream.body);
  const restored = parseDreamArchive(serializeDreamArchive([recorded]))[0];
  assert.equal(restored.importedAt, now);
  assert.equal(restored.createdAt, '');
  assert.equal(restored.updatedAt, '');
  assert.deepEqual(restored.sourceDetails.time_selection, { source: 'first', value: recorded.recordedAt, target: 'recordedAt' });
  assert.equal(applyTimeChoice(dream, candidates, emptyTimeChoice(), now).dreamDate, '');
  assert.throws(() => applyTimeChoice(dream, candidates, { ...choice, key: 'unresolved' }, now));
});
