import type { Dream } from './dreams';

type ArchiveRecord = {
  id?: unknown;
  title?: unknown;
  body?: unknown;
  dream_date?: unknown;
  recorded_at?: unknown;
  source_created_at?: unknown;
  source_updated_at?: unknown;
  tags?: unknown;
  source?: { system?: unknown; path?: unknown };
};

export function parseDreamArchive(text: string): Dream[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) throw new Error('导入文件为空');
  return lines.map((line, index) => {
    let item: ArchiveRecord;
    try {
      item = JSON.parse(line) as ArchiveRecord;
    } catch {
      throw new Error(`第 ${index + 1} 行不是有效的 JSON`);
    }
    if (typeof item.id !== 'string' || typeof item.title !== 'string' || typeof item.body !== 'string') {
      throw new Error(`第 ${index + 1} 行缺少 id、title 或 body`);
    }
    const createdAt = typeof item.recorded_at === 'string' ? item.recorded_at
      : typeof item.source_created_at === 'string' ? item.source_created_at : '';
    return {
      id: item.id,
      title: item.title,
      body: item.body,
      dreamDate: typeof item.dream_date === 'string' ? item.dream_date : '',
      createdAt,
      updatedAt: typeof item.source_updated_at === 'string' ? item.source_updated_at : createdAt,
      tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : [],
      source: item.source?.system === 'dream-journal' ? 'new' : 'youdao',
      sourcePath: typeof item.source?.path === 'string' ? item.source.path : undefined,
    };
  });
}

export function serializeDreamArchive(dreams: Dream[]): string {
  return dreams.map((dream) => JSON.stringify({
    id: dream.id,
    title: dream.title,
    body: dream.body,
    dream_date: dream.dreamDate || null,
    recorded_at: dream.createdAt,
    source_updated_at: dream.updatedAt,
    tags: dream.tags,
    source: {
      system: dream.source === 'youdao' ? (dream.sourcePath ? 'youdao-folder-export' : 'youdao-enex') : 'dream-journal',
      ...(dream.sourcePath ? { path: dream.sourcePath } : {}),
    },
  })).join('\n') + (dreams.length ? '\n' : '');
}
