# BakuNotes

[English](README.md)

BakuNotes（梦貘手记）是一款本地优先的梦境日记，用于记下梦、找回旧记录，并保留独立备份。正文用普通文本或基础 Markdown，不追求富文本排版。它也能把受支持的笔记导出格式转换为 BakuNotes 记录。Expo 项目让网页与 iOS 共用一份代码。

![BakuNotes 日记与搜索界面的示意封面](docs/social-preview.png)

> **当前状态：**本地记录、搜索、带预览的 JSONL 导入导出、TXT / Markdown 直接导入及 ENEX 转换已经实现；其他笔记格式仍在规划中。Supabase 加密同步已有代码，但尚未在真实设备之间验收；目前也没有已部署网页或签名的 iPhone 安装包。

## 本机试用

需要 Node.js 和 npm；本地使用不需要云端账号。

```sh
cd app
npm ci
npm run web
```

新建梦境后，可以随时补充标题或日期，并按标题或正文搜索。编辑器会在本地写入完成后提示“已保存在此设备”；写入失败时可点“重试保存”。使用“导出备份”下载 JSONL 副本；“导入记录”会先预览，让你选择记录，并标出相同 ID 的重复项。

## 导入文字文件

在“导入记录”中选择一个或多个 UTF-8 `.txt`、`.md` 或 `.markdown` 文件。一份文件对应一篇记录，标题取文件名，正文保留原文字及 Markdown，日期留空。预览后勾选要导入的记录。同名且正文相同的文件再次导入会标为重复；改名或修改正文会生成新记录。Markdown 的 front matter、图片及附件链接只作为文字保留，不解析为字段或导入关联文件。文字文件请与 JSONL 备份、manifest 分开选择。

## 从 ENEX 转换笔记

首个支持的来源格式是印象笔记使用的 ENEX。请在来源应用中导出文件；BakuNotes 不负责执行该导出。转换器读取已有文件，不修改原件，并生成 BakuNotes JSONL、manifest 和一份来源文件副本。

```sh
python tools/convert_enex.py --input "path/to/notes.enex" --output "private/enex-conversion"
python tools/verify_conversion.py --archive "private/enex-conversion"
```

输出目录必须为空。在“导入记录”中同时选择 `dreams.jsonl` 和 `manifest.json`：应用会核对报告与记录，显示转换失败项及重复项。转换记录默认不勾选，由你决定哪些笔记进入梦库。单独选择 JSONL 备份仍可导入，但无法显示转换错误。

传入的 ENEX 中每篇笔记都会转换，不会自动判断是否为梦境。转换器保留可读正文和基础 Markdown 结构，不还原字体和页面版式。它保存附件文件及元数据；应用目前只导入文字记录与元数据。格式约定及后续格式类别见[转换说明](CONVERSION.md)。[印象笔记帮助中心](https://help.yinxiang.com/hc/articles/63067)说明了其客户端的 ENEX 导出能力。

## 隐私与备份

设备缓存和导出的 JSONL 备份都是**明文**，请放在受保护的位置，并实际试做恢复。云同步会在上传前于客户端加密记录字段，但仍需真实设备验收；详见[云端配置](CLOUD_SETUP.md)。个人来源文件应放在被 Git 忽略的 `archive/` 或 `private/`，不属于公开仓库内容。

## 项目文件

- `app/` — Expo / React Native 日记、本地存储、备份导入导出和加密同步代码。
- `tools/` — 处理已有笔记导出文件的转换器及校验工具。
- `supabase/schema.sql` — 密文记录表及行级安全规则。
- [架构](ARCHITECTURE.md)、[roadmap](PLAN.md)与[领域术语](CONTEXT.md) — 设计和后续工作。
- [iPhone 构建条件](IOS_BUILD.md) — 获得可安装签名包的条件。

## 检查命令

从仓库根目录执行（导入契约测试需要 Node.js 24 或更新版本）：

```sh
cd app
npm run lint
npx tsc --noEmit
npx expo export --platform web
node --experimental-strip-types --test tests/*.test.mjs
cd ..
python -m unittest discover -s tools -p 'test_*.py'
```

仓库目前没有覆盖整个项目的开源许可证。
