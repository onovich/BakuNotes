import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { buildImportCandidates, type ConversionError, type ImportCandidate, type ImportPreview } from './import';
import { batchTimeChoice, emptyTimeChoice, resolveTimeChoice, type TimeCandidate, type TimeChoice } from './importTime';

function TimeFields({ candidates, choice, onChange, busy }: {
  candidates: TimeCandidate[]; choice: TimeChoice; onChange: (choice: TimeChoice) => void; busy: boolean;
}) {
  const options = [
    { key: 'none', label: '保留未知', value: '' }, ...candidates,
    { key: 'manual', label: '手动填写', value: '' },
  ];
  return <View style={styles.timeFields}>
    <Text style={styles.timeLabel}>采用哪个时间</Text>
    <View style={styles.timeOptions}>{options.map((option) => <Pressable key={option.key}
      onPress={() => onChange({ ...choice, key: option.key })} disabled={busy} accessibilityRole="radio"
      accessibilityState={{ checked: choice.key === option.key, disabled: busy }}
      style={[styles.timeOption, choice.key === option.key && styles.timeOptionSelected]}>
      <Text style={styles.timeOptionText}>{choice.key === option.key ? '◉ ' : '○ '}{option.label}</Text>
      {!!option.value && <Text style={styles.timeValue}>{option.value.replace('T', ' ')}</Text>}
    </Pressable>)}</View>
    {choice.key === 'manual' && <TextInput value={choice.manual} editable={!busy}
      onChangeText={(manual) => onChange({ ...choice, manual })} style={styles.manualInput}
      accessibilityLabel="手动填写导入时间" placeholder="如 2026-10-01 或 2026-10-01 08:30" />}
    <Text style={styles.timeLabel}>写入哪个字段</Text>
    <View style={styles.timeOptions}>{([
      ['dreamDate', '梦的日期'], ['recordedAt', '原笔记记录时间'], ['both', '两者都写入'],
    ] as const).map(([target, label]) => <Pressable key={target} disabled={busy} accessibilityRole="radio"
      accessibilityState={{ checked: choice.target === target, disabled: busy }}
      onPress={() => onChange({ ...choice, target })}
      style={[styles.timeOption, choice.target === target && styles.timeOptionSelected]}>
      <Text style={styles.timeOptionText}>{choice.target === target ? '◉ ' : '○ '}{label}</Text>
    </Pressable>)}</View>
  </View>;
}

type PreviewRow =
  | { kind: 'error'; error: ConversionError; index: number }
  | { kind: 'record'; candidate: ImportCandidate };

export function ImportPreviewDialog({ preview, existingIds, busy, error, onClose, onConfirm }: {
  preview: ImportPreview;
  existingIds: string[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onConfirm: (indices: number[], timeChoices: Record<number, TimeChoice>) => void;
}) {
  const candidates = useMemo(
    () => buildImportCandidates(preview.dreams, existingIds),
    [preview, existingIds],
  );
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(preview.report || preview.format === 'text' ? [] : candidates.filter((item) => !item.duplicate).map((item) => item.index)),
  );
  const [timeChoices, setTimeChoices] = useState<Record<number, TimeChoice>>({});
  const [batchChoice, setBatchChoice] = useState<TimeChoice>(emptyTimeChoice);
  const [expandedTime, setExpandedTime] = useState<number | null>(null);
  const textImport = preview.format === 'text';
  const timeCandidates = preview.timeCandidates || [];
  const batchCandidates: TimeCandidate[] = (['created', 'modified', 'first', 'last', 'imported'] as const)
    .flatMap((source) => {
      const available = candidates.filter((item) => !item.duplicate &&
        timeCandidates[item.index]?.some((time) => time.source === source));
      if (!available.length) return [];
      const label = { created: '文件创建时间', modified: '文件最后编辑时间', first: '正文首行',
        last: '正文末行', imported: '本次导入时间' }[source];
      return [{ key: source, source, label, value: `${available.length} 篇有候选` }];
    });
  const timeErrors = textImport ? candidates.filter((item) => !item.duplicate && selected.has(item.index) &&
    resolveTimeChoice(timeCandidates[item.index] || [], timeChoices[item.index] || emptyTimeChoice()).error).length : 0;
  const applyBatch = () => setTimeChoices((current) => {
    const next = { ...current };
    for (const item of candidates) if (!item.duplicate && selected.has(item.index)) {
      next[item.index] = batchTimeChoice(timeCandidates[item.index] || [], batchChoice.key,
        batchChoice.manual, batchChoice.target);
    }
    return next;
  });
  const duplicateCount = candidates.filter((item) => item.duplicate).length;
  const selectedCount = candidates.filter((item) => !item.duplicate && selected.has(item.index)).length;
  const attachmentCount = preview.dreams.reduce((count, dream) => count + (dream.attachments?.length || 0), 0);
  const rows: PreviewRow[] = [
    ...(preview.report?.errors.map((error, index) => ({ kind: 'error' as const, error, index })) || []),
    ...candidates.map((candidate) => ({ kind: 'record' as const, candidate })),
  ];

  const toggle = (index: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return <Modal visible transparent animationType="fade" onRequestClose={busy ? undefined : onClose}>
    <View style={styles.backdrop}>
      <View style={styles.panel}>
        <View style={styles.heading}>
          <View style={styles.headingText}>
            <Text style={styles.title}>导入前检查</Text>
            <Text style={styles.filename} numberOfLines={1}>{preview.filename}</Text>
          </View>
          <Pressable onPress={onClose} disabled={busy} accessibilityRole="button"
            accessibilityLabel="关闭导入预览" style={styles.close}>
            <Text style={styles.closeText}>关闭 ✕</Text>
          </Pressable>
        </View>
        <Text style={styles.summary}>
          {preview.dreams.length} 篇记录 · {duplicateCount} 篇重复 · {selectedCount} 篇待导入
        </Text>
        {preview.report
          ? <Text style={styles.report}>
              来源 {preview.report.sourceFile}：共 {preview.report.sourceNoteCount} 篇，
              成功 {preview.report.convertedCount} 篇，转换失败 {preview.report.errors.length} 篇。
              转换记录默认不选，请勾选要收入梦库的笔记。
            </Text>
          : preview.format === 'text' ? <Text style={styles.notice}>
              一份文件对应一篇记录，标题取文件名，正文保留原文字及 Markdown。
              请勾选要收入梦库的笔记，并确认要采用的时间；也可保留未知。
            </Text> : <Text style={styles.notice}>
              未选择 manifest.json，无法显示转换错误。如果这是转换结果，请同时选择 JSONL 和 manifest.json。
            </Text>}
        <Text style={styles.notice}>
          来源笔记的外部附件仅保留元数据；BakuNotes 内嵌原音会随 JSONL 备份保留。
          {attachmentCount ? ` 本次记录含 ${attachmentCount} 个附件。` : ''}
        </Text>
        {!!error && <Text style={styles.errorText}>{error}</Text>}
        <View style={styles.selectActions}>
          <Pressable onPress={() => setSelected(new Set(candidates.filter((item) => !item.duplicate).map((item) => item.index)))}
            disabled={busy} accessibilityRole="button">
            <Text style={styles.actionText}>全选可导入</Text>
          </Pressable>
          <Pressable onPress={() => setSelected(new Set())} disabled={busy} accessibilityRole="button">
            <Text style={styles.actionText}>清空选择</Text>
          </Pressable>
          <Pressable onPress={() => setSelected((current) => new Set(candidates
            .filter((item) => !item.duplicate && !current.has(item.index)).map((item) => item.index)))}
            disabled={busy} accessibilityRole="button">
            <Text style={styles.actionText}>反选可导入</Text>
          </Pressable>
        </View>
        <FlatList
          data={rows}
          keyExtractor={(item) => item.kind === 'error' ? `error-${item.index}` : `record-${item.candidate.index}`}
          extraData={{ selected, timeChoices, expandedTime }}
          style={styles.list}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={textImport ? <View style={styles.batchPanel}>
            <Text style={styles.timeHeading}>批量时间设置</Text>
            <Text style={styles.notice}>选择后应用到勾选的笔记。首末行或文件时间缺失、有多个解释时，需逐篇确认。
              无时区的文内时间按原样保留；文件时间可能因复制或导出而改变。</Text>
            <TimeFields candidates={batchCandidates} choice={batchChoice} onChange={setBatchChoice} busy={busy} />
            <Pressable onPress={applyBatch} disabled={busy || selectedCount === 0} accessibilityRole="button">
              <Text style={styles.actionText}>应用到选中的 {selectedCount} 篇</Text>
            </Pressable>
          </View> : null}
          ListEmptyComponent={<Text style={styles.empty}>没有可预览的记录或转换错误。</Text>}
          renderItem={({ item }) => item.kind === 'error'
            ? <View style={styles.errorRow}>
                <Text style={styles.errorTitle}>转换失败 · 第 {item.error.noteIndex} 篇 · {item.error.title || '无标题'}</Text>
                <Text style={styles.errorText}>{item.error.message}</Text>
              </View>
            : <View style={[styles.recordRow, item.candidate.duplicate && styles.duplicateRow]}>
              <Pressable onPress={() => toggle(item.candidate.index)} disabled={busy || !!item.candidate.duplicate}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: !item.candidate.duplicate && selected.has(item.candidate.index),
                  disabled: !!item.candidate.duplicate || busy }}
                accessibilityLabel={item.candidate.dream.title || '无标题记录'}
                style={styles.recordMain}>
                <Text style={styles.checkbox}>{item.candidate.duplicate ? '—' : selected.has(item.candidate.index) ? '☑' : '□'}</Text>
                <View style={styles.recordText}>
                  <Text style={styles.recordTitle} numberOfLines={1}>{item.candidate.dream.title || '无标题记录'}</Text>
                  <Text style={styles.excerpt} numberOfLines={2}>{item.candidate.dream.body || '没有正文'}</Text>
                  {!!item.candidate.duplicate && <Text style={styles.duplicateLabel}>
                    {item.candidate.duplicate === 'existing' ? '梦库中已有相同 ID' : '文件内重复 ID'}
                  </Text>}
                </View>
              </Pressable>
              {textImport && !item.candidate.duplicate && <View style={styles.rowTime}>
                <Text style={styles.timeValue}>{(() => {
                  const choice = timeChoices[item.candidate.index] || emptyTimeChoice();
                  const result = resolveTimeChoice(timeCandidates[item.candidate.index] || [], choice);
                  const target = { dreamDate: '梦的日期', recordedAt: '原笔记记录时间', both: '两者' }[choice.target];
                  return result.error || (result.value ? `${target}：${result.value.replace('T', ' ')}` : '时间未采用，保留未知');
                })()}</Text>
                <Pressable onPress={() => setExpandedTime((current) => current === item.candidate.index ? null : item.candidate.index)}
                  disabled={busy} accessibilityRole="button" accessibilityLabel={`设置时间：${item.candidate.dream.title}`}>
                  <Text style={styles.actionText}>{expandedTime === item.candidate.index ? '收起时间设置' : '单独设置时间'}</Text>
                </Pressable>
                {expandedTime === item.candidate.index && <TimeFields busy={busy}
                  candidates={timeCandidates[item.candidate.index] || []}
                  choice={timeChoices[item.candidate.index] || emptyTimeChoice()}
                  onChange={(choice) => setTimeChoices((current) => ({ ...current, [item.candidate.index]: choice }))} />}
              </View>}
            </View>}
        />
        {!!timeErrors && <Text style={styles.errorText}>{timeErrors} 篇选中记录的时间需要确认，请单独设置或保留未知。</Text>}
        <View style={styles.footer}>
          <Pressable onPress={onClose} disabled={busy} accessibilityRole="button" style={styles.cancelButton}>
            <Text style={styles.cancelText}>取消</Text>
          </Pressable>
          <Pressable onPress={() => onConfirm(candidates.filter((item) => !item.duplicate && selected.has(item.index))
            .map((item) => item.index), timeChoices)}
            disabled={busy || selectedCount === 0 || timeErrors > 0} accessibilityRole="button"
            accessibilityState={{ disabled: busy || selectedCount === 0 || timeErrors > 0 }}
            style={[styles.importButton, (busy || selectedCount === 0 || timeErrors > 0) && styles.importButtonDisabled]}>
            <Text style={styles.importText}>{busy ? '正在导入…' : `导入选中的 ${selectedCount} 篇`}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(22, 43, 49, 0.55)', justifyContent: 'center', padding: 12 },
  panel: { width: '100%', maxWidth: 720, maxHeight: '94%', alignSelf: 'center', backgroundColor: '#F9FBFA',
    borderRadius: 13, padding: 20 },
  heading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  headingText: { flex: 1 },
  title: { color: '#203640', fontSize: 21, fontWeight: '700' },
  filename: { color: '#60757C', fontSize: 12, marginTop: 5 },
  close: { padding: 5 },
  closeText: { color: '#2E6D73', fontSize: 13 },
  summary: { color: '#203640', fontSize: 14, fontWeight: '600', marginTop: 18 },
  report: { color: '#60757C', fontSize: 12, lineHeight: 18, marginTop: 7 },
  notice: { color: '#8B5B45', fontSize: 12, lineHeight: 18, marginTop: 9 },
  selectActions: { flexDirection: 'row', gap: 22, marginTop: 15, marginBottom: 10 },
  actionText: { color: '#2E6D73', fontSize: 13, fontWeight: '600' },
  list: { flexGrow: 0, flexShrink: 1, borderTopWidth: 1, borderTopColor: '#CDDADB' },
  empty: { color: '#60757C', paddingVertical: 24, textAlign: 'center' },
  recordRow: { paddingVertical: 12, paddingHorizontal: 5, borderBottomWidth: 1, borderBottomColor: '#DEE8E7' },
  recordMain: { flexDirection: 'row', gap: 11 },
  batchPanel: { paddingVertical: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: '#CDDADB' },
  timeHeading: { color: '#203640', fontWeight: '700', fontSize: 14 },
  timeFields: { gap: 8 },
  timeLabel: { color: '#60757C', fontSize: 12 },
  timeOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  timeOption: { padding: 8, borderWidth: 1, borderColor: '#CDDADB', borderRadius: 7 },
  timeOptionSelected: { borderColor: '#2E6D73', backgroundColor: '#D4E8E5' },
  timeOptionText: { color: '#203640', fontSize: 12 },
  timeValue: { color: '#60757C', fontSize: 11, marginTop: 3 },
  manualInput: { borderWidth: 1, borderColor: '#CDDADB', borderRadius: 6, padding: 9, fontSize: 13, color: '#203640' },
  rowTime: { marginLeft: 35, marginTop: 8, gap: 8 },
  duplicateRow: { opacity: 0.63 },
  checkbox: { color: '#2E6D73', fontSize: 21, width: 24 },
  recordText: { flex: 1 },
  recordTitle: { color: '#203640', fontSize: 14, fontWeight: '600' },
  excerpt: { color: '#60757C', fontSize: 12, lineHeight: 18, marginTop: 3 },
  duplicateLabel: { color: '#8B5B45', fontSize: 11, marginTop: 4 },
  errorRow: { paddingVertical: 11, paddingHorizontal: 6, backgroundColor: '#FFF4EE', borderBottomWidth: 1,
    borderBottomColor: '#EDD9CF' },
  errorTitle: { color: '#8B4D33', fontSize: 13, fontWeight: '600' },
  errorText: { color: '#8B5B45', fontSize: 12, marginTop: 4 },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 18, marginTop: 17 },
  cancelButton: { padding: 10 },
  cancelText: { color: '#60757C', fontSize: 14 },
  importButton: { backgroundColor: '#2E6D73', borderRadius: 9, paddingHorizontal: 18, paddingVertical: 11 },
  importButtonDisabled: { opacity: 0.45 },
  importText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
});
