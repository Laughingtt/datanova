#!/usr/bin/env bash
# post-commit-doc-update.sh
# Claude Code PostToolUse hook: detects git commit and injects a prompt
# for Claude to update CLAUDE.md and README.md with current project state.

set -euo pipefail

# Read JSON context from stdin
input=$(cat)

# Extract the Bash command from tool_input
cmd=$(echo "$input" | jq -r '.tool_input.command // ""')

# Check if this is a git commit command
if echo "$cmd" | grep -qE 'git\s+commit'; then
  # Extract commit message if available (grep || true to avoid pipefail exit on no match)
  commit_msg=$(echo "$cmd" | { grep -oP "(?<=-m\s['\"])[^'\"]*" || true; } | head -1)
  if [ -z "$commit_msg" ]; then
    commit_msg=$(echo "$cmd" | { grep -oP "(?<=-m\s)[^ ]+" || true; } | head -1)
  fi

  # Build the prompt message
  msg="📝 刚完成了一次 git commit"
  if [ -n "$commit_msg" ]; then
    msg="$msg: $commit_msg"
  fi

  msg="${msg}

请扫描项目当前状态，更新 CLAUDE.md 和 README.md 中的动态内容，确保文档与代码保持同步。重点关注以下区域：

**CLAUDE.md:**
- Key Files 表（检查是否有新增/删除/重命名的关键文件）
- Agent Tools 表（检查是否有新增/删除的 agent tool）
- Route Registration Pattern（检查路由注册模式是否有变化）
- Code Patterns（检查代码模式是否有变化）
- Important Notes（检查是否有新的重要注意事项）

**README.md:**
- 项目结构树（packages/server/src/ 和 packages/web/src/ 下的文件树）
- REST API 表（检查是否有新增/删除/修改的 API 端点）
- Agent 工具表（检查工具列表是否完整）
- 数据存储表（检查存储方式是否有变化）
- 关键设计决策（检查是否有新的设计决策）

只更新有变化的部分，不要重写未变化的内容。"

  # Output JSON with the injected message
  jq -n --arg msg "$msg" '{continue: true, message: $msg}'
else
  # Not a git commit — pass through silently
  echo '{"continue":true}'
fi
