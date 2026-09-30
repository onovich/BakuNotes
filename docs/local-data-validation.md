# 本地数据验收

## 已完成

- 少量虚构记录：网页创建、确认保存、刷新读回、实际导出备份，并在独立空白本地站点恢复；重复 ID 在导入预览中标出。
- 1,500 篇生成记录：每篇含 20 行中文正文、日期、标签、来源和附件元数据，JSONL 共 3,226,146 字节。自动测试验证保存队列写入的 JSON 快照、重新读取、JSONL 导出与解析后内容完全一致，全部 ID 可识别为已有记录。
- 梦库列表使用 FlatList 按需渲染，避免直接创建全部记录行；导入预览也使用 FlatList。API 约定见 [React Native 文档](https://reactnative.dev/docs/flatlist)。

批量测试使用内存中的存储替身，验证数据契约与队列行为，不能代表浏览器磁盘写入、存储额度或移动设备性能。没有给执行时间设置硬性阈值。

## 尚待完成

批量网页验收因浏览器自动化无法确认当前 URL 而中断，尚未验证 1,500 篇记录在实际浏览器中的导入、搜索、编辑、刷新及独立恢复。真实 iPhone 写入也未验收。

生成器为 `app/tests/fixtures/syntheticDreams.mjs`；本机样本位于 Git 忽略的 `private/performance/bulk-1500.jsonl`。这些内容均为虚构数据。恢复测试应使用独立本地站点或独立浏览器档案。

## 重跑数据契约测试

从 `app/` 执行：

```sh
node --experimental-strip-types --test tests/*.test.mjs
```
