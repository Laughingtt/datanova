# DataNova

> **面向企业的 AI 驱动 SQL 数据分析师**
> 多 Agent 架构、Schema 感知、由语义层治理 —— 把自然语言问题变成可审计的 SQL。

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-22+-green.svg)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Code of Conduct](https://img.shields.io/badge/Contributor%20Covenant-2.1-ff69b4.svg)](CODE_OF_CONDUCT.md)

---

## 什么是 DataNova？

DataNova 是一款**开源的 AI 数据分析师**，构建在你现有的数据库之上。用户用自然语言（当前为简体中文，API 层支持英文）提问，多 Agent 系统会：

1. 自动发现数据库 Schema
2. 在你维护的**语义层**（指标、维度、模型）和**查询技能**（经过实战检验的查询剧本）中匹配问题
3. 在安全护栏下生成并执行 SQL（白名单 + Schema 缓存 + 超时 + 行数限制）
4. 返回表格或图表，并以你的语言给出文字总结

与"只会聊天查数据库"的玩具不同，DataNova 以**已知指标的确定性 SQL 生成**为核心，对未知问题采用**智能体 SQL 探索**作为补充，每一步都记录在可审计的决策链中。

---

## 为什么选择 DataNova？

| 特性 | 说明 |
|---|---|
| 🎯 **多 Agent 架构** | `query` Agent 负责问答探索，`metric_dev` Agent 负责构建治理指标，`chain_auditor` Agent 供管理员审计前两者行为 |
| 🧱 **语义层优先** | 已维护的指标返回确定性 SQL，杜绝聚合幻觉；未知问题回退到 Agentic SQL 生成 |
| 🛠️ **查询技能（Query Skills）** | 经过实战检验的查询剧本（如 `qs-billing-detail`），Agent 按需匹配关键词加载 |
| 🔒 **SQL 安全流水线** | 白名单（仅 SELECT）→ Schema 缓存（表/列校验 + Levenshtein 建议）→ 30s 超时 → 1000 行限制 → 自动写入执行历史 |
| 🔍 **完整决策链审计** | 每次 Agent 运行均持久化，按工具记录决策理由；管理员可还原"为什么生成这条 SQL" |
| 📊 **BI 级输出** | 自动推断图表（KPI / 饼图 / 散点 / 折线 / 区域 / 柱状）、TanStack 数据表、定时查询与告警 |
| 🌐 **自托管，单二进制部署** | 一个 Node.js 进程 + 一个 SQLite 文件（多用户部署已列入路线图） |

---

## 快速开始

```bash
# 1. 环境要求
node --version    # >= 20

# 2. 克隆与安装
git clone https://github.com/your-org/datanova.git
cd datanova
npm install

# 3. 配置
cp .env.example .env
# 编辑 .env，设置 ANTHROPIC_API_KEY（或任意支持的 Provider，见下）

# 4. 启动（两个终端分别执行）
npm run dev:server   # 后端 http://localhost:3000
npm run dev:web      # 前端 http://localhost:5173
```

打开 `http://localhost:5173`，点击「开始使用」，添加 MySQL 数据源，问你的第一个问题。

---

## 支持的技术栈

### 数据库（开箱即用）
- MySQL 5.7 / 8.x

### 数据库（开发中 —— 见[路线图](#路线图)）
- PostgreSQL
- ClickHouse
- SQL Server / Oracle / SQLite

### LLM Provider
- **Anthropic**（Claude 3.5 Sonnet / Haiku / Opus）
- **OpenAI**（GPT-4o / o1）
- **DeepSeek**（用于直接 fetch —— 语义层推荐、查询技能生成、Schema 注解）
- **Ollama / OpenAI 兼容端点**（任意本地模型）

---

## 架构（30 秒速览）

```
┌──────────────────────────────────────────────────────────────────┐
│ packages/web — React 19 + Vite 6 + Tailwind 3                    │
│   10 个视图（Dashboard / Chat / Metrics / Traces / Insights ...）│
└─────────────────────┬────────────────────────────────────────────┘
                      │  WebSocket（聊天）+ REST（CRUD）
┌─────────────────────▼────────────────────────────────────────────┐
│ packages/server — Hono + Node.js ESM                             │
│   • AgentRegistry：query、metric_dev、chain_auditor               │
│   • 11 个 Agent 工具（discover_schema、execute_sql 等）           │
│   • SQL 安全流水线 + 执行历史                                    │
│   • 多数据库驱动（当前 MySQL，可插拔）                           │
│   • Cron 调度器 + 告警引擎                                       │
└─────────────────────┬────────────────────────────────────────────┘
                      │  mysql2（当前）/ pg / ch / ...
┌─────────────────────▼────────────────────────────────────────────┐
│ 你的数据库 — MySQL / Postgres / ClickHouse                        │
└──────────────────────────────────────────────────────────────────┘
```

深入了解（每个工具、每个事件、每个协议字段）请见 [docs/](docs/)。

---

## 功能一览

### Query Agent（`query`）
- 自然语言 → SQL，语义层优先
- 自动推断图表（KPI / 折线 / 柱状 / 饼图 / 散点 / 区域）
- Schema 发现 + AI 注解
- 历史少样本示例（jieba 分词匹配）
- 查询书签
- 结果导出（CSV / Excel / JSON —— 开发中）

### Metric Dev Agent（`metric_dev`）
- 对话式创建指标与维度
- EXPLAIN 验证 + 样本数据测试
- 冲突检查（同名 / 同显示名）
- 草稿 → 发布工作流（所有 AI 生成的指标默认 `draft` 状态）

### 可观测性
- `agent_traces` 表，按工具记录决策理由
- 每次 Trace 上的**链路审计 / Chain audit**按钮
- Insights BI 仪表盘（查询统计、热门查询、书签）

### 定时查询
- 基于 Cron 的执行
- 4 种告警条件（`above` / `below` / `change_above` / `change_below`）
- 通知渠道：Webhook / 邮件 / 飞书 / 企业微信 / 钉钉 / Slack（开发中）

---

## 文档

| 主题 | 链接 |
|---|---|
| 架构总览 | [docs/01-architecture-overview.md](docs/01-architecture-overview.md) |
| Agent 内部机制 | [docs/02-pi-agent-internals.md](docs/02-pi-agent-internals.md) |
| 工具与数据流 | [docs/03-tools-and-data.md](docs/03-tools-and-data.md) |
| Agent 集成 | [docs/04-agent-integration.md](docs/04-agent-integration.md) |
| 类型与数据模型 | [docs/05-types-and-data-model.md](docs/05-types-and-data-model.md) |
| REST API + WebSocket | [docs/06-route-registration.md](docs/06-route-registration.md) |
| 前端组件 | [docs/07-frontend-components.md](docs/07-frontend-components.md) |
| 设计规范 | [docs/DESIGN.md](docs/DESIGN.md) |
| Skills 编写指南 | [docs/skills-guide.md](docs/skills-guide.md) |

---

## 贡献

欢迎提交 Issue 和 PR。请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。重大变更建议先走 RFC 流程（即将上线）。

- 🐛 **Bug 报告** → 使用 [bug 模板](.github/ISSUE_TEMPLATE/bug.yml)
- 💡 **功能请求** → 使用 [feature 模板](.github/ISSUE_TEMPLATE/feature.yml)
- ❓ **问题咨询** → 使用 [question 模板](.github/ISSUE_TEMPLATE/question.yml)
- 🔒 **安全问题** → 见 [SECURITY.md](SECURITY.md)，请**不要**提交公开 Issue

---

## 路线图

我们正朝着 v2.0「企业就绪」里程碑推进，详细计划见 `docs/superpowers/plans/`。

| 阶段 | 重点 | 状态 |
|---|---|---|
| **P0 — 开源规范化** | LICENSE、双语 README、CI、ESLint、演示数据 | ✅ v1.1 已完成 |
| **P1 — 企业能力** | PostgreSQL 驱动、导出、Webhook、可观测性、MCP 服务 | 🚧 进行中 |
| **P2 — 体验打磨** | 完整 i18n、插件系统、CLI、Dashboard 嵌入、暗色模式 | 📋 规划中 |

> 注：多用户 / 多租户 / 生产级部署功能在 v2.0 中明确**不在范围内**（依据维护者决策）。

---

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | React 19、Vite 6、TailwindCSS 3、Zustand 5、TanStack Table、Recharts |
| 后端 | Hono、`@hono/node-server`、`@hono/node-ws`、ESM |
| Agent | `@earendil-works/pi-agent-core`、`@earendil-works/pi-ai` |
| AI 助手 | DeepSeek API（直接 fetch，用于语义推荐、技能生成、SQL 生成） |
| 中文 NLP | `nodejieba`（jieba 分词用于关键词匹配） |
| 数据库驱动 | `mysql2`（当前），`pg` 与 `@clickhouse/client`（P1） |
| 元数据库 | `better-sqlite3`（WAL） |
| 加密 | AES-256-GCM（数据源密码） |
| 调度 | `node-cron` |
| 单元测试 | Vitest |
| 端到端测试 | agent-browser（基于 CDP） |

---

## 许可证

Apache-2.0 —— 见 [LICENSE](LICENSE)。

Copyright 2026 DataNova Authors.

---

## 致谢

基于 [pi-agent-core](https://github.com/earendil-works/pi-agent-core) 及更广泛的 Agent Harness 生态构建。