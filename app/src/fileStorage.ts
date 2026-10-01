import type { Dream } from './dreams';
import { parseDreamArchive, serializeDreamArchive } from './import.ts';

export function createFileStorage(base: string, token: string, request: typeof fetch = fetch) {
  let revision: number | null = null;
  let label = '连接本地文件库';
  async function call(method: string, body?: unknown) {
    const response = await request(`${base}/api/library`, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.code === 'CONFLICT'
      ? '文件库已被其他窗口或工具修改。请先导出当前内容备份，再刷新页面重新载入。'
      : result.message || '文件库连接失败');
    return result;
  }
  return {
    get label() { return label; },
    async load(): Promise<Dream[]> {
      const result = await call('GET');
      const dreams = parseDreamArchive(result.archive, true);
      revision = result.revision;
      label = `本地文件库 · ${result.name}`;
      return dreams;
    },
    async save(dreams: Dream[]): Promise<void> {
      if (revision === null) throw new Error('请先加载文件库');
      const result = await call('PUT', { revision, archive: serializeDreamArchive(dreams) });
      revision = result.revision;
    },
  };
}
