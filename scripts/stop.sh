#!/bin/bash
# DataNova 停止脚本
# 用法: ./scripts/stop.sh

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_DIR="$PROJECT_DIR/.pids"
SERVER_PID_FILE="$PID_DIR/server.pid"
WEB_PID_FILE="$PID_DIR/web.pid"

STOPPED=0

# 停止 Server
if [ -f "$SERVER_PID_FILE" ]; then
  SERVER_PID="$(cat "$SERVER_PID_FILE")"
  if kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "🛑 停止 Server (PID: $SERVER_PID)..."
    kill "$SERVER_PID" 2>/dev/null
    # 等待进程退出
    for i in $(seq 1 10); do
      if ! kill -0 "$SERVER_PID" 2>/dev/null; then
        break
      fi
      sleep 0.5
    done
    # 强制杀死
    if kill -0 "$SERVER_PID" 2>/dev/null; then
      echo "   强制停止 Server..."
      kill -9 "$SERVER_PID" 2>/dev/null || true
    fi
    echo "✅ Server 已停止"
    STOPPED=$((STOPPED + 1))
  else
    echo "⚠️  Server 进程不存在 (PID: $SERVER_PID)"
  fi
  rm -f "$SERVER_PID_FILE"
else
  echo "ℹ️  Server 未在运行"
fi

# 停止 Web
if [ -f "$WEB_PID_FILE" ]; then
  WEB_PID="$(cat "$WEB_PID_FILE")"
  if kill -0 "$WEB_PID" 2>/dev/null; then
    echo "🛑 停止 Web (PID: $WEB_PID)..."
    # vite 可能启动子进程，需要杀死进程组
    kill -- -"$WEB_PID" 2>/dev/null || kill "$WEB_PID" 2>/dev/null
    for i in $(seq 1 10); do
      if ! kill -0 "$WEB_PID" 2>/dev/null; then
        break
      fi
      sleep 0.5
    done
    if kill -0 "$WEB_PID" 2>/dev/null; then
      echo "   强制停止 Web..."
      kill -9 "$WEB_PID" 2>/dev/null || true
    fi
    echo "✅ Web 已停止"
    STOPPED=$((STOPPED + 1))
  else
    echo "⚠️  Web 进程不存在 (PID: $WEB_PID)"
  fi
  rm -f "$WEB_PID_FILE"
else
  echo "ℹ️  Web 未在运行"
fi

# 清理残留进程（兜底）
REMAINING_SERVER=$(lsof -ti:3000 2>/dev/null || true)
REMAINING_WEB=$(lsof -ti:5173 2>/dev/null || true)

if [ -n "$REMAINING_SERVER" ]; then
  echo "🧹 清理残留 Server 进程 (port 3000)..."
  echo "$REMAINING_SERVER" | xargs kill 2>/dev/null || true
  STOPPED=$((STOPPED + 1))
fi

if [ -n "$REMAINING_WEB" ]; then
  echo "🧹 清理残留 Web 进程 (port 5173)..."
  echo "$REMAINING_WEB" | xargs kill 2>/dev/null || true
  STOPPED=$((STOPPED + 1))
fi

# 清理 PID 目录
if [ -d "$PID_DIR" ] && [ -z "$(ls -A "$PID_DIR")" ]; then
  rmdir "$PID_DIR"
fi

if [ $STOPPED -gt 0 ]; then
  echo ""
  echo "✅ DataNova 已停止 ($STOPPED 个进程)"
else
  echo ""
  echo "ℹ️  没有运行中的 DataNova 进程"
fi
