import type { Dream } from './dreams';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

export type ConversionError = { noteIndex: number; title: string | null; message: string };
export type ConversionReport = {
  sourceFile: string;
  sourceNoteCount: number;
  convertedCount: number;
  errors: ConversionError[];
};
export type ImportFile = { name: string; content: string };
export type ImportPreview = { filename: string; dreams: Dream[]; report: ConversionReport | null; format: 'jsonl' | 'text' };
export type ImportCandidate = { index: number; dream: Dream; duplicate: 'existing' | 'file' | null };

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

export function parseDreamArchive(text: string, allowEmpty = false): Dream[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length && !allowEmpty) throw new Error('导入文件为空');
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

export function parseImportFiles(files: ImportFile[]): ImportPreview {
  if (files.length && files.every((file) => /\.(txt|md|markdown)$/i.test(file.name))) {
    return {
      filename: files.length === 1 ? files[0].name : `${files.length} 个文字文件`,
      dreams: files.map(parseTextNote),
      report: null,
      format: 'text',
    };
  }
  if (files.some((file) => /\.(txt|md|markdown)$/i.test(file.name))) {
    throw new Error('文字文件请单独选择，可同时选择多个 TXT 或 Markdown 文件；不要与 JSONL 或 manifest 混选');
  }
  if (files.length < 1 || files.length > 2) throw new Error('请选择一个 JSONL 文件，可同时选择 manifest.json');
  const manifestFile = files.find((file) => file.name.toLowerCase() === 'manifest.json');
  const archiveFiles = files.filter((file) => file !== manifestFile);
  if (archiveFiles.length !== 1) throw new Error('请选择一个 JSONL 文件，可同时选择 manifest.json');
  const archive = archiveFiles[0];
  if (/\.enex$/i.test(archive.name)) throw new Error('请先用 ENEX 转换器生成 dreams.jsonl，再导入应用');
  const dreams = parseDreamArchive(archive.content, !!manifestFile);
  if (!manifestFile) return { filename: archive.name, dreams, report: null, format: 'jsonl' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestFile.content);
  } catch {
    throw new Error('manifest.json 不是有效的 JSON');
  }
  if (!isRecord(parsed) || parsed.format !== 'bakunotes-import-v1' ||
      typeof parsed.source_file !== 'string' ||
      !Number.isSafeInteger(parsed.source_note_count) || (parsed.source_note_count as number) < 0 ||
      !Number.isSafeInteger(parsed.converted_count) || (parsed.converted_count as number) < 0 ||
      !Number.isSafeInteger(parsed.error_count) || (parsed.error_count as number) < 0 ||
      typeof parsed.archive_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(parsed.archive_sha256) ||
      !Array.isArray(parsed.errors) ||
      !parsed.errors.every((item: unknown) => isRecord(item) &&
        Number.isSafeInteger(item.note_index) && (item.note_index as number) > 0 &&
        (item.title === null || typeof item.title === 'string') &&
        typeof item.error === 'string')) {
    throw new Error('manifest.json 的格式不正确');
  }
  if (parsed.converted_count !== dreams.length ||
      parsed.error_count !== parsed.errors.length ||
      parsed.source_note_count !== dreams.length + parsed.errors.length) {
    throw new Error('manifest.json 的篇数与 JSONL 不一致');
  }
  if (bytesToHex(sha256(utf8ToBytes(archive.content))) !== parsed.archive_sha256) {
    throw new Error('manifest.json 与 JSONL 的校验值不一致，请选择同一次转换的文件');
  }
  return {
    filename: archive.name,
    dreams,
    format: 'jsonl',
    report: {
      sourceFile: parsed.source_file,
      sourceNoteCount: parsed.source_note_count as number,
      convertedCount: parsed.converted_count as number,
      errors: parsed.errors.map((item: Record<string, unknown>) => ({
        noteIndex: item.note_index as number,
        title: item.title as string | null,
        message: item.error as string,
      })),
    },
  };
}

function parseTextNote(file: ImportFile): Dream {
  const body = file.content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (!body.trim()) throw new Error(`${file.name}：文件没有正文`);
  if (body.includes('\0')) throw new Error(`${file.name}：请使用 UTF-8 文字文件，无法读取含空字符的内容`);
  if (body.includes('\uFFFD')) throw new Error(`${file.name}：内容含无法确认的替换字符，请检查编码并另存为 UTF-8 后重试`);
  const system = /\.txt$/i.test(file.name) ? 'text-file' : 'markdown-file';
  const hash = (text: string) => bytesToHex(sha256(utf8ToBytes(text)));
  return {
    id: `text-${hash(JSON.stringify([system, file.name, body]))}`,
    title: file.name.replace(/\.(txt|md|markdown)$/i, ''),
    body,
    dreamDate: '',
    createdAt: '',
    updatedAt: '',
    recordedAt: null,
    tags: [],
    source: system,
    sourceDetails: { system, filename: file.name, content_sha256: hash(body) },
    attachments: [],
  };
}

export function buildImportCandidates(records: Dream[], existingIds: Iterable<string>): ImportCandidate[] {
  const existing = new Set(existingIds);
  const seen = new Set<string>();
  return records.map((dream, index) => {
    const duplicate = existing.has(dream.id) ? 'existing' : seen.has(dream.id) ? 'file' : null;
    seen.add(dream.id);
    return { index, dream, duplicate };
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
