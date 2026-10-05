# DownloadRecord 项目专属规则

本项目继承 Codex 已加载的全局 `AGENTS.md`（本机：`C:\Users\freez\.codex\AGENTS.md`）；以下保留项目专属规则。

- 本项目是 Tampermonkey 用户脚本，主要入口是 `DownloadRecord.user.js`。
- 功能围绕小红书下载记录、链接去重、JSON 导出和手动标记；修改时保持脚本可直接安装运行，不引入需要构建的框架。
- `loadCollapsed.test.js` 是现有测试脚本，涉及折叠、记录或导出逻辑时优先运行或检查它。
- 提交前检查用户脚本元数据区、权限声明和匹配范围，避免扩大网站权限或破坏原有脚本安装方式。
