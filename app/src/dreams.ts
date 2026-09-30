import { randomUUID } from 'expo-crypto';

export type Dream = {
  id: string;
  title: string;
  body: string;
  dreamDate: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  source?: 'new' | 'youdao';
  sourcePath?: string;
};

export const todayLocal = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

export const makeDream = (): Dream => {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    title: '',
    body: '',
    dreamDate: todayLocal(),
    createdAt: now,
    updatedAt: now,
    tags: [],
    source: 'new',
  };
};

export const displayTitle = (dream: Dream) =>
  dream.title.trim() || dream.body.trim().split(/\r?\n/)[0]?.slice(0, 28) || '未命名的梦';

export const displaySourceFolder = (sourcePath: string) => {
  const parts = sourcePath.split(/[\\/]/).filter(Boolean);
  return parts.length > 1 ? parts.slice(-3, -1).join('/') : '导出根目录';
};

export const titleDateHint = (title: string): string => {
  const match = title.match(/^((?:19|20)\d{2})(?:年|[.\-/])?(0?[1-9]|1[0-2])(?:月|[.\-/])?([0-2]?\d|3[01])日?(?!\d)/);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

export const searchDreams = (dreams: Dream[], query: string): Dream[] => {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return dreams
    .filter((dream) => {
      const haystack = `${dream.title}\n${dream.body}\n${dream.tags.join(' ')}\n${dream.sourcePath || ''}`.toLocaleLowerCase();
      return words.every((word) => haystack.includes(word));
    })
    .sort((a, b) => (b.dreamDate || b.createdAt || titleDateHint(b.title))
      .localeCompare(a.dreamDate || a.createdAt || titleDateHint(a.title)));
};
