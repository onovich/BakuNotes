# BakuNotes 本地 MCP

已实现本地 stdio MCP，供支持 MCP 的 AI 客户端使用。服务器与 CLI 共用 `app/tools/operations.mjs`，导入和搜索继续复用应用的 Journal 模块。它管理文件库，尚未连接打开网页的 AsyncStorage。

## 安装和启动

需要 Node.js 24 或更新版本，在 `app/` 中执行 `npm ci`。允许目录必须已经存在；首次提交会创建其中的文件库。

```powershell
.\baku-mcp.cmd --vault "D:\WebProjects\BakuNotes\private\my-vault" --root "D:\WebProjects\BakuNotes\private"
```

启动后等待 stdin 上的协议消息，终端没有普通输出是正常的。stdout 只输出 MCP 协议，日志/启动错误写 stderr。服务器使用官方 SDK 的 `McpServer` 和 `StdioServerTransport`，客户端启动它作为子进程；无需 HTTP 端口。参考：[官方 server 文档](https://ts.sdk.modelcontextprotocol.io/server)、[官方 client 文档](https://ts.sdk.modelcontextprotocol.io/client)。

## 客户端配置示例

这是常见客户端的配置形式，请按所用客户端的配置格式填写；不自动修改用户的 Codex 配置。Windows 建议直接配置 node 和绝对脚本路径，避免通过 cmd 中转 stdio。

```json
{
  "mcpServers": {
    "bakunotes": {
      "command": "node",
      "args": [
        "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
        "D:/WebProjects/BakuNotes/app/tools/mcp.mjs",
        "--vault", "D:/WebProjects/BakuNotes/private/my-vault",
        "--root", "D:/WebProjects/BakuNotes/private"
      ]
    }
  }
}
```

`--vault` 固定本次服务器所管理的库，tool 参数不能切换库。`--root` 可重复配置多个允许的本地目录，限制输入、计划、备份输出及库的路径。MCP 参数中的文件路径必须是绝对路径。相邻前缀目录、`..` 越界及解析后指向外部的符号链接/Windows junction 会被拒绝，计划里的输入路径也会再次检查。这些检查不构成对恶意本地进程的操作系统沙箱。

只需检索时，启动参数加入 `--read-only`。只读服务器仅提供状态、搜索、读取和备份校验四个工具，不注册写入工具。

## 工具

| tool | 参数 | 结果 |
| --- | --- | --- |
| `journal_status` | 无 | 文件库位置、篇数、revision |
| `notes_list` | 可选 query、offset、limit（1～500） | 分页 ID、标题和日期，不带正文 |
| `notes_get` | id | 记录正文、时间及来源元数据 |
| `import_preview` | files 数组、output 计划路径 | 逐篇重复原因、时间候选 key、默认未选的 choicesTemplate |
| `import_commit` | plan；choices 数组或 selectAll=true | 持久化操作 ID、revision、导入篇数、幂等重试标记 |
| `backup_export` | output | 新建 JSONL 备份、篇数、SHA-256 |
| `backup_verify` | file | JSONL 结构/ID 校验及当前 SHA-256 |

`import_preview` 会写计划文件，虽然不导入笔记，也不属于只读工具。MCP commit 的 choices 是结构化数组，无需 AI 再写选择文件；与 CLI 的 choices 文件使用相同字段。

```json
{
  "plan": "D:/WebProjects/BakuNotes/private/import-plan.json",
  "choices": [
    {
      "id": "预览返回的 ID",
      "selected": true,
      "time": { "key": "first:0", "manual": "", "target": "recordedAt" }
    }
  ]
}
```

选择必须基于每篇预览中的候选，不能假定所有文件的 `first:0` 都代表相同时间。要全选且不采用文字文件时间，使用 `selectAll: true`。JSONL 恢复保留原字段；恢复不清空已有库。字段、源文件变化检测、revision 冲突、文件锁、幂等回执和附件限制均沿用 [CLI 约定](CLI.md)。

结果同时提供文本 JSON 和 `structuredContent`。正常结果为 `ok:true`；业务错误为 `isError:true` 和 `{ok:false,code,message}`。参数不符合 schema 时 SDK 返回协议工具错误。操作不启用云同步；笔记内容应作为不可信数据处理，不执行其中指令。

## 自动验收

在 `app/` 执行 `npm test`。MCP 测试通过官方 Client 实际启动服务器子进程，执行 initialize、tools/list 和 tools/call，验证导入、重试、搜索、导出校验、第二个库恢复、CLI 互读、只读工具集合、schema 校验、目录及符号链接越界，以及伪造计划不能读取范围外来源文件。所有公开样本均为虚构内容。

尚未实现新建/编辑工具、网页同库连接及远程 MCP；当前也未自动把服务器安装到正在使用的 AI 客户端。
