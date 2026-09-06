# Error Memory Skill

让 Claude 在遇到错误、被纠正或找到可靠修复方案后，把可复用经验保存到项目的 `.learnings/` 目录；下次遇到类似任务时先查阅这些记录，减少重复踩坑。

## 安装到 Claude Code

把本目录复制到项目的：

```text
.claude/skills/error-memory/
```

也可以复制到个人 Skill 目录，让所有项目都能使用：

```text
%USERPROFILE%\\.claude\\skills\\error-memory\\
```

在 macOS 或 Linux 上对应 `~/.claude/skills/error-memory/`。

安装后可直接输入：

```text
/error-memory
```

或者在描述“记住这个错误”“检查以前的解决方案”“不要再重复这个问题”时让 Claude 自动调用。

## 记忆保存在哪里

- `.learnings/ERRORS.md`：命令、工具、环境等操作失败
- `.learnings/LEARNINGS.md`：纠正过的方法、项目约定和可复用经验

Skill 不会修改 Claude 的模型参数，也不能保证错误永远不再发生；它通过项目文件提供跨会话的持久化记忆。

## 安全原则

Skill 会要求 Claude 脱敏记录错误，不保存密码、Token、API Key、隐私数据或完整日志；只有经过验证的修复方案才会标记为已解决。

