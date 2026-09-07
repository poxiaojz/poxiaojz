---
name: error-memory
description: 通过检查并记录已验证的错误、纠正方案和项目陷阱，减少 Claude 重复犯错。适用于任务可能重复、命令或工具失败、用户纠正做法，或发现可靠替代方案时。
---

# 错误记忆

维护一份小而可靠的错误与修复记录，让后续 Claude 会话在遇到类似任务时先查经验，避免重复踩坑。

## 记忆范围

同时使用两层记忆：

- 项目记忆：当前项目下的 `.learnings/`，记录项目约定、文件行为和项目专属修复。
- 全局记忆：`~/.learnings/`（Windows 为 `%USERPROFILE%\.learnings\`），记录系统环境、工具和跨项目经验。

全局目录默认位于用户主目录，也可以用环境变量 `CLAUDE_ERROR_MEMORY_DIR` 覆盖。先查项目记忆，再查全局记忆；两处有相似记录时，除非问题明显属于环境问题，否则优先采用项目记录。

## 开始工作前

当任务较复杂或与之前的工作相似时：

1. 检查项目的 `.learnings/LEARNINGS.md` 和 `.learnings/ERRORS.md`（如果存在）。
2. 如果涉及系统工具、依赖、认证、网络或其他跨项目行为，再检查全局目录中的同名文件。
3. 按任务文件、工具、错误文本、框架和环境关键词搜索相关记录。
4. `pending` 或 `in_progress` 只代表待验证假设；优先采用 `resolved` 的记录。
5. 在尝试以前失败的方法前，先应用相关的已验证修复。

不需要时不要加载全部历史，只做针对性搜索。

如果 `.learnings/` 或其中某个文件不存在，在第一次记录已验证经验前创建目录和文件，并先写一个简短的 Markdown 标题。

## 发生错误时

1. 保存准确的错误、尝试过的操作和相关上下文。
2. 重试前搜索记忆文件，看是否有相同或相近的失败记录。
3. 除非假设发生变化或出现新证据，否则不要原样重复失败操作。
4. 修复确认有效后记录可复用经验：
   - 项目专属的命令或文件错误写入项目 `.learnings/ERRORS.md`。
   - 跨项目的命令、工具或环境错误写入全局 `.learnings/ERRORS.md`。
   - 纠正后的做法、项目约定或更好的方法写入对应的 `LEARNINGS.md`。
5. 如果已有匹配记录，更新或互相链接并增加复现次数，不要制造重复噪声。

沿用现有文件的格式，并使用 `ERR-YYYYMMDD-XXX` 或 `LRN-YYYYMMDD-XXX` 这样的唯一 ID。只有修复实际验证成功后，才能标记为 `resolved`。

新建记忆文件时，至少使用以下格式：

```markdown
## [ERR-YYYYMMDD-XXX] operation-name
**Logged**: ISO-8601 timestamp
**Priority**: low | medium | high | critical
**Status**: pending | resolved
**Area**: frontend | backend | infra | tests | docs | config

### Summary
一句话说明。

### Error
经过脱敏的最小必要错误片段。

### Context
尝试了什么、发生在哪里。

### Suggested Fix
已验证或待验证的下一步。

### Metadata
- Reproducible: yes | no | unknown
- Related Files: 相关路径

---
```

如果记录的是纠正后的方法而不是操作失败，使用 `LRN-...` ID，并把 `Error` 改为 `Details`。

## 用户纠正 Claude 时

当纠正内容可能再次有用时，把它记录为经验，并明确：

- 第一次做法错在哪里；
- 已验证的正确做法是什么；
- 该做法适用于什么情况，不适用于什么情况。

不要把一次性偏好或未经验证的猜测写成通用规则。

## 提升反复出现的经验

同一经验跨任务重复出现，或已成为稳定的项目级约定时，可在任务范围允许的情况下提炼到 `CLAUDE.md` 或其他项目指令文件。保留原始记录并标记为已提升；用简短的预防规则代替冗长的事故报告。

## 隐私与质量

- 绝不保存 API Key、密码、Token、私人用户数据或完整噪声日志。
- 对敏感值脱敏，只保留识别问题所需的最小错误片段。
- 记录已验证且可复用的知识，不要记录每一个瞬时失败。
- 如果错误由外部状态造成，说明上下文，避免把经验错误地应用到所有情况。
- 任务结束时，解决或链接本次新增的记忆条目。

## 会话开始检查

自动检查会话记忆时，使用随 Skill 提供的 `scripts/session-start-check.js`。它会读取项目级和全局级记忆，并向 Claude 输出一段精简上下文。仓库 README 提供了可直接复制的 `SessionStart` Hook 配置。Hook 应保持快速且只读；详细搜索和写入由本 Skill 的工作流程完成。

## 手动调用

当用户要求记住修复、检查过去的错误或避免重复问题时，直接使用本 Skill，并说明更新了哪个记忆文件。



## CLI 与相关性检索

无第三方依赖的 CLI 位于 `scripts/error-memory.js`：

```text
node scripts/error-memory.js search "关键词"
node scripts/error-memory.js validate
node scripts/error-memory.js record --title "..." --summary "..."
node scripts/error-memory.js resolve ERR-YYYYMMDD-XXX
```

记录可以填写 `Tags`、`Files`、`Tools` 和 `Environment`。检索会结合完整文本、标题、元数据、状态、优先级、项目范围和时间进行排序。SessionStart Hook 与 CLI 共用同一套解析逻辑；如果 Hook JSON 中包含 `query`、`prompt` 或 `max_items`，也会使用它们。

CLI 会检查必填字段、重复 ID、Priority 和读取错误。创建记录时会在写入前进行基础凭据脱敏，但这只是安全措施，不能替代人工检查；不要主动保存敏感信息。
