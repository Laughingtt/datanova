# Contributing to DataNova

Thanks for your interest in contributing! DataNova is an open-source AI data analyst, and we welcome bug reports, feature requests, documentation improvements, and code contributions.

> 📜 **Code of Conduct** — Everyone who participates is expected to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

---

## How to report a bug

Use the [bug report template](.github/ISSUE_TEMPLATE/bug.yml). Please include:

1. **Environment** — Node version, OS, MySQL version, LLM provider/model
2. **Steps to reproduce** — minimal example with the smallest possible query
3. **Expected behavior** — what you thought would happen
4. **Actual behavior** — what actually happened
5. **Screenshots / logs** — especially `agent_traces` JSON if it's an agent issue

---

## How to request a feature

Use the [feature request template](.github/ISSUE_TEMPLATE/feature.yml). Please describe:

- The **use case** — what business problem are you solving?
- The **proposed shape** — REST endpoint? New agent tool? UI panel?
- **Alternatives considered**
- **Impact** — does this touch the semantic layer, the agent loop, the UI, or all three?

Major features should ideally go through an [RFC](docs/rfcs/) (process launching soon).

---

## How to ask a question

Use the [question template](.github/ISSUE_TEMPLATE/question.yml). For real-time chat, see [Discussions](https://github.com/your-org/datanova/discussions) (coming soon).

---

## Local development

### Prerequisites

- **Node.js** ≥ 20 (we test on 20 and 22)
- **npm** ≥ 10
- **MySQL** ≥ 5.7 (or Docker — see below)
- An **LLM API key** (Anthropic recommended; OpenAI/DeepSeek/Ollama also work)

### Clone & install

```bash
git clone https://github.com/your-org/datanova.git
cd datanova
npm install
```

### Bring up MySQL (if you don't have one)

```bash
docker run -d --name datanova-mysql \
  -e MYSQL_ROOT_PASSWORD=dev \
  -e MYSQL_DATABASE=datanova_dev \
  -p 3306:3306 \
  mysql:8
```

Or use the demo dataset:

```bash
docker run -d --name datanova-demo -p 3307:3306 \
  -e MYSQL_ROOT_PASSWORD=demo mysql:8
docker exec -i datanova-demo mysql -uroot -pdemo < docs/demo-data/employees-init.sql
```

### Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

```bash
ANTHROPIC_API_KEY=sk-ant-...        # or OPENAI_API_KEY / DEEPSEEK_API_KEY
DATANOVA_ENCRYPTION_KEY=any-32-byte-string-yes-32-by
```

### Run

```bash
# Terminal 1 — backend
npm run dev:server

# Terminal 2 — frontend
npm run dev:web

# Open http://localhost:5173
```

---

## Tests

We use **Vitest** for unit tests and **Playwright** for end-to-end.

```bash
# Unit tests (server only)
npm run --workspace=packages/server test

# Single file
npx vitest run packages/server/src/routes/__tests__/semantic.test.ts

# Watch mode
npm run --workspace=packages/server test:watch

# E2E (auto-starts dev servers)
npx playwright test

# E2E UI mode
npx playwright test --ui
```

E2E tests assume the servers are not already running. By default `playwright.config.ts` reuses existing servers on `:3000` and `:5173` if found.

---

## Coding style

We use **ESLint + Prettier** (configured at the repo root). Before pushing:

```bash
npm run lint
```

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add PostgreSQL driver via DatabaseDriver interface
fix: prevent agent_end race on harness abort
docs: clarify semantic-layer priority in system prompt
chore: bump better-sqlite3 to 11.7
```

Types:

| Type | Use for |
|---|---|
| `feat` | New user-facing feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting (no logic change) |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvement |
| `test` | Adding/correcting tests |
| `chore` | Tooling, deps, build |

---

## Pull request process

1. **Fork** the repo and **branch** from `master` (or the active release branch).
2. Make your changes in a focused branch: `feat/pg-driver`, `fix/agent-end-race`.
3. Add or update **tests** — a PR without tests for new logic will be asked to add them.
4. Update **docs** if you changed a public API or user-facing behavior.
5. Run `npm run lint` and `npm test` locally — CI will block on failures.
6. **PR template** — fill in: description, related issue, type of change, test evidence.
7. Wait for review. Expect comments within ~3 working days.
8. Squash-merge once approved.

### Project conventions

- **TypeScript strict mode** is enforced in CI. Avoid `any`; use `unknown` + narrowing.
- **ESM only** — all server imports use `.js` extensions (even for `.ts` files).
- **React 19** — front-end uses React 19 features (concurrent transitions, etc.).
- **TailwindCSS 3** — utility classes for layout; CSS variables for theme colors.
- **No new top-level dependencies** without prior discussion — open an issue first.

---

## Project structure (where to put things)

| Where | What |
|---|---|
| `packages/server/src/agent/tools/` | Agent tools (`execute_sql`, `discover_schema`, …) |
| `packages/server/src/agent/` | Agent harness, registry, prompt builders |
| `packages/server/src/routes/` | REST endpoints |
| `packages/server/src/ws/` | WebSocket handler |
| `packages/server/src/mysql/` | Database driver (today: mysql only) |
| `packages/web/src/components/<Domain>/` | UI components grouped by domain |
| `packages/web/src/hooks/` | React hooks |
| `packages/web/src/api/` | REST client wrappers |
| `packages/web/src/stores/` | Zustand stores |
| `docs/` | All documentation (Markdown) |
| `docs/superpowers/specs/` | Feature specs |
| `docs/superpowers/plans/` | Implementation plans |
| `e2e/` | Playwright E2E tests |

---

## Where to get help

- **Issues** — for bugs and feature requests
- **Discussions** *(coming soon)* — for questions and ideas
- **Email** — security@datanova.local (security issues only — see [SECURITY.md](SECURITY.md))

---

## License

By contributing, you agree that your contributions will be licensed under the project's [Apache-2.0 License](LICENSE).