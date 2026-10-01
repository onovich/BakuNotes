import { randomUUID } from 'expo-crypto';

export type Dream = {
  id: string;
  title: string;
  body: string;
  dreamDate: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  source?: string;
  sourcePath?: string;
  sourceDetails?: Record<string, unknown>;
  sourceCreatedAt?: string;
  sourceUpdatedAt?: string;
  recordedAt?: string | null;
  importedAt?: string;
  attachments?: Record<string, unknown>[];
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

export const searchDreams = (dreams: Dream[], query: string): Dream[] => {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return dreams
    .filter((dream) => {
      const haystack = `${dream.title}\n${dream.body}\n${dream.tags.join(' ')}`.toLocaleLowerCase();
      return words.every((word) => haystack.includes(word));
    })
    .sort((a, b) => (b.dreamDate || b.createdAt).localeCompare(a.dreamDate || a.createdAt));
};
