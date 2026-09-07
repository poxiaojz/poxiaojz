# Error Memory Skill

让 Claude 在遇到错误、被纠正或找到可靠修复方案后，把可复用经验保存到项目的 `.learnings/` 目录；下次遇到类似任务时先查阅这些记录，减少重复踩坑。

这个仓库包含三部分：

- `SKILL.md`：Claude Code 使用规则；
- `scripts/session-start-check.js`：SessionStart 只读摘要 Hook；
- `scripts/error-memory.js`：本地检索、校验、记录和解决状态的 CLI。

## 安装到 Claude Code

把本目录复制到项目的：

```text
.claude/skills/error-memory/
```

也可以复制到个人 Skill 目录：

```text
%USERPROFILE%\.claude\skills\error-memory\
```

macOS/Linux 对应 `~/.claude/skills/error-memory/`。

安装后可以输入 `/error-memory`，或直接描述“记住这个错误”“检查以前的解决方案”。

## 记忆范围

- `.learnings/ERRORS.md`：命令、工具、环境等失败；
- `.learnings/LEARNINGS.md`：纠正后的方法、项目约定和可复用经验；
- 项目级记忆优先于全局记忆；全局目录默认为 `~/.learnings/`，也可以用 `CLAUDE_ERROR_MEMORY_DIR` 覆盖。

每条记录至少应包含标准 ID、Priority、Status 和 Summary。建议额外填写 Tags、Files、Tools 和 Environment，帮助相关性检索。

## CLI

CLI 不依赖第三方包，需要 Node.js 18 或更高版本：

```bash
node scripts/error-memory.js search "Windows path"
node scripts/error-memory.js validate
node scripts/error-memory.js record --title "标题" --summary "摘要" --tags node,windows
node scripts/error-memory.js resolve ERR-20260907-ABC --verified --fix "已实际验证的修复方法"
```

常用选项：

```text
--cwd PATH                    项目根目录
--global-dir PATH             全局记忆目录
--limit N                     搜索结果数量
--type error|learning         写入 ERRORS.md 或 LEARNINGS.md
--scope project|global        写入项目级或全局级记忆
```

`record` 会创建标准 Markdown 条目，`validate` 会检查缺失字段、非法状态、重复 ID 和读取错误，`search` 会结合标题、摘要、标签、文件、工具、环境和状态进行排序。

## 会话开始自动检查

把 `examples/settings.project.json` 合并到项目的 `.claude/settings.json`，即可在启动、恢复、`/clear` 和上下文压缩时运行只读检查。已有 `settings.json` 时只合并 `hooks.SessionStart`，不要覆盖其他配置。

Hook 会读取项目和全局记忆并输出最多 12 条相关摘要；它不会修改记忆文件，也不会执行记忆文件中的命令。可以通过 `ERROR_MEMORY_MAX_ITEMS` 调整数量；如果 Hook 输入包含 `query` 或 `prompt`，也会用于相关性检索。

## 安全原则

不要保存密码、Token、API Key、私钥、私人数据或完整日志。CLI 和 Hook 会对常见凭据模式做基础脱敏，但脱敏不是安全审计，敏感信息仍不应写入记忆。

只有经过验证的修复方案才能标记为 `resolved`；未经验证的内容应保持 `pending`。

## 中文说明

完整中文规则见 [`SKILL.zh-CN.md`](SKILL.zh-CN.md)。

## 集成测试反馈修复

- 全局目录优先级：CLI 的 `--global-dir` > `CLAUDE_ERROR_MEMORY_DIR` > `~/.learnings/`；核心模块与 Hook 使用相同回退规则。
- `resolve ID --verified --fix "修复方法"` 会同时保存验证标记与修复方法。若记录已包含 `Verified: yes` 和有效修复，可省略对应参数。
- `--verified` 是调用者对实际验证的确认，程序不会替你运行修复命令。仅在真正验证成功后使用。
- `record`、`resolve`、`validate` 对 resolved/promoted 使用同一规则：验证为 yes 且修复非空；旧记录缺少这些信息时会被提示，不会自动迁移。
- `search` 无匹配但读取正常时退出 0；读取失败或解析警告时仍输出可用结果，但退出 1。SessionStart Hook 继续保持容错。
- 补齐 `secret_key`、`secret-key`、`secretKey` 的基础脱敏。
- 测试显式使用临时全局目录，不依赖用户真实记忆。运行 `node --test` 可执行单元与 CLI 子进程回归测试；这不等同于真实 Claude Code 会话验证。
