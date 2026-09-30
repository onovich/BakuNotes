// Public, generated notes for bulk archive tests; no personal source content.
export function makeSyntheticDreams(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `synthetic-${String(index + 1).padStart(5, '0')}`,
    title: `虚构批量样本 ${String(index + 1).padStart(5, '0')}`,
    body: Array.from({ length: 20 }, (_, line) =>
      `第 ${line + 1} 行：梦见海边有一盏灯，醒来后记录普通文字。样本 ${index + 1}。`).join('\n'),
    dreamDate: `2026-09-${String(index % 30 + 1).padStart(2, '0')}`,
    createdAt: '2026-09-30T12:00:00Z',
    updatedAt: '2026-09-30T12:00:00Z',
    recordedAt: null,
    tags: ['虚构测试'],
    source: 'enex',
    sourceDetails: { system: 'enex', export_file: 'synthetic.enex', note_index: index + 1 },
    sourceCreatedAt: '2026-09-30T12:00:00Z',
    sourceUpdatedAt: '2026-09-30T12:00:00Z',
    attachments: [{ path: `attachments/synthetic-${index + 1}.txt`, filename: 'synthetic.txt' }],
  }));
}
