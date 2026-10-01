import type { Dream } from './dreams';

export type TimeSource = 'created' | 'modified' | 'first' | 'last' | 'imported' | 'manual' | 'none';
export type TimeTarget = 'dreamDate' | 'recordedAt' | 'both';
export type TimeCandidate = { key: string; source: TimeSource; label: string; value: string };
export type TimeChoice = { key: string; manual: string; target: TimeTarget };
export const emptyTimeChoice = (): TimeChoice => ({ key: 'none', manual: '', target: 'dreamDate' });

// Parse explicit calendar values without inferring missing dates or time zones.
export function parseImportTime(input: string): string | null {
  const text = input.trim().replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xFF10))
    .replace(/：/g, ':').replace(/／/g, '/').replace(/．/g, '.')
    .replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')
    .replace(/日(?=\d)/g, '日 ')
    .replace(/时|点/g, ':').replace(/分(?=\d)/g, ':').replace(/分|秒/g, '');
  const match = text.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:[T\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\.(\d{1,3}))?\s*(Z|[+-]\d{2}:?\d{2})?)?$/i);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, fraction, rawZone] = match;
  const zone = rawZone?.toUpperCase();
  const y = Number(year), m = Number(month), d = Number(day);
  if (y < 1000 || m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return null;
  const date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  if (hour === undefined) return date;
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second || 0) > 59) return null;
  if (zone && zone !== 'Z' && (Number(zone.slice(1, 3)) > 14 || Number(zone.slice(-2)) > 59 ||
      (Number(zone.slice(1, 3)) === 14 && Number(zone.slice(-2)) !== 0))) return null;
  const normalizedZone = zone && zone !== 'Z' ? `${zone.slice(0, 3)}:${zone.slice(-2)}` : zone || '';
  return `${date}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${(second || '00').padStart(2, '0')}${fraction ? `.${fraction.padEnd(3, '0')}` : ''}${normalizedZone}`;
}

export function parseImportTimeOptions(input: string): { value: string; interpretation?: string }[] {
  const direct = parseImportTime(input);
  if (direct) return [{ value: direct }];
  const match = input.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(.*)$/);
  if (!match) return [];
  const options = [
    { value: parseImportTime(`${match[3]}-${match[2]}-${match[1]}${match[4]}`), interpretation: '日/月/年' },
    { value: parseImportTime(`${match[3]}-${match[1]}-${match[2]}${match[4]}`), interpretation: '月/日/年' },
  ];
  return options.filter((item, index) => item.value && options.findIndex((other) => other.value === item.value) === index) as { value: string; interpretation: string }[];
}

export function detectBoundaryTimes(body: string): TimeCandidate[] {
  const lines = body.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const boundaries: { source: TimeSource; label: string; line: string }[] = [
    { source: 'first', label: '正文首行', line: lines[0] },
  ];
  if (lines.length > 1) boundaries.push({ source: 'last', label: '正文末行', line: lines[lines.length - 1] });
  return boundaries.flatMap(({ source, label, line }) => {
    const normalized = line.replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xFF10))
      .replace(/：/g, ':').replace(/／/g, '/').replace(/．/g, '.');
    const tokens = normalized.matchAll(/(?:\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?|\d{1,2}[-/.]\d{1,2}[-/.]\d{4}|\d{8})(?:(?:T|\s)*\d{1,2}[:时点]\d{1,2}(?:分)?(?:[:]\d{1,2}|\d{1,2}秒)?(?:\.\d{1,3})?\s*(?:Z|[+-]\d{2}:?\d{2})?)?/gi);
    const values: TimeCandidate[] = [];
    for (const match of tokens) {
      const before = normalized[match.index! - 1] || '';
      const after = normalized[match.index! + match[0].length] || '';
      if (/\d/.test(before) || /[\d:T+\-/]/.test(after)) continue;
      for (const option of parseImportTimeOptions(match[0])) {
        if (values.some((item) => item.value === option.value)) continue;
        values.push({ key: `${source}:${values.length}`, source,
          label: `${label}${option.interpretation ? ` · ${option.interpretation}` : ''}`, value: option.value });
      }
    }
    return values;
  });
}

export function buildTimeCandidates(body: string, metadata: { createdAt?: string; modifiedAt?: string }, importedAt: string): TimeCandidate[] {
  const candidates = detectBoundaryTimes(body);
  for (const [source, label, raw] of [
    ['created', '文件创建时间', metadata.createdAt], ['modified', '文件最后编辑时间', metadata.modifiedAt],
    ['imported', '本次导入时间', importedAt],
  ] as const) {
    const value = raw ? parseImportTime(raw) : null;
    if (value) candidates.push({ key: source, source, label, value });
  }
  return candidates;
}

export function batchTimeChoice(candidates: TimeCandidate[], source: string, manual: string, target: TimeTarget): TimeChoice {
  if (source === 'none' || source === 'manual') return { key: source, manual, target };
  const matching = candidates.filter((item) => item.source === source);
  return { key: matching.length === 1 ? matching[0].key : 'unresolved', manual, target };
}

export function resolveTimeChoice(candidates: TimeCandidate[], choice: TimeChoice): { value: string | null; error?: string } {
  if (choice.key === 'none') return { value: null };
  const options = choice.key === 'manual' ? parseImportTimeOptions(choice.manual) : [];
  const value = choice.key === 'manual' ? (options.length === 1 ? options[0].value : null)
    : candidates.find((item) => item.key === choice.key)?.value;
  return value ? { value } : { value: null, error: choice.key === 'manual'
    ? '请输入有效且无歧义的日期或时间，如 2026-10-01 08:30'
    : '此篇没有唯一匹配的时间，请单独选择或保留未知' };
}

export function applyTimeChoice(dream: Dream, candidates: TimeCandidate[], choice: TimeChoice, importedAt: string): Dream {
  const resolved = resolveTimeChoice(candidates, choice);
  if (resolved.error) throw new Error(`${dream.title}：${resolved.error}`);
  const value = resolved.value;
  const chosen = candidates.find((item) => item.key === choice.key);
  return {
    ...dream, importedAt,
    ...(value && choice.target !== 'recordedAt' ? { dreamDate: value.slice(0, 10) } : {}),
    ...(value && choice.target !== 'dreamDate' ? { recordedAt: value } : {}),
    sourceDetails: { ...dream.sourceDetails, time_selection: {
      source: chosen?.source || choice.key, value, target: choice.target,
    } },
  };
}
