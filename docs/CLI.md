# BakuNotes CLI

已实现：文件库的状态、分页检索、读取、新建/编辑、导入预览/确认、备份导出/校验；[本地 MCP](MCP.md) 复用相同操作，[网页连接模式](WEB_VAULT.md)可读写同一库。

## 启动

需要 Node.js 24 或更新版本，先在 `app/` 执行 `npm ci`。在项目根目录使用 `baku.cmd`；其他系统使用 `node app/tools/baku.mjs`，或在 `app/` 使用 `npm run baku -- ...`。

```powershell
.\baku.cmd --help
.\baku.cmd status --vault private/my-vault --json
```

`--vault` 明确指定文件库目录。不存在的库读取为零篇，首次提交时创建。普通网页的 AsyncStorage 与文件库独立；连接模式的网页与 CLI 指向同一目录，刷新网页可读取工具更新。库、计划、选择文件和备份含个人信息，应保存在 `private/` 等不公开目录。

## 新建和编辑

先读取 `status` 或 `notes get` 的 revision。将指定字段写入 UTF-8 JSON 文件，再提交；正文使用普通文本或基础 Markdown，不解析富文本。

`private/new-note.json` 示例：

```json
{"title":"合成示例","body":"梦见一只纸船。","dreamDate":"2026-10-02","tags":["纸船"]}
```

```powershell
.\baku.cmd notes create --vault private/my-vault --input private/new-note.json --expected-revision 0 --request-id create-note-001 --json
.\baku.cmd notes update --vault private/my-vault --id "返回的记录ID" --input private/note-patch.json --expected-revision 1 --request-id update-note-001 --json
```

示例 revision 仅适用于空库第一次创建后，实际使用当前库返回的值。编辑文件仅写需要改变的字段，例如 `{"body":"修改后的正文"}`。省略字段保持原值；标题/正文不能同时为空白。只接受 title、body、dreamDate、tags 和 recordedAt；ID、创建时间、来源及附件不可通过该命令改写。每次成功写入更新系统 updatedAt。

- dreamDate 使用有效 `YYYY-MM-DD`，空字符串代表未知；新建时省略则未知，不按创建时间猜测梦的日期。
- 新记录的 createdAt/updatedAt 由系统生成，recordedAt 默认本次创建时间。可显式指定 recordedAt（支持现有中文/数字时间解析），null 表示未知；编辑时省略保持原值。
- tags 为字符串数组，空数组清空标签。
- `--expected-revision` 是整个库的版本号，其他记录被修改也会产生冲突。冲突后重新读取记录/版本并核对，再以新的 request-id 提交。
- request-id 为 8～128 位字母、数字、下划线或连字符。为每次操作生成不同值；响应丢失时使用同一个 ID、同一输入和原 revision 重试，返回原结果且不重复写入。同 ID 不同参数会冲突。重试回执是当时结果，最新记录用 notes get 读取。

## 导入

```powershell
.\baku.cmd import preview --vault private/my-vault --files "path/to/note.txt" --files "path/to/second.md" --output private/import-plan.json --choices-output private/import-choices.json --json
```

每个输入使用一个 `--files`，也可传入目录：递归读取 TXT/MD/MARKDOWN，跳过符号链接和其他类型，相对路径区分同名文件。支持单独的 JSONL、JSONL + manifest.json；不要混选文字文件和 JSONL。原 ENEX 仍先用现有转换器转换。预览不写入记录，返回逐文件 errors、重复原因、每篇时间候选 key 和默认未选的 choices 模板。部分文字文件失败时，有效文件仍可提交；整批失败则报错。计划只包含预览时的文件，之后新增文件需重新预览。

编辑 UTF-8 的 choices 文件，将所需记录 `selected` 设为 `true`。`time.key` 可以使用该篇候选 key、`none`（未知）或 `manual`；`target` 可选 `dreamDate`、`recordedAt`、`both`。

```json
[{"id":"预览返回的记录 ID","selected":true,"time":{"key":"manual","manual":"2026年10月1日8时30分","target":"both"}}]
```

```powershell
.\baku.cmd import commit --vault private/my-vault --plan private/import-plan.json --choices private/import-choices.json --json
```

批量导入全部记录并保留文字文件时间未知：

```powershell
.\baku.cmd import commit --vault private/my-vault --plan private/import-plan.json --select-all --json
```

`--choices` 与 `--select-all` 必须二选一。JSONL 保留自身时间。批量时间设置通过 choices 数组为选中 ID 写入规则或各自候选 key；候选逐篇生成，不能误套其他篇的候选值。CLI 提供最后修改时间；文件系统创建时间不能证明原笔记创建时间，当前不提供该候选。无时间、非法或歧义日期不会自动替代。

计划绑定库目录、revision、来源路径、内容校验值和最后修改时间。源文件或库变化后须重新预览。同一计划、同一 choices 重试返回原结果，不再次写入；不能改变已提交计划的 choices。重复 ID 跳过。先校验整批，再写入一次快照，持久化成功才报告成功。

## 搜索和读取

```powershell
.\baku.cmd notes list --vault private/my-vault --query "海边 灯" --offset 0 --limit 50 --json
.\baku.cmd notes get --vault private/my-vault --id "记录 ID" --json
```

搜索复用应用的全部词匹配和日期排序。列表只返回 ID、标题、日期；正文通过 get 读取。分页上限 500 篇。

## 备份和恢复

```powershell
.\baku.cmd backup export --vault private/my-vault --output private/backup.jsonl --json
.\baku.cmd backup verify --file private/backup.jsonl --json
.\baku.cmd import preview --vault private/restored-vault --files private/backup.jsonl --output private/restore-plan.json --json
.\baku.cmd import commit --vault private/restored-vault --plan private/restore-plan.json --select-all --json
```

导出返回 SHA-256、篇数及 revision；verify 检查结构和 ID 唯一性，返回当前校验值。需与导出校验值比较，单独 verify 不证明未被改变。恢复按 ID 追加，不清空原库，保留回收站状态和内嵌原音；外部附件文件不随 JSONL 复制。输出计划、模板及备份均不覆盖已有文件。

## 存储和错误

库的 `vault.json` 保存版本、revision、JSONL 及操作回执。写入用 `.write-lock`，先 flush 临时快照再替换。输出通过完整临时文件的硬链接发布，避免覆盖或暴露半写文件；需支持硬链接的本地文件系统，如 NTFS。网络盘和掉电恢复尚未验收。

进程异常退出可能遗留锁。确认没有写入进程、检查库和备份后再移除该库的 `.write-lock`；工具不自动抢占未知锁。

成功在 stdout 返回结果；`--json` 为机器可读格式。错误在 stderr 返回 `{ok:false,code,message}`。退出码：0 成功，2 参数/记录校验错误，3 库冲突/源文件变化/写入锁冲突，4 文件或存储错误。常见 code：`CONFLICT`、`SOURCE_CHANGED`、`VAULT_BUSY`、`INVALID_CHOICES`、`EEXIST`。

## 验证

在 `app/` 执行 `npm test`。集成测试逐命令启动独立进程，覆盖时间选择、磁盘保存、重启读回、备份恢复、去重、幂等重试、源文件变化、revision 冲突、无效选择及写入失败。真实 8 篇候选的同类文件库验收也已通过，来源原件和浏览器存储未改变。
