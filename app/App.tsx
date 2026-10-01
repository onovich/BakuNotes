import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, AppState, FlatList, Modal, Platform, Pressable, ScrollView, StyleSheet,
  Text, TextInput, useWindowDimensions, View,
} from 'react-native';
import { displayTitle, Dream, makeDream, searchDreams, todayLocal } from './src/dreams';
import { loadDreams, saveDreams, connectedLibrary, storageLabel } from './src/storage';
import { parseImportFiles, serializeDreamArchive, type ImportPreview } from './src/import';
import { ImportPreviewDialog } from './src/ImportPreview';
import { CloudPanel } from './src/CloudPanel';
import { useCloudSync } from './src/useCloudSync';
import { SaveQueue, type SaveState } from './src/saveQueue';
import { type TimeChoice } from './src/importTime';
import { prepareImport } from './src/journal';

const c = {
  canvas: '#E8EFF0', paper: '#F9FBFA', ink: '#203640', muted: '#60757C',
  line: '#CDDADB', accent: '#2E6D73', accentSoft: '#D4E8E5', dawn: '#C98769',
};

function Brand() {
  return <View style={s.brand}>
    <View style={s.glyph}><Text style={s.glyphText}>◐</Text></View>
    <View><Text style={s.brandName}>梦貘手记</Text><Text style={s.brandSub}>让梦在醒来后留下来</Text></View>
  </View>;
}

function Library({ dreams, selectedId, query, setQuery, onSelect, onNew, onImport, onExport, onCloud, importStatus, syncStatus, saveFailed, onRetrySave }: {
  dreams: Dream[]; selectedId: string | null; query: string;
  setQuery: (query: string) => void; onSelect: (dream: Dream) => void; onNew: () => void;
  onImport: () => void; onExport: () => void; onCloud: () => void; importStatus: string; syncStatus: string;
  saveFailed: boolean; onRetrySave: () => void;
}) {
  const results = useMemo(() => searchDreams(dreams, query), [dreams, query]);
  return <View style={s.library}>
    <View style={s.libraryHeader}>
      <Brand />
      <Pressable style={s.newButton} onPress={onNew} accessibilityRole="button">
        <Text style={s.newButtonText}>＋ 记一个梦</Text>
      </Pressable>
      <TextInput style={s.search} value={query} onChangeText={setQuery}
        placeholder="搜索梦里的词、人或地点" placeholderTextColor={c.muted}
        accessibilityLabel="搜索梦境" returnKeyType="search" />
      <Text style={s.count}>{query ? `找到 ${results.length} 篇` : `${dreams.length} 篇梦境`}</Text>
      <View style={s.archiveActions}>
        <Pressable onPress={onImport} accessibilityRole="button" style={s.importButton}>
          <Text style={s.importButtonText}>导入记录</Text>
        </Pressable>
        <Pressable onPress={onExport} accessibilityRole="button" style={s.importButton}>
          <Text style={s.importButtonText}>导出备份</Text>
        </Pressable>
        {!connectedLibrary && <Pressable onPress={onCloud} accessibilityRole="button" style={s.importButton}>
          <Text style={s.importButtonText}>加密同步</Text>
        </Pressable>}
      </View>
      <Text style={s.syncStatus}>{syncStatus}</Text>
      {!!importStatus && <Text style={s.importStatus} accessibilityLiveRegion="polite">{importStatus}</Text>}
      {saveFailed && <Pressable onPress={onRetrySave} accessibilityRole="button" style={s.importButton}>
        <Text style={s.retrySave}>重试保存</Text>
      </Pressable>}
    </View>
    <FlatList data={results} keyExtractor={(dream) => dream.id} extraData={selectedId}
      style={s.list} contentContainerStyle={s.listContent} keyboardShouldPersistTaps="handled"
      initialNumToRender={12} windowSize={5}
      ListEmptyComponent={<View style={s.empty}>
        <Text style={s.emptyMark}>✦</Text>
        <Text style={s.emptyTitle}>{query ? '没有找到这个梦' : '还没有记录'}</Text>
        <Text style={s.emptyText}>{query ? '换一个词，或清空搜索再试。' : '醒来时记下片段，也值得保存。'}</Text>
      </View>}
      renderItem={({ item: dream }) => <Pressable onPress={() => onSelect(dream)}
        accessibilityRole="button" accessibilityLabel={`打开梦境：${displayTitle(dream)}`}
        style={[s.item, selectedId === dream.id && s.itemSelected]}>
        <Text style={s.itemDate} numberOfLines={1}>{dream.dreamDate || '日期待定'}</Text>
        <Text style={s.itemTitle} numberOfLines={1}>{displayTitle(dream)}</Text>
        <Text style={s.itemExcerpt} numberOfLines={2}>{dream.body.trim() || '还没有正文'}</Text>
      </Pressable>}
    />
  </View>;
}

function Editor({ dream, onChange, status, onRetry, compact }: {
  dream: Dream; onChange: (dream: Dream) => void; status: string; onRetry: (() => void) | null; compact: boolean;
}) {
  const bodyRef = useRef<TextInput>(null);
  return <ScrollView style={s.editorScroll} contentContainerStyle={[s.editorScrollContent, compact && s.editorScrollContentCompact]}
    keyboardShouldPersistTaps="handled">
    <View style={[s.paper, compact && s.paperCompact]}>
      <View style={[s.topLine, compact && s.topLineCompact]}>
        <View style={s.dateGroup}>
          <Text style={s.fieldLabel}>梦的日期</Text>
          <TextInput style={s.dateInput} value={dream.dreamDate} maxLength={10}
            onChangeText={(dreamDate) => onChange({ ...dream, dreamDate })}
            placeholder="YYYY-MM-DD" placeholderTextColor={c.muted}
            accessibilityLabel="梦的日期，格式为年月日" />
        </View>
        <View style={s.saveGroup}>
          <Text style={s.saveStatus} accessibilityLiveRegion="polite">{status}</Text>
          {onRetry && <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="重试保存">
            <Text style={s.retrySave}>重试保存</Text>
          </Pressable>}
        </View>
      </View>
      {!!dream.recordedAt && <Text style={s.timeMetadata}>原笔记记录时间：{dream.recordedAt.replace('T', ' ')}</Text>}
      {!!dream.importedAt && <Text style={s.timeMetadata}>导入时间：{new Date(dream.importedAt).toLocaleString()}</Text>}
      <TextInput style={[s.titleInput, compact && s.titleInputCompact]} value={dream.title}
        onChangeText={(title) => onChange({ ...dream, title })}
        placeholder="给这个梦起个名字（可稍后）" placeholderTextColor="#91A3A6"
        accessibilityLabel="梦境标题" returnKeyType="next"
        onSubmitEditing={() => bodyRef.current?.focus()} />
      <View style={s.rule} />
      <TextInput ref={bodyRef} style={s.bodyInput} value={dream.body}
        onChangeText={(body) => onChange({ ...dream, body })}
        placeholder={'醒来后还记得什么？\n\n从一个画面、一句话或一种感觉开始。'}
        placeholderTextColor="#91A3A6" accessibilityLabel="梦境正文"
        multiline textAlignVertical="top" autoCapitalize="sentences" />
      <Text style={s.foot}>先写下来，细节可以稍后补充。</Text>
    </View>
  </ScrollView>;
}

export default function App() {
  const width = useWindowDimensions().width;
  const wide = width >= 860;
  const compact = width < 600;
  const [dreams, setDreams] = useState<Dream[]>([]);
  const [draft, setDraft] = useState<Dream>(makeDream);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [mobileView, setMobileView] = useState<'write' | 'library'>('write');
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState('');
  const [importStatus, setImportStatus] = useState('');
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [showCloud, setShowCloud] = useState(false);
  const saveQueue = useRef<SaveQueue<Dream[]> | null>(null);
  if (!saveQueue.current) saveQueue.current = new SaveQueue(async items => {
    try { await saveDreams(items); setSaveError(''); }
    catch (error) { setSaveError(error instanceof Error ? error.message : '保存失败'); throw error; }
  }, setSaveState);
  const queue = saveQueue.current;
  const sync = useCloudSync(dreams, setDreams, loaded && !loadError && !connectedLibrary, !connectedLibrary);

  useEffect(() => {
    loadDreams().then((items) => {
      queue.acknowledgeLoaded(items);
      setDreams(items);
      if (items[0]) { setDraft(items[0]); setSelectedId(items[0].id); setMobileView('library'); }
    }).catch((error) => setLoadError(error instanceof Error ? `读取失败：${error.message}` : '本地数据读取失败，请暂时不要编辑。')).finally(() => setLoaded(true));
  }, [queue]);

  useEffect(() => {
    if (!loaded || loadError) return;
    queue.schedule(dreams);
  }, [dreams, loaded, loadError, queue]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void queue.flush().catch(() => {});
    });
    return () => subscription.remove();
  }, [queue]);

  useEffect(() => {
    if (saveState === 'saved') {
      setImportStatus((current) => current.startsWith('导入记录尚未保存') ? '记录已保存在此设备' : current);
    }
  }, [saveState]);

  const onChange = (next: Dream) => {
    const updated = { ...next, updatedAt: new Date().toISOString() };
    setDraft(updated);
    if (selectedId !== updated.id && !updated.title.trim() && !updated.body.trim()) return;
    setDreams((current) => current.some((item) => item.id === updated.id)
      ? current.map((item) => item.id === updated.id ? updated : item)
      : [updated, ...current]);
    setSelectedId(updated.id);
  };
  const onNew = () => {
    setDraft(makeDream()); setSelectedId(null); setMobileView('write');
  };
  const onSelect = (dream: Dream) => {
    setDraft(dream); setSelectedId(dream.id); setMobileView('write');
  };
  const onImport = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true });
      if (picked.canceled) return;
      const files = await Promise.all(picked.assets.map(async (asset) => ({
        name: asset.name,
        modifiedAt: (() => {
          const value = asset.file?.lastModified ?? asset.lastModified;
          return Number.isFinite(value) && value > 0 && value <= 8.64e15
            ? new Date(value).toISOString() : undefined;
        })(),
        content: Platform.OS === 'web' && asset.file
          ? await asset.file.text()
          : await new File(asset.uri).text(),
      })));
      setImportPreview(parseImportFiles(files));
      setImportStatus('');
    } catch (error) {
      setImportStatus(error instanceof Error ? `导入预览失败：${error.message}` : '导入预览失败：文件无法读取');
    }
  };
  const onConfirmImport = async (indices: number[], timeChoices: Record<number, TimeChoice>) => {
    if (!importPreview || importBusy) return;
    setImportBusy(true);
    let applied = false;
    try {
      const importedAt = new Date().toISOString();
      const additions = prepareImport(dreams, importPreview, indices, timeChoices, importedAt);
      if (!additions.length) throw new Error('所选记录已在梦库中，请重新检查');
      const merged = [...additions, ...dreams];
      queue.schedule(merged);
      setDreams(merged);
      setImportPreview(null);
      applied = true;
      await queue.flush();
      setImportStatus(`已导入所选的 ${additions.length} 篇记录`);
    } catch (error) {
      setImportStatus(applied
        ? '导入记录尚未保存在此设备，请点“重试保存”；关闭页面前请先导出备份'
        : error instanceof Error ? `导入失败：${error.message}` : '导入失败：文件无法读取');
    } finally {
      setImportBusy(false);
    }
  };
  const onRetrySave = () => { void queue.flush().catch(() => {}); };
  const saveStatus = saveState === 'failed' ? `保存失败：${saveError} 请勿关闭页面`
    : saveState === 'saving' ? '正在保存…'
      : selectedId ? (connectedLibrary ? '已保存到文件库' : '已保存在此设备') : '开始写，内容会自动保存';
  const onExport = async () => {
    try {
      if (!dreams.length) { setImportStatus('还没有可导出的记录'); return; }
      const filename = `梦貘手记备份-${todayLocal()}.jsonl`;
      const content = serializeDreamArchive(dreams);
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(new Blob([content], { type: 'application/x-ndjson;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
      } else {
        const file = new File(Paths.cache, filename);
        file.create({ overwrite: true });
        file.write(content);
        if (!await Sharing.isAvailableAsync()) throw new Error('当前设备无法打开分享菜单');
        await Sharing.shareAsync(file.uri, { mimeType: 'application/x-ndjson', dialogTitle: '保存梦貘手记备份' });
      }
      setImportStatus(`已生成 ${dreams.length} 篇的备份，请妥善保存`);
    } catch (error) {
      setImportStatus(error instanceof Error ? `导出失败：${error.message}` : '导出失败');
    }
  };

  if (!loaded) return <View style={s.loading}>
    <ActivityIndicator color={c.accent} /><Text style={s.loadingText}>正在打开梦貘手记…</Text>
  </View>;
  if (loadError) return <View style={s.loading}>
    <Text style={s.emptyTitle}>无法打开梦境</Text><Text style={s.loadingText}>{loadError}</Text>
  </View>;

  return <SafeAreaProvider><SafeAreaView edges={['top', 'bottom']} style={s.root}>
    <StatusBar style="dark" />
    <View style={s.dawnLine} />
    <View style={[s.main, wide && s.mainWide]}>
      {(wide || mobileView === 'library') && <Library dreams={dreams} selectedId={selectedId}
        query={query} setQuery={setQuery} onSelect={onSelect} onNew={onNew}
        onImport={onImport} onExport={onExport} onCloud={() => setShowCloud(true)}
        importStatus={saveState === 'failed' && saveError ? `${importStatus} 保存失败：${saveError}` : importStatus} syncStatus={connectedLibrary ? storageLabel() : sync.status}
        saveFailed={saveState === 'failed'} onRetrySave={onRetrySave} />}
      {(wide || mobileView === 'write') && <View style={s.writePanel}>
        {!wide && <View style={s.mobileHeader}><Brand />
          <Text style={s.localOnly}>{connectedLibrary ? storageLabel() : sync.status}</Text></View>}
        <Editor dream={draft} onChange={onChange} status={saveStatus}
          onRetry={saveState === 'failed' ? onRetrySave : null} compact={compact} />
      </View>}
    </View>
    {!wide ? <View style={s.bottomNav}>
      <Pressable onPress={onNew} accessibilityRole="button"
        style={[s.navButton, mobileView === 'write' && s.navActive]}>
        <Text style={[s.navText, mobileView === 'write' && s.navTextActive]}>✎ 记录</Text>
      </Pressable>
      <Pressable onPress={() => setMobileView('library')} accessibilityRole="button"
        style={[s.navButton, mobileView === 'library' && s.navActive]}>
        <Text style={[s.navText, mobileView === 'library' && s.navTextActive]}>☷ 梦库</Text>
      </Pressable>
      {!connectedLibrary && <Pressable onPress={() => setShowCloud(true)} accessibilityRole="button" style={s.navButton}>
        <Text style={s.navText}>☁ 同步</Text>
      </Pressable>}
    </View> : <Text style={s.desktopLocalOnly}>{connectedLibrary ? storageLabel() : sync.status}</Text>}
    <Modal visible={showCloud} transparent animationType="fade" onRequestClose={() => setShowCloud(false)}>
      <View style={s.modalBackdrop}>
        <ScrollView contentContainerStyle={s.modalContent} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => setShowCloud(false)} accessibilityRole="button" style={s.modalClose}>
            <Text style={s.modalCloseText}>关闭 ✕</Text>
          </Pressable>
          {showCloud && <CloudPanel sync={sync} />}
        </ScrollView>
      </View>
    </Modal>
    {importPreview && <ImportPreviewDialog preview={importPreview} existingIds={dreams.map((dream) => dream.id)}
      busy={importBusy} error={importStatus} onClose={() => setImportPreview(null)} onConfirm={onConfirmImport} />}
  </SafeAreaView></SafeAreaProvider>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.canvas },
  dawnLine: { height: 4, backgroundColor: c.dawn },
  main: { flex: 1 },
  mainWide: { flexDirection: 'row', maxWidth: 1500, width: '100%', alignSelf: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  glyph: { width: 39, height: 39, borderWidth: 1, borderColor: c.accent, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  glyphText: { fontSize: 26, color: c.accent, lineHeight: 32 },
  brandName: { color: c.ink, fontSize: 21, fontWeight: '700', letterSpacing: 2 },
  brandSub: { color: c.muted, fontSize: 11, marginTop: 1 },
  library: { flex: 1, minWidth: 0, backgroundColor: '#F0F5F4', borderRightWidth: 1, borderRightColor: c.line },
  libraryHeader: { paddingHorizontal: 25, paddingTop: Platform.OS === 'web' ? 28 : 42, paddingBottom: 12, gap: 18 },
  newButton: { backgroundColor: c.accent, borderRadius: 11, paddingVertical: 13, alignItems: 'center', marginTop: 13 },
  newButtonText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  search: { height: 43, borderWidth: 1, borderColor: c.line, backgroundColor: '#FFF', borderRadius: 9, paddingHorizontal: 13, color: c.ink, fontSize: 14 },
  count: { color: c.muted, fontSize: 12 },
  archiveActions: { flexDirection: 'row', gap: 20 },
  importButton: { alignSelf: 'flex-start', paddingVertical: 5 },
  importButtonText: { color: c.accent, fontSize: 12, fontWeight: '600' },
  importStatus: { color: c.muted, fontSize: 12, lineHeight: 18 },
  syncStatus: { color: c.muted, fontSize: 12 },
  list: { flex: 1 }, listContent: { paddingHorizontal: 15, paddingBottom: 30 },
  item: { paddingHorizontal: 15, paddingVertical: 17, borderBottomWidth: 1, borderBottomColor: c.line, borderRadius: 7 },
  itemSelected: { backgroundColor: c.accentSoft, borderBottomColor: 'transparent' },
  itemDate: { color: c.accent, fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  itemTitle: { color: c.ink, fontSize: 17, fontWeight: '700', marginTop: 6 },
  itemExcerpt: { color: c.muted, fontSize: 13, lineHeight: 20, marginTop: 5 },
  empty: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 24 },
  emptyMark: { color: c.dawn, fontSize: 30 },
  emptyTitle: { color: c.ink, fontSize: 18, fontWeight: '700', marginTop: 12 },
  emptyText: { color: c.muted, fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  writePanel: { flex: 2.2, minWidth: 0 },
  mobileHeader: { paddingHorizontal: 21, paddingTop: 20, paddingBottom: 12 },
  localOnly: { color: c.muted, fontSize: 11, marginTop: 10 },
  editorScroll: { flex: 1 },
  editorScrollContent: { paddingHorizontal: 28, paddingVertical: 36, flexGrow: 1 },
  editorScrollContentCompact: { paddingHorizontal: 9, paddingVertical: 8 },
  paper: { width: '100%', maxWidth: 790, alignSelf: 'center', backgroundColor: c.paper, borderRadius: 12, paddingHorizontal: 36, paddingTop: 32, paddingBottom: 27, flexGrow: 1, borderWidth: 1, borderColor: '#DEE8E7' },
  paperCompact: { paddingHorizontal: 19, paddingTop: 20, paddingBottom: 22, borderRadius: 8 },
  topLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  topLineCompact: { flexWrap: 'wrap', rowGap: 8 },
  dateGroup: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  fieldLabel: { color: c.muted, fontSize: 12 },
  timeMetadata: { color: c.muted, fontSize: 11, marginTop: 8 },
  dateInput: { color: c.accent, fontSize: 13, borderBottomWidth: 1, borderBottomColor: c.line, paddingBottom: 3, minWidth: 96 },
  saveStatus: { color: c.muted, fontSize: 11, paddingTop: 2, textAlign: 'right' },
  saveGroup: { alignItems: 'flex-end', gap: 4 },
  retrySave: { color: c.accent, fontSize: 12, fontWeight: '700' },
  titleInput: { color: c.ink, fontSize: 25, fontWeight: '700', marginTop: 35, paddingVertical: 7, minHeight: 52 },
  titleInputCompact: { fontSize: 21, marginTop: 22 },
  rule: { height: 1, backgroundColor: c.line, marginTop: 13, marginBottom: 24 },
  bodyInput: { color: c.ink, fontSize: 17, lineHeight: 30, minHeight: 320, flexGrow: 1, padding: 0 },
  foot: { color: c.muted, fontSize: 12, marginTop: 27 },
  bottomNav: { height: 67, flexDirection: 'row', backgroundColor: c.paper, borderTopWidth: 1, borderTopColor: c.line, paddingBottom: 8 },
  navButton: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navActive: { borderTopWidth: 2, borderTopColor: c.accent },
  navText: { fontSize: 14, color: c.muted }, navTextActive: { color: c.accent, fontWeight: '700' },
  desktopLocalOnly: { position: 'absolute', right: 30, bottom: 10, color: c.muted, fontSize: 11 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.canvas, gap: 12 },
  loadingText: { color: c.muted, fontSize: 14 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(22, 43, 49, 0.46)' },
  modalContent: { flexGrow: 1, justifyContent: 'center', padding: 16 },
  modalClose: { alignSelf: 'center', width: '100%', maxWidth: 440, alignItems: 'flex-end', padding: 10 },
  modalCloseText: { color: '#FFF', fontSize: 14 },
});
