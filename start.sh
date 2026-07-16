#!/usr/bin/env bash
set -e

# ============================================================
# DataNova — 一键启动前端 + 后端
#   前端: http://localhost:5173
#   后端: http://localhost:3000
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ---------- 1. 清理旧进程 ----------
echo "🧹 清理旧进程..."

kill_port() {
  local port=$1
  local pids
  pids=$(lsof -ti "tcp:$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "   端口 $port 被占用，终止进程: $pids"
    kill -9 $pids 2>/dev/null || true
  fi
}

kill_port 3000
kill_port 5173

# 额外清理可能残留的 tsx watch / vite
pkill -f "tsx watch src/index.ts" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true

sleep 1
echo "   ✅ 清理完成"

# ---------- 2. 安装依赖（如需要） ----------
if [ ! -d "node_modules" ]; then
  echo "📦 安装依赖..."
  npm install
fi

# ---------- 3. 启动后端 ----------
echo ""
echo "🚀 启动后端 (http://localhost:3000)..."
npm run dev:server &
SERVER_PID=$!

# ---------- 4. 启动前端 ----------
echo "🚀 启动前端 (http://localhost:5173)..."
npm run dev:web &
WEB_PID=$!

# ---------- 5. 等待就绪 ----------
echo ""
echo "⏳ 等待服务就绪..."

# 等待后端
for i in $(seq 1 30); do
  if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "   ✅ 后端已就绪"
    break
  fi
  sleep 1
done

# 等待前端
for i in $(seq 1 15); do
  if curl -s http://localhost:5173 > /dev/null 2>&1; then
    echo "   ✅ 前端已就绪"
    break
  fi
  sleep 1
done

# ---------- 6. 打印信息 ----------
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  DataNova 已启动"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  后端 API : http://localhost:3000"
echo "  前端页面 : http://localhost:5173"
echo "  健康检查 : http://localhost:3000/api/health"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "按 Ctrl+C 停止所有服务"

# ---------- 7. 捕获退出信号，清理子进程 ----------
cleanup() {
  echo ""
  echo "🛑 正在停止服务..."
  kill $SERVER_PID 2>/dev/null || true
  kill $WEB_PID 2>/dev/null || true
  wait $SERVER_PID 2>/dev/null || true
  wait $WEB_PID 2>/dev/null || true
  echo "   ✅ 已停止"
  exit 0
}

trap cleanup SIGINT SIGTERM

# 等待任意子进程退出
wait
