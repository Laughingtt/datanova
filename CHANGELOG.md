# Changelog

All notable changes to DataNova will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned (tracked in `docs/superpowers/plans/2026-08-25-open-source-enterprise-readiness.md`)

#### P1 — Enterprise capability
- **feat**: PostgreSQL driver via `DatabaseDriver` interface (P1-1)
- **feat**: Data-source JSON import/export (P1-2)
- **feat**: SQL result export to CSV / Excel / JSON (P1-3)
- **feat**: Webhook-out notifications (P1-6)
- **feat**: SMTP email notifications (P1-7)
- **feat**: IM bot templates (Feishu / WeCom / DingTalk / Slack) (P1-8)
- **feat**: Ollama / local-model provider registration (P1-9)
- **feat**: Domestic LLM providers (Qwen / Doubao / GLM / Wenxin / Hunyuan) (P1-10)
- **feat**: Structured logging via pino (P1-11)
- **feat**: Prometheus `/metrics` endpoint (P1-12)
- **feat**: MCP server exposing `execute_sql` and `discover_schema` (P1-16)
- **feat**: API-token auth for machine-to-machine calls (P1-17)
- **feat**: Query-result cache (LRU + TTL) (P1-19)
- **feat**: Agent-session persistence to SQLite (P1-20)
- **feat**: Exponential-backoff retry for LLM calls (P1-21)

#### P2 — Polish
- **feat**: Full frontend i18n via `react-i18next` (P2-1)
- **feat**: Plugin loader for custom tools / drivers / notifications (P2-2)
- **feat**: Standalone CLI package `@datanova/cli` (P2-3)
- **feat**: Semantic-layer lineage / impact analysis (P2-4)
- **feat**: Metric template gallery (DAU / MAU / retention / funnel) (P2-5)
- **feat**: Dark mode + mobile breakpoints (P2-6)
- **feat**: Dashboard embed iframe mode (P2-7)
- **feat**: OpenTelemetry tracing (P2-8)
- **feat**: Slack / Discord report bot (P2-9)
- **chore**: RFC process (`docs/rfcs/`) (P2-10)
- **chore**: Public Marketplace repo (P2-11)
- **docs**: 5-minute video walkthrough (P2-12)

---

## [1.1.0] — 2026-08-25

### Added — Open-source hygiene (Phase P0)

#### Governance
- `LICENSE` — Apache-2.0 license text
- `README.md` — English top-level README with quickstart, architecture and roadmap
- `README.zh-CN.md` — Renamed original Chinese README (full reference)
- `CONTRIBUTING.md` — Bug reports, feature requests, dev setup, PR workflow
- `CODE_OF_CONDUCT.md` — Contributor Covenant v2.1
- `SECURITY.md` — Vulnerability disclosure policy and security design notes
- `CHANGELOG.md` — This file

#### GitHub templates
- `.github/ISSUE_TEMPLATE/bug.yml` — Structured bug report
- `.github/ISSUE_TEMPLATE/feature.yml` — Feature request with impact checklist
- `.github/ISSUE_TEMPLATE/question.yml` — Question template with self-service pointers
- `.github/PULL_REQUEST_TEMPLATE.md` — PR description with type-of-change checklist

#### Tooling
- `docs/QUICKSTART.md` — 5-minute Quick Start with Docker MySQL setup
- `docs/demo-data/employees-init.sql` — Demo dataset
- `docs/demo-data/load.sh` — One-command MySQL container bootstrap
- `docs/i18n-strategy.md` — i18n roadmap
- `.github/workflows/ci.yml` — GitHub Actions: lint → unit → e2e on PR and push
- `.eslintrc.cjs` — ESLint config (TypeScript recommended)
- `.eslintignore`
- `.prettierrc` — Prettier config
- `package.json` scripts: `lint`

---

## [1.0.0] — 2026-08-24

The first tagged release. Brings together ~6 months of agent-framework, semantic-layer and UI work.

### Highlights
- **Multi-Agent framework** — `query` (data exploration), `metric_dev` (governed-metric authoring) and `chain_auditor` (admin agent that reconstructs decision chains from `agent_traces`).
- **Semantic layer** — Metrics / dimensions / models with full lifecycle (`draft → published → deprecated`), AI suggestion, batch import, and EXPLAIN validation.
- **Query skills** — `qs-*` SKILL.md playbooks loaded per-datasource; AI single + batch generation.
- **SQL safety pipeline** — Whitelist (SELECT) → schema cache (table-name block + column-name warn) → 30s timeout → 1000-row limit → automatic history.
- **Schema discovery & annotation** — INFORMATION_SCHEMA-based discovery, AI annotation with sample data, value-domain discovery.
- **Charts** — Auto-inferred type (KPI / pie / scatter / line / area / bar) via `chart-inference.ts`, Recharts renderers.
- **Scheduled queries + alerts** — `node-cron`, four alert conditions (`above`, `below`, `change_above`, `change_below`).
- **Observability** — `agent_traces` table with per-tool rationale (800 chars per tool) + Chain Auditor Agent.
- **Insights BI** — Stats, top queries, bookmarks, dashboard.
- **Data dictionary** — Cross-datasource search with table-relationship diagram.
- **Onboarding wizard** — First-run flow.
- **Security** — AES-256-GCM credential encryption.
- **Tests** — 10 unit tests (Vitest) + 17 end-to-end tests (Playwright).

### Known limitations (resolved in roadmap)
- Single database type (MySQL only) — addressed in v2.0 P1-1 (PostgreSQL driver).
- Chinese-only UI strings — addressed in v2.0 P2-1 (`react-i18next`).
- In-memory agent sessions lost on restart — addressed in v2.0 P1-20.
- No public Webhook / email delivery for alerts — addressed in v2.0 P1-6/7.
- Limited test coverage — addressed in v2.0 P1-14.

---

## Versioning notes

- **Major** (X.0.0) — breaking API changes (REST, WebSocket, semantic-layer schema)
- **Minor** (0.X.0) — new features, backward-compatible
- **Patch** (0.0.X) — bug fixes, doc-only

Pre-1.0 versions (0.x.y) follow the same scheme but may include breaking changes
in minor releases.

[Unreleased]: https://github.com/your-org/datanova/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/your-org/datanova/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/your-org/datanova/releases/tag/v1.0.0