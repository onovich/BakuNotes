import type { Dream } from './dreams';
import type { ImportPreview } from './import';
import { applyTimeChoice, emptyTimeChoice, parseImportTime, type TimeChoice } from './importTime.ts';

export type NoteFields = Pick<Dream, 'title' | 'body' | 'dreamDate' | 'tags' | 'recordedAt'>;
export function validateNoteFields(input: unknown): Partial<NoteFields> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected note fields object');
  const value = input as Record<string, unknown>;
  const allowed = ['title', 'body', 'dreamDate', 'tags', 'recordedAt'];
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Unknown or immutable note field');
  const fields: Partial<NoteFields> = {};
  for (const key of ['title', 'body', 'dreamDate'] as const) {
    if (Object.hasOwn(value, key)) {
      if (typeof value[key] !== 'string' || /[\u0000\uFFFD]/u.test(value[key])) throw new Error(`Invalid ${key}`);
      fields[key] = value[key];
    }
  }
  if (fields.dreamDate && (!/^\d{4}-\d{2}-\d{2}$/.test(fields.dreamDate) || parseImportTime(fields.dreamDate) !== fields.dreamDate)) throw new Error('dreamDate must be a valid YYYY-MM-DD or empty');
  if (Object.hasOwn(value, 'tags')) {
    if (!Array.isArray(value.tags) || !value.tags.every(tag => typeof tag === 'string' && tag.trim() && !/[\u0000\uFFFD]/u.test(tag))) throw new Error('Invalid tags');
    fields.tags = [...value.tags] as string[];
  }
  if (Object.hasOwn(value, 'recordedAt')) {
    if (value.recordedAt === null) fields.recordedAt = null;
    else if (typeof value.recordedAt === 'string' && parseImportTime(value.recordedAt)) fields.recordedAt = parseImportTime(value.recordedAt);
    else throw new Error('recordedAt must be an explicit time or null');
  }
  return fields;
}
export function createNote(fields: Partial<NoteFields>, id: string, now: string): Dream {
  const note: Dream = { id, title: '', body: '', dreamDate: '', tags: [], source: 'new',
    createdAt: now, updatedAt: now, recordedAt: now, ...fields };
  if (!note.title.trim() && !note.body.trim()) throw new Error('A note needs a title or body');
  return note;
}
export function updateNote(note: Dream, fields: Partial<NoteFields>, now: string): Dream {
  if (!Object.keys(fields).length) throw new Error('Specify at least one editable field');
  const next = { ...note, ...fields, updatedAt: now };
  if (!next.title.trim() && !next.body.trim()) throw new Error('A note needs a title or body');
  return next;
}

export type JournalSort = 'date' | 'oldest' | 'recorded' | 'updated';
export const searchDreams = (dreams: Dream[], query: string, options: {
  trash?: boolean; tag?: string; sort?: JournalSort;
} = {}): Dream[] => {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return dreams.filter(dream => {
    if (!!dream.trashedAt !== !!options.trash || (options.tag && !dream.tags.includes(options.tag))) return false;
    const haystack = `${dream.title}\n${dream.body}\n${dream.tags.join(' ')}`.toLocaleLowerCase();
    return words.every(word => haystack.includes(word));
  }).sort((a, b) => {
    const field = (note: Dream) => options.sort === 'recorded' ? note.recordedAt || '' : options.sort === 'updated' ? note.updatedAt : note.dreamDate;
    const left = field(a), right = field(b);
    if (!left || !right) return !left && right ? 1 : left && !right ? -1 : a.id.localeCompare(b.id);
    return (options.sort === 'oldest' ? left.localeCompare(right) : right.localeCompare(left)) || a.id.localeCompare(b.id);
  });
};

export function setNoteTrashed(note: Dream, trash: boolean, now: string): Dream {
  return { ...note, trashedAt: trash ? now : null, updatedAt: now };
}

export type RecoverySnapshot = { id: string; snapshot: Dream[]; baseline: Dream[]; savedAt: string };
export function recoverNoteCopies(current: Dream[], recovery: RecoverySnapshot, now: string): Dream[] {
  const baseline = new Map(recovery.baseline.map(note => [note.id, JSON.stringify(note)]));
  const existing = new Map(current.map(note => [note.id, JSON.stringify(note)]));
  const copies = recovery.snapshot.filter(note => baseline.get(note.id) !== JSON.stringify(note) && existing.get(note.id) !== JSON.stringify(note))
    .map(note => ({ ...note, id: `recovery-${recovery.id}-${note.id}`, title: `${note.title || '未命名的梦'}（恢复副本）`, updatedAt: now }));
  const ids = new Set(current.map(note => note.id));
  return [...copies.filter(note => !ids.has(note.id)), ...current];
}

// UI and command-line imports share selection, validation and duplicate rules.
export function prepareImport(existing: Dream[], preview: ImportPreview, indices: number[],
  choices: Record<number, TimeChoice>, importedAt: string): Dream[] {
  const seen = new Set(existing.map(dream => dream.id));
  const additions: Dream[] = [];
  for (const index of indices) {
    if (!Number.isInteger(index) || !preview.dreams[index]) throw new Error('Invalid selected record index');
    const dream = preview.dreams[index];
    if (seen.has(dream.id)) continue;
    seen.add(dream.id);
    additions.push(preview.format === 'text'
      ? applyTimeChoice(dream, preview.timeCandidates?.[index] || [], choices[index] || emptyTimeChoice(), importedAt)
      : dream);
  }
  return additions;
}
