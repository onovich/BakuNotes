import type { Dream } from './dreams';

type ArchiveRecord = {
  id?: unknown;
  title?: unknown;
  body?: unknown;
  dream_date?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  recorded_at?: unknown;
  source_created_at?: unknown;
  source_updated_at?: unknown;
  tags?: unknown;
  source?: unknown;
  attachments?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

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
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.title !== 'string' || typeof item.body !== 'string') {
      throw new Error(`第 ${index + 1} 行缺少 id、title 或 body`);
    }
    if (item.source !== undefined && (!isRecord(item.source) || typeof item.source.system !== 'string')) {
      throw new Error(`第 ${index + 1} 行的来源信息格式不正确`);
    }
    if (item.tags !== undefined && (!Array.isArray(item.tags) || !item.tags.every((tag) => typeof tag === 'string'))) {
      throw new Error(`第 ${index + 1} 行的标签格式不正确`);
    }
    const source = item.source as Record<string, unknown> | undefined;
    const attachments = item.attachments === undefined ? [] : item.attachments;
    if (!Array.isArray(attachments) || !attachments.every((entry) => isRecord(entry) && typeof entry.path === 'string')) {
      throw new Error(`第 ${index + 1} 行的附件信息格式不正确`);
    }
    const createdAt = typeof item.created_at === 'string' ? item.created_at
      : typeof item.recorded_at === 'string' ? item.recorded_at
      : typeof item.source_created_at === 'string' ? item.source_created_at : '';
    return {
      id: item.id,
      title: item.title,
      body: item.body,
      dreamDate: typeof item.dream_date === 'string' ? item.dream_date : '',
      createdAt,
      updatedAt: typeof item.updated_at === 'string' ? item.updated_at
        : typeof item.source_updated_at === 'string' ? item.source_updated_at : createdAt,
      tags: Array.isArray(item.tags) ? item.tags as string[] : [],
      source: source?.system === 'dream-journal' || !source ? 'new' : source.system as string,
      sourcePath: typeof source?.path === 'string' ? source.path : undefined,
      sourceDetails: source,
      sourceCreatedAt: typeof item.source_created_at === 'string' ? item.source_created_at : undefined,
      sourceUpdatedAt: typeof item.source_updated_at === 'string' ? item.source_updated_at : undefined,
      recordedAt: typeof item.recorded_at === 'string' ? item.recorded_at : item.recorded_at === null ? null : undefined,
      attachments: attachments as Record<string, unknown>[],
    };
  });
}

export function serializeDreamArchive(dreams: Dream[]): string {
  return dreams.map((dream) => JSON.stringify({
    id: dream.id,
    title: dream.title,
    body: dream.body,
    dream_date: dream.dreamDate || null,
    created_at: dream.createdAt || null,
    updated_at: dream.updatedAt || null,
    recorded_at: dream.recordedAt === null ? null : dream.recordedAt || dream.createdAt || null,
    source_created_at: dream.sourceCreatedAt || null,
    source_updated_at: dream.sourceUpdatedAt || dream.updatedAt || null,
    tags: dream.tags,
    source: dream.sourceDetails || {
      // Preserve the source label used by already-saved entries from earlier versions.
      system: dream.source === 'youdao' ? (dream.sourcePath ? 'youdao-folder-export' : 'youdao-enex')
        : dream.source && dream.source !== 'new' ? dream.source : 'dream-journal',
      ...(dream.sourcePath ? { path: dream.sourcePath } : {}),
    },
    attachments: dream.attachments || [],
  })).join('\n') + (dreams.length ? '\n' : '');
}
