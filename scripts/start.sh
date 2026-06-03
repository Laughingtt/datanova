#!/bin/bash
# DataNova 启动脚本
# 用法: ./scripts/start.sh [env_file]

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

# 加载环境变量
ENV_FILE="${1:-.env}"
if [ -f "$ENV_FILE" ]; then
  echo "📋 加载环境变量: $ENV_FILE"
  set -a
  source "$ENV_FILE"
  set +a
else
  echo "⚠️  未找到 $ENV_FILE，使用默认配置"
fi

# 检查必需环境变量
if [ -z "$DATANOVA_ENCRYPTION_KEY" ]; then
  echo "🔑 生成默认加密密钥..."
  export DATANOVA_ENCRYPTION_KEY="datanova-default-key-32b!"
  echo "   DATANOVA_ENCRYPTION_KEY=$DATANOVA_ENCRYPTION_KEY"
fi

if [ -z "$OPENAI_API_KEY" ] && [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "⚠️  未设置 LLM API Key，请设置 OPENAI_API_KEY 或 ANTHROPIC_API_KEY"
fi

# 创建数据目录
export DATANOVA_DIR="${DATANOVA_DIR:-$PROJECT_DIR/data}"
mkdir -p "$DATANOVA_DIR/skills" "$DATANOVA_DIR/annotations" "$DATANOVA_DIR/sessions"

# 记录 PID 文件
PID_DIR="$PROJECT_DIR/.pids"
mkdir -p "$PID_DIR"
SERVER_PID_FILE="$PID_DIR/server.pid"
WEB_PID_FILE="$PID_DIR/web.pid"

# 检查是否已在运行
if [ -f "$SERVER_PID_FILE" ] && kill -0 "$(cat "$SERVER_PID_FILE")" 2>/dev/null; then
  echo "⚠️  Server 已在运行 (PID: $(cat "$SERVER_PID_FILE"))"
  echo "   如需重启，请先运行 ./scripts/stop.sh"
  exit 1
fi

# 检查依赖
if [ ! -d "node_modules" ]; then
  echo "📦 安装依赖..."
  npm install
fi

# 启动 Server
echo "🚀 启动 DataNova Server..."
PORT="${PORT:-3000}"
cd "$PROJECT_DIR/packages/server"
npx tsx src/index.ts &
SERVER_PID=$!
echo "$SERVER_PID" > "$SERVER_PID_FILE"
cd "$PROJECT_DIR"

# 等待 Server 就绪
echo "⏳ 等待 Server 就绪..."
for i in $(seq 1 30); do
  if curl -s "http://localhost:$PORT/api/health" > /dev/null 2>&1; then
    echo "✅ Server 就绪 (http://localhost:$PORT)"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "❌ Server 启动超时"
    kill "$SERVER_PID" 2>/dev/null
    rm -f "$SERVER_PID_FILE"
    exit 1
  fi
  sleep 1
done

# 启动 Web
echo "🎨 启动 DataNova Web..."
cd "$PROJECT_DIR/packages/web"
npx vite --host &
WEB_PID=$!
echo "$WEB_PID" > "$WEB_PID_FILE"
cd "$PROJECT_DIR"

echo ""
echo "═══════════════════════════════════════"
echo "  DataNova 已启动!"
echo "═══════════════════════════════════════"
echo "  🌐 Web:    http://localhost:5173"
echo "  🔧 API:    http://localhost:$PORT"
echo "  📊 Health: http://localhost:$PORT/api/health"
echo ""
echo "  Server PID: $SERVER_PID"
echo "  Web PID:    $WEB_PID"
echo ""
echo "  停止: ./scripts/stop.sh"
echo "═══════════════════════════════════════"
