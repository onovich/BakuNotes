# 发布准备与待配合项

## 已准备

`.github/workflows/verify.yml` 在 main 推送和 PR 时运行 Windows / Node 24 / Python 3.12 检查：依赖安装、Node 测试、类型检查、lint、ENEX 测试和网页导出。

`.github/workflows/deploy.yml` 仅手动触发，构建并部署 GitHub Pages。`BAKU_WEB_BASE=/BakuNotes` 设置 Expo 静态资源路径，本机已核对导出 HTML 的资源前缀。普通本地构建不设置该变量。工作流不携带 Supabase 密钥。

`app/app.config.js` 支持通过 `BAKU_IOS_BUNDLE_ID` 指定用户拥有的 iOS bundle identifier；没有预设他人标识。签名条件见 [IOS_BUILD.md](../IOS_BUILD.md)。

## 暂缓，等待用户配合

1. **HTTPS 网页：**2026-10-02 GitHub Pages API 返回 404，尚未启用。`gh-pages-action-deployer` 技能要求修改仓库 Pages 设置前确认，本轮只提交工作流。后续确认后在仓库 Settings → Pages 选择 GitHub Actions，再手动运行 Deploy web preview；检查生成 URL、资源请求及备份恢复。当前不能称为已部署。
2. **真实加密同步：**需要用户自己的 Supabase 项目和公开客户端配置，部署现有 SQL/RLS，然后用两台设备验收离线编辑、并发冲突、响应重试、回收站恢复、密文与错误口令。模拟接口通过不代表真实云端验收完成。
3. **iPhone：**需要 Expo / Apple 账号、签名和注册设备，设置 bundle identifier，生成内部预览包并真机验收。当前没有可安装签名包。
4. **真实录音：**需要用户授予目标站点麦克风权限，试听短录音、中断、下载和导出后恢复；Safari 与手机需分别验证。当前只有合成录音测试。

## 下一批可独立推进的工作

ENEX 来源差异样本、HTML 文件夹和 CSV 字段映射；大量音频的独立附件存储与容量提示；原生录音；存储层从整库快照迁移到增量持久化。需要真实来源格式或设备的部分先收集样本，再承诺支持范围。
