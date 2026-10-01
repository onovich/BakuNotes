# CLI 与 MCP 设计提案

状态：文件库 CLI 和本地 stdio MCP 的状态、检索/读取、导入预览/确认及备份导出/校验已实现，使用方式见 [CLI 文档](CLI.md) 和 [MCP 文档](MCP.md)。新建/更新、网页同库连接仍在设计阶段。目标是让用户、AI 和自动测试通过同一套操作管理 BakuNotes，不依赖桌面点击。

## 架构

```text
网页 / iOS 界面 ─┐
用户 CLI ───────┼→ Journal 模块 → 存储 adapter
AI MCP ─────────┤                 ├─ 应用 AsyncStorage
自动测试 ───────┘                 └─ 本地文件库
```

Journal 模块的 interface 统一记录校验、搜索、导入预览、时间选择、去重、持久化及备份语义。CLI 和 MCP 只处理参数、文件输入和结果输出，不各自实现一份业务规则。现有 `import.ts`、`importTime.ts`、`saveQueue.ts` 可逐步复用；`dreams.ts` 中的 UUID 和时钟需要注入，避免共享模块依赖 Expo。

存储 adapter 分别面对现有 AsyncStorage 和本地文件库，两种实际存储需求构成可测试的 seam。第一阶段文件库使用版本化快照及 revision；JSONL 仍是用户可携带的备份格式。写入通过锁、临时文件及替换完成，失败不报告成功。并发提交校验 revision，防止覆盖较新内容。

CLI 的文件库与浏览器按 origin 隔离的数据不是同一个库。第一阶段通过 JSONL 显式交换，不能宣称 CLI 已控制打开的网页。后续网页连接模式需由本地进程持有文件库、串行处理修改，网页和 CLI/MCP 均提交到同一进程；保留离线 AsyncStorage 模式。连接模式必须显式绑定库和会话，显示当前库，不让两个存储各自修改后静默互相覆盖。此连接机制尚待单独实现和验收。

## 首批操作

以下为完整目标 interface；现有 CLI/MCP 支持的子集及准确启动方式见对应文档。新建/更新尚未实现。

| 用户 CLI | MCP tool | 用途 |
| --- | --- | --- |
| `baku status` | `journal_status` | 当前库、revision、篇数及持久化状态，不默认返回正文 |
| `baku notes list --query ...` | `notes_list` | 分页搜索；返回 ID、标题、日期，按需包含摘要 |
| `baku notes get --id ...` | `notes_get` | 读取指定记录及来源信息 |
| `baku notes create` / `update` | `notes_create` / `notes_update` | 新建或修改；更新提交 expected revision，输入正文支持文件/stdin |
| `baku import preview --files ...` | `import_preview` | 校验输入，返回记录、重复项、时间候选及稳定 plan ID，不写入 |
| `baku import commit --plan ... --choices ...` | `import_commit` | 提交选择和字段目标；校验计划、源文件校验值及库 revision；缺失/歧义时间不替代 |
| `baku backup export --output ...` | `backup_export` | 生成明确路径的 JSONL，返回篇数及 SHA-256 |
| `baku backup verify --file ...` | `backup_verify` | 验证备份可读性和结构；来源原件校验作为单独选项 |

备份恢复复用 import preview/commit，通过相同的去重和选择规则追加记录。第一版不提供默认清空整个库的恢复操作，也不提供永久删除或任意 shell 工具。后续删除优先设计可恢复的回收机制。

每次命令明确指定 `--vault <path>` 或使用用户配置的默认库；测试必须传入独立临时库。CLI 提供人可读输出和 `--json` 结构化输出，退出码区分成功、校验错误、冲突及存储失败。MCP 返回相同结果结构，统一错误 code、操作 ID、revision、篇数和校验值。

## 导入计划

- 预览记录输入文件校验值、基准 revision、稳定记录 ID、重复原因、可用时间候选及候选 key。
- choices 文件按记录 ID 指定是否选中、采用候选/手动/未知、写入梦的日期/记录时间/两者；人工界面可以生成同一份 choices。
- commit 重新验证输入及 revision；发生变化返回冲突，要求重新预览。
- 使用幂等键识别已完成的重复提交；先校验全部选择，再持久化整批，失败不产生一半成功的结果。
- 用户授权的明确时间规则可批量应用；未指定时保留未知。预览时间和实际确认导入时间分别保留。

## MCP 与访问范围

第一版采用本地 stdio，由 AI 客户端启动进程，不增加常驻网络端口。stdio 是 MCP 官方支持的本地传输，stdout 只输出协议消息，日志写 stderr。依据：[官方 SDK 文档](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md)。实施时再锁定 SDK 版本及对应稳定协议。

MCP 启动配置指定库路径和可读取/写入的目录。批量文件操作遵守已配置范围，返回越界错误；导出不默认覆盖已有文件。可提供只读模式供检索使用。笔记正文、标题及路径是数据，不能变成工具指令；日志和公开测试报告不记录真实正文、密钥或个人来源路径。连接本地工具不自动开启云同步。用户可授权库内操作，无须对每一次正常读取或已授权写入增加额外确认。

## 验收策略

1. 在独立测试库预览八份来源样本，明确选择未知时间，提交后等待真实磁盘持久化。
2. 关闭 CLI 进程，重新启动，核对记录 ID、正文、时间及来源元数据。
3. 导出 JSONL，记录校验值，在第二个空白文件库恢复，并逐字段比较。
4. 重复恢复验证去重；覆盖非法输入、源文件变化、revision 冲突、写入失败及重试。
5. 同一场景通过 MCP initialize、tools/list、tools/call 再执行，确认协议结果与 CLI 一致。
6. 网页接入相同模块/连接模式后，验证界面显示和编辑确实对应工具提交的数据。

业务及持久化测试可由 CLI/MCP 完成；页面布局、输入框出现/隐藏、可访问性和文件选择器仍保留少量浏览器测试。文件库验收不能冒充现有浏览器存储验收。

## 实施顺序

1. 提取可跨 Node/Expo 的 Journal 模块，保留现有 ID、存储键和 JSONL 兼容性；应用导入也调用相同 interface。
2. 实现本地文件 adapter 和 CLI：status、list/get、import preview/commit、backup export/verify；用独立库完成真实磁盘往返测试。
3. 接 stdio MCP，复用 CLI 所依赖的模块，并运行协议级测试；随后补 create/update。
4. 实现网页连接模式，再完成工具与打开网页同库的验收；云端/移动端操作随后扩展。

第一阶段交付 CLI 可运行、持久化可验证；第二阶段交付 AI 可调用的 MCP。工具名称、选项、连接方式在实现后才写入 README 的可用功能列表。
