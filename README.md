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

## 会话开始自动检查

Claude Code 的 Skill 本身只负责提供规则，不会自动修改你的设置。安装后把下面配置合并到项目的 `.claude/settings.json`，即可在新会话、恢复会话、`/clear` 和压缩上下文后自动检查项目级与全局级记忆：

    {
      "hooks": {
        "SessionStart": [
          {
            "matcher": "startup|resume|clear|compact",
            "hooks": [
              {
                "type": "command",
                "command": "node \"$CLAUDE_PROJECT_DIR/.claude/skills/error-memory/scripts/session-start-check.js\""
              }
            ]
          }
        ]
      }
    }

如果 `settings.json` 已经有其他配置，只合并 `hooks.SessionStart`，不要覆盖原有设置。对应的完整片段也放在 `examples/settings.project.json`。

## 全局记忆

默认读取：

- 项目级：当前项目的 `.learnings/`
- 全局级：`~/.learnings/`；Windows 为 `%USERPROFILE%\\.learnings\\`

如需指定其他全局目录，设置环境变量 `CLAUDE_ERROR_MEMORY_DIR`。项目记忆优先于全局记忆；系统工具、网络、依赖和认证等跨项目问题适合记录在全局目录。

## 中文版

`SKILL.zh-CN.md` 是方便中文用户维护的完整翻译版。Claude Code 默认加载 `SKILL.md`；中文版可作为人工维护和审阅参考。

