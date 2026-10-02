import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Dream } from './dreams';
import { validateNoteFields } from './journal';

export function EntryDetails({ dream, onSave, onClose }: { dream: Dream; onSave: (note: Dream) => void; onClose: () => void }) {
  const [date, setDate] = useState(dream.dreamDate);
  const [time, setTime] = useState(dream.recordedAt === null ? '' : dream.recordedAt ?? dream.createdAt);
  const [tags, setTags] = useState(dream.tags.join('，'));
  const [error, setError] = useState('');
  const save = () => {
    try {
      const fields = validateNoteFields({ dreamDate: date.trim(), recordedAt: time.trim() || null,
        tags: [...new Set(tags.split(/[,，\n]/).map(tag => tag.trim()).filter(Boolean))] });
      onSave({ ...dream, ...fields }); onClose();
    } catch { setError('梦的日期请使用有效的 YYYY-MM-DD；记录时间可填写 2026年10月2日 08:30；留空表示未知。'); }
  };
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <View style={s.backdrop}><ScrollView contentContainerStyle={s.panel} keyboardShouldPersistTaps="handled">
      <Text style={s.heading}>日期、时间与标签</Text>
      <Text>梦的日期（留空表示未知）</Text>
      <TextInput accessibilityLabel="编辑梦的日期" placeholder="YYYY-MM-DD" value={date} onChangeText={setDate} style={s.input} />
      <Text>记录时间（留空表示未知）</Text>
      <TextInput accessibilityLabel="编辑记录时间" placeholder="2026-10-02 08:30" value={time} onChangeText={setTime} style={s.input} />
      <Text>标签，用逗号分隔</Text>
      <TextInput accessibilityLabel="编辑标签" value={tags} onChangeText={setTags} style={s.input} />
      <Text style={s.hint}>来源文件中的时间保持不变。这里修改的是你采用的记录时间。</Text>
      {!!error && <Text accessibilityLiveRegion="polite" style={s.error}>{error}</Text>}
      <View style={s.actions}><Pressable accessibilityRole="button" onPress={onClose}><Text>取消</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={save}><Text style={s.confirm}>保存日期与标签</Text></Pressable></View>
    </ScrollView></View>
  </Modal>;
}
const s = StyleSheet.create({ backdrop: { flex: 1, backgroundColor: '#20364088', justifyContent: 'center', padding: 24 },
  panel: { backgroundColor: '#F9FBFA', borderRadius: 16, padding: 24, gap: 12, width: '100%', maxWidth: 560, alignSelf: 'center' },
  heading: { fontSize: 21, color: '#203640', fontWeight: '700' }, input: { padding: 12, borderWidth: 1, borderColor: '#CDDADB', borderRadius: 8, color: '#203640' },
  hint: { color: '#60757C', lineHeight: 20 }, error: { color: '#A13C35' }, actions: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 }, confirm: { color: '#2E6D73', fontWeight: '700' } });
