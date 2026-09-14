# DataNova

[English](README.md) | [简体中文](README.zh-CN.md)

> **AI-powered SQL data analyst for the enterprise.**
> Multi-Agent, schema-aware, governed by a semantic layer — turn natural language questions into auditable SQL.

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-22+-green.svg)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Code of Conduct](https://img.shields.io/badge/Contributor%20Covenant-2.1-ff69b4.svg)](CODE_OF_CONDUCT.md)

---

## What is DataNova?

DataNova is an **open-source AI data analyst** that sits on top of your existing database. Users ask questions in natural language (Chinese today, English via the API), and a multi-agent system:

1. Discovers your database schema automatically
2. Matches the question against your curated **semantic layer** (metrics, dimensions, models) and **query skills** (battle-tested query playbooks)
3. Generates and executes SQL with safety guards (whitelist + schema cache + timeout + row limit)
4. Returns a table or chart, plus a written summary in your language

Unlike "just chat with your DB" toys, DataNova is built around **deterministic SQL generation** for known metrics and **agentic exploration** for new questions — every step is recorded in an auditable decision chain.

---

## Why DataNova?

| | |
|---|---|
| 🎯 **Multi-Agent by design** | A `query` Agent for exploration, a `metric_dev` Agent for building governed metrics, a `chain_auditor` Agent for admins reviewing what the others did. |
| 🧱 **Semantic layer first** | Curated metrics return deterministic SQL — no hallucinated aggregations. Unknown questions fall back to agentic SQL generation. |
| 🛠️ **Query skills** | Battle-tested query playbooks (like `qs-billing-detail`) that the agent reads on demand when matching keywords. |
| 🔒 **SQL safety pipeline** | Whitelist (SELECT only) → schema cache (table/column check + Levenshtein suggestions) → 30s timeout → 1000-row limit → automatic history. |
| 🔍 **Full decision-chain audit** | Every agent run is persisted with per-tool rationale — admins can reconstruct *why* a SQL was generated. |
| 📊 **BI-ready output** | Auto-inferred charts (KPI / pie / scatter / line / area / bar), TanStack tables, scheduled queries with alerts. |
| 🌐 **Self-hosted, single binary deploy** | One Node.js process + one SQLite file. (Multi-user deployment is on the roadmap.) |

---

## Quick Start

> Want the 5-minute walkthrough? See [docs/QUICKSTART.md](docs/QUICKSTART.md).

```bash
# 1. Requirements
node --version    # >= 20

# 2. Clone & install
git clone https://github.com/your-org/datanova.git
cd datanova
npm install

# 3. Configure
cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY (or any other supported provider — see below)

# 4. Run (two terminals)
npm run dev:server   # Backend on http://localhost:3000
npm run dev:web      # Frontend on http://localhost:5173
```

Open `http://localhost:5173`, click **Get Started**, add a MySQL datasource, and ask your first question.

---

## Supported Stacks

### Databases (out of the box)
- MySQL 5.7 / 8.x

### Databases (in development — see [Roadmap](#roadmap))
- PostgreSQL
- ClickHouse
- SQL Server / Oracle / SQLite

### LLM providers
- **Anthropic** (Claude 3.5 Sonnet / Haiku / Opus)
- **OpenAI** (GPT-4o / o1)
- **DeepSeek** (used for direct fetches — semantic-layer recommendation, query-skill generation, schema annotation)
- **Ollama / OpenAI-compatible endpoints** (any local model)

---

## Architecture (30-second tour)

```
┌──────────────────────────────────────────────────────────────────┐
│ packages/web — React 19 + Vite 6 + Tailwind 3                    │
│   10 views (Dashboard, Chat, Metrics, Traces, Insights, ...)     │
└─────────────────────┬────────────────────────────────────────────┘
                      │  WebSocket (chat) + REST (CRUD)
┌─────────────────────▼────────────────────────────────────────────┐
│ packages/server — Hono + Node.js ESM                              │
│   • AgentRegistry: query, metric_dev, chain_auditor              │
│   • 11 agent tools (discover_schema, execute_sql, ...)            │
│   • SQL safety pipeline + history                                │
│   • Multi-database driver (MySQL today, pluggable)               │
│   • Cron scheduler + alert engine                                 │
└─────────────────────┬────────────────────────────────────────────┘
                      │  mysql2 (today) / pg / ch / ...
┌─────────────────────▼────────────────────────────────────────────┐
│ Your database — MySQL / Postgres / ClickHouse                     │
└──────────────────────────────────────────────────────────────────┘
```

For the deep-dive (every tool, every event, every protocol field), see [docs/](docs/).

---

## Features at a Glance

### Query Agent (`query`)
- Natural-language → SQL with semantic-layer priority
- Auto-inferred charts (KPI / line / bar / pie / scatter / area)
- Schema discovery + AI annotation
- Few-shot examples from history (jieba tokenized matching)
- Query bookmarks
- Result export (CSV / Excel / JSON — *in development*)

### Metric Dev Agent (`metric_dev`)
- Chat-driven metric & dimension creation
- EXPLAIN validation + sample-row test
- Conflict check (same name / same display name)
- Draft → publish workflow (all AI-generated metrics start as `draft`)

### Observability
- `agent_traces` table with per-tool rationale
- **链路审计 / Chain audit** button on every trace
- Insights BI dashboard (query stats, top queries, bookmarks)

### Scheduled Queries
- Cron-based execution
- 4 alert conditions (`above`, `below`, `change_above`, `change_below`)
- Notification delivery via Webhook / Email / Feishu / WeCom / DingTalk / Slack (*in development*)

---

## Documentation

| Topic | Link |
|---|---|
| 5-minute Quick Start | [docs/QUICKSTART.md](docs/QUICKSTART.md) |
| Architecture overview | [docs/01-architecture-overview.md](docs/01-architecture-overview.md) |
| Agent internals | [docs/02-pi-agent-internals.md](docs/02-pi-agent-internals.md) |
| Tools & data flow | [docs/03-tools-and-data.md](docs/03-tools-and-data.md) |
| Agent integration | [docs/04-agent-integration.md](docs/04-agent-integration.md) |
| Types & data model | [docs/05-types-and-data-model.md](docs/05-types-and-data-model.md) |
| REST API + WebSocket | [docs/06-route-registration.md](docs/06-route-registration.md) |
| Frontend components | [docs/07-frontend-components.md](docs/07-frontend-components.md) |
| Design decisions | [docs/DESIGN.md](docs/DESIGN.md) |
| 中文完整文档 | [README.zh-CN.md](README.zh-CN.md) |

---

## Contributing

We welcome issues and PRs. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first. Major changes should go through an [RFC](docs/rfcs/) (coming soon).

- 🐛 **Bug reports** → use the [bug template](.github/ISSUE_TEMPLATE/bug.yml)
- 💡 **Feature requests** → use the [feature template](.github/ISSUE_TEMPLATE/feature.yml)
- ❓ **Questions** → use the [question template](.github/ISSUE_TEMPLATE/question.yml)
- 🔒 **Security issues** → see [SECURITY.md](SECURITY.md), please **do not** file a public issue

---

## Roadmap

We're working toward the v2.0 "enterprise-ready" milestone. See [docs/superpowers/plans/2026-08-25-open-source-enterprise-readiness.md](docs/superpowers/plans/2026-08-25-open-source-enterprise-readiness.md) for the full plan.

| Phase | Focus | Status |
|---|---|---|
| **P0 — Open-source hygiene** | LICENSE, English README, CI, ESLint, demo data | ✅ done in v1.1 |
| **P1 — Enterprise capability** | PostgreSQL driver, export, webhooks, observability, MCP server | 🚧 in progress |
| **P2 — Polish** | Full i18n, plugin system, CLI, dashboard embed, dark mode | 📋 planned |

> Note: multi-user / multi-tenant / production deployment features are explicitly out of scope for v2.0 (per maintainer direction). Tracking those in [issue #TBD](https://github.com/your-org/datanova/issues).

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React 19, Vite 6, TailwindCSS 3, Zustand 5, TanStack Table, Recharts |
| Backend | Hono, `@hono/node-server`, `@hono/node-ws`, ESM |
| Agent | `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai` |
| AI helper | DeepSeek API (direct fetch for semantic recommendations, skill generation, SQL generation) |
| Chinese NLP | `nodejieba` (jieba segmentation for keyword matching) |
| DB drivers | `mysql2` (today), `pg` & `@clickhouse/client` (P1) |
| Metadata DB | `better-sqlite3` (WAL) |
| Encryption | AES-256-GCM (datasource passwords) |
| Scheduler | `node-cron` |
| Tests | Vitest (unit), Playwright (E2E) |

---

## License

Apache-2.0 — see [LICENSE](LICENSE).

Copyright 2026 DataNova Authors.

---

## Acknowledgements

Built on top of [pi-agent-core](https://github.com/earendil-works/pi-agent-core) and the broader Agent Harness ecosystem.