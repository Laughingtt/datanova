#!/usr/bin/env bash
# Bring up a local MySQL 8 container with the DataNova demo dataset.
#
# Usage:
#   ./docs/demo-data/load.sh                  # fresh container on :3306
#   ./docs/demo-data/load.sh --port 3307      # custom port
#   ./docs/demo-data/load.sh --reset          # kill+recreate existing
#
# After it finishes, configure DataNova with:
#   host: 127.0.0.1
#   port: <the chosen port, default 3306>
#   user: root
#   password: root
#   database: datanova_demo

set -euo pipefail

PORT=3306
RESET=0
CONTAINER_NAME="datanova-demo-mysql"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --reset) RESET=1; shift ;;
    --container-name) CONTAINER_NAME="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,18p' "$0"
      exit 0
      ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

if [[ "$RESET" -eq 1 ]]; then
  echo "🗑  removing existing container $CONTAINER_NAME"
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
fi

if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "✅ container $CONTAINER_NAME already exists (use --reset to recreate)"
  exit 0
fi

echo "🐳 starting MySQL 8 on port $PORT..."
docker run -d \
  --name "$CONTAINER_NAME" \
  -e MYSQL_ROOT_PASSWORD=root \
  -p "${PORT}:3306" \
  mysql:8 \
  --character-set-server=utf8mb4 \
  --collation-server=utf8mb4_unicode_ci >/dev/null

echo "⏳ waiting for MySQL to be ready..."
for i in $(seq 1 30); do
  if docker exec "$CONTAINER_NAME" mysqladmin ping -h localhost -uroot -proot --silent 2>/dev/null; then
    echo "✅ MySQL is up"
    break
  fi
  sleep 2
done

if ! docker exec "$CONTAINER_NAME" mysqladmin ping -h localhost -uroot -proot --silent 2>/dev/null; then
  echo "❌ MySQL did not become ready in time"
  exit 1
fi

echo "📦 loading demo dataset..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
docker exec -i "$CONTAINER_NAME" mysql -uroot -proot < "$SCRIPT_DIR/employees-init.sql"

echo ""
echo "🎉 Done. Configure DataNova with:"
echo "   host=127.0.0.1   port=$PORT   user=root   password=root   database=datanova_demo"
echo ""
echo "Try this query:"
echo "   上个月销售额是多少？"