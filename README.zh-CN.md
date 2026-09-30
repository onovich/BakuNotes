# BakuNotes

[English](README.md)

BakuNotes（梦貘手记）是本地优先的梦境日记原型，也提供保存、整理有道笔记导出的工具。Expo 应用可在网页端记录、搜索、导入和导出梦境；同一份源码也面向 iOS。

![BakuNotes 日记与搜索界面的示意封面](docs/social-preview.png)

> **隐私与完成度：**真实导出文件和梦境正文应放在已被 Git 排除的 `archive/` 或 `private/`。应用的设备缓存和 JSONL 导出文件是明文。Supabase 加密同步已有代码，但尚未在真实设备间验收；目前也没有签名的 iPhone 安装包或已部署的网页。正式使用前，请另存独立备份。

## 在本机试用日记

需要 Node.js 和 npm。本地使用无需配置云端。

```sh
cd app
npm ci
npm run web
```

网页预览支持新建、自动保存到当前设备、搜索标题和正文，以及 JSONL 导入导出。未按[云同步说明](CLOUD_SETUP.md)配置时，记录只在当前设备。

## 保存有道文件夹导出

PDF 处理需要 Python 和 `pypdf`。输出目录必须尚无文件；工具只读取原始输入，不会修改它。

```sh
python -m pip install pypdf
python tools/import_youdao_export.py --input "path/to/export" --output "archive/youdao-new"
python tools/verify_youdao_export.py --archive "archive/youdao-new"
python tools/build_youdao_review.py --archive "archive/youdao-new"
```

工具会复制原件、记录 SHA-256、提取 PDF 中可读取的文字，并生成复核表。`dreams.jsonl` 只是**按规则筛出的候选**，不是已确认的梦库；导入应用前应复核候选和缺失的正文。仓库另有 [ENEX 转换器](tools/import_enex.py)及其[归档校验工具](tools/verify_archive.py)。

## 项目结构

- `app/` — Expo / React Native 网页与 iOS 源码，包括本地存储和待验收的加密同步。
- `tools/` — 本地导出转换、复核与完整性校验。
- `supabase/schema.sql` — 密文记录表和行级安全规则。
- `archive/` 与 `private/` — 本地数据，不纳入 Git。

目标设计见[架构](ARCHITECTURE.md)、[roadmap](PLAN.md)和[领域术语](CONTEXT.md)。[云端配置](CLOUD_SETUP.md)与 [iPhone 构建条件](IOS_BUILD.md)仍需用实际账号验收。

## 检查命令

```sh
cd app
npm run lint
npx tsc --noEmit
cd ..
python -m unittest discover -s tools -p 'test_*.py'
```

仓库目前没有覆盖整个项目的开源许可证。
