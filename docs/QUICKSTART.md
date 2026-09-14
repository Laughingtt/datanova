# DataNova Quick Start

> **Goal:** go from `git clone` to your first natural-language query in **under 5 minutes**.
>
> If anything here breaks, please [open an issue](https://github.com/your-org/datanova/issues/new?template=bug.yml).

---

## 0. Prerequisites

| What | Version | How to check |
|---|---|---|
| Node.js | ≥ 20 | `node --version` |
| npm | ≥ 10 | `npm --version` |
| Docker (optional) | any recent | `docker --version` |
| MySQL | 5.7+ / 8.x | only if you have one already |

You also need **an LLM API key**. Anthropic (Claude) is recommended. OpenAI / DeepSeek / Ollama also work.

---

## 1. Bring up MySQL

If you already have a MySQL you can point to, skip ahead.

### Option A: Docker (recommended)

```bash
docker run -d --name datanova-mysql \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=datanova_dev \
  -p 3306:3306 \
  mysql:8
```

Wait ~10s for MySQL to initialize:

```bash
until docker exec datanova-mysql mysqladmin ping -h localhost -uroot -proot --silent; do sleep 2; done
echo "MySQL is up"
```

### Option B: Load the demo dataset

The repo ships with a tiny `employees`-style dataset so you can try metric creation immediately:

```bash
docker exec -i datanova-mysql mysql -uroot -proot datanova_dev < docs/demo-data/employees-init.sql
```

You should now have tables `orders`, `customers`, `products`.

---

## 2. Clone and install

```bash
git clone https://github.com/your-org/datanova.git
cd datanova
npm install
```

Takes ~1 minute. (`nodejieba` will compile native bindings on first install.)

---

## 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

```bash
ANTHROPIC_API_KEY=sk-ant-...your-key...
DATANOVA_ENCRYPTION_KEY=any-32-byte-string-exactly-32
```

> 💡 `DATANOVA_ENCRYPTION_KEY` is used to encrypt datasource passwords at rest.
> It must be exactly 32 bytes. In production, generate one with
> `openssl rand -base64 32`.

Other useful knobs (all optional):

```bash
PORT=3000                  # backend port (default 3000)
DATANOVA_DIR=./data        # where SQLite + SKILL.md files live
DATANOVA_PROVIDER=anthropic # default LLM provider
DATANOVA_MODEL=claude-sonnet-4-20250514
```

---

## 4. Start the dev servers

In **two terminals**:

```bash
# Terminal 1 — backend (Hono + Node, port 3000)
npm run dev:server
```

```bash
# Terminal 2 — frontend (Vite, port 5173, proxies /api → 3000)
npm run dev:web
```

You should see:

```
# server terminal
DataNova server listening on http://localhost:3000

# web terminal
  VITE v6.x.x  ready in xxx ms
  ➜  Local:   http://localhost:5173/
```

---

## 5. Open the app

Visit **http://localhost:5173**.

The **Onboarding wizard** will walk you through:

1. Create your first datasource
2. Test the connection
3. Discover schemas (calls `discover_schema` for you)

Fill in:

| Field | Value (if you used Option A above) |
|---|---|
| Name | `Local MySQL` |
| Host | `localhost` |
| Port | `3306` |
| Database | `datanova_dev` |
| Username | `root` |
| Password | `root` |

Click **Test connection** → ✅ → **Save**.

---

## 6. Ask your first question

In the chat box at the bottom, type:

```
上个月销售额是多少？
```

(or, in English: `What was last month's revenue?`)

You should see, in order:

1. **Thinking** — the agent reasoning about which tool to call
2. **Tool: `discover_schema`** — table/column info it pulled from MySQL
3. **Tool: `execute_sql`** — the generated SQL + a result table
4. **A summary** in Chinese with key figures

If you loaded the demo dataset, you should get real numbers.

---

## 7. Create your first metric

Switch to the **📊 指标开发** channel tab (top-right of chat). Type:

```
帮我开发一个"月度营收"指标
```

The metric-dev agent will:

1. Check for name conflicts (`check_metric_conflict`)
2. Discover the schema
3. Generate SQL and EXPLAIN-validate it
4. Run a `LIMIT 10` sample
5. Show a **confirmation card** → click **确认保存**
6. Create a `draft` metric in the `semantic_metrics` table

Go to **指标管理** in the sidebar to review and publish it.

---

## 8. (Optional) Schedule a query

1. **自助分析** in the sidebar → **新建定时查询**
2. Pick a metric or paste your own SQL
3. Set a cron schedule (e.g. `0 9 * * *` for every morning at 9)
4. (P1, coming soon) configure Webhook / Email / IM notification

---

## 9. Run the tests

```bash
# Unit tests (Vitest, ~30s)
npm run --workspace=packages/server test

# End-to-end (Playwright, requires the dev servers to be NOT running)
npx playwright test
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `nodejieba` install fails | Missing C++ toolchain | On macOS: `xcode-select --install`. On Ubuntu: `sudo apt install build-essential python3`. |
| `Error: connect ECONNREFUSED 127.0.0.1:3306` | MySQL not up | `docker ps` — see status. |
| `AI service call failed` | Missing/invalid `ANTHROPIC_API_KEY` | Re-check `.env`. Test with `curl https://api.anthropic.com/v1/messages`. |
| `Invalid key length` for AES-256-GCM | `DATANOVA_ENCRYPTION_KEY` not 32 bytes | Use `openssl rand -base64 32` or any 32-char ASCII. |
| Agent produces wrong table name | Schema cache stale | Switch datasource + back, or restart the server. |
| Port 3000 already in use | Another service | Set `PORT=3001` in `.env`. |

---

## Next steps

- 📖 [Architecture overview](01-architecture-overview.md)
- 🧠 [Agent internals](02-pi-agent-internals.md)
- 🛠️ [Tools & data flow](03-tools-and-data.md)
- 🌐 [REST + WebSocket protocol](06-route-registration.md)

Or jump to **[CONTRIBUTING.md](../CONTRIBUTING.md)** to send your first PR.