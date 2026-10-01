import type { Dream } from './dreams';
import type { ImportPreview } from './import';
import { applyTimeChoice, emptyTimeChoice, type TimeChoice } from './importTime.ts';

export const searchDreams = (dreams: Dream[], query: string): Dream[] => {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return dreams.filter(dream => {
    const haystack = `${dream.title}\n${dream.body}\n${dream.tags.join(' ')}`.toLocaleLowerCase();
    return words.every(word => haystack.includes(word));
  }).sort((a, b) => (b.dreamDate || b.createdAt).localeCompare(a.dreamDate || a.createdAt));
};

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
