# DataNova Internationalization (i18n) Strategy

> **Status:** Phase 1 (governance) — completed in v1.1.0
> **Phase 2 (full UI i18n):** tracked as P2-1 in the
> [open-source enterprise readiness plan](superpowers/plans/2026-08-25-open-source-enterprise-readiness.md).

---

## Why this document exists

DataNova was originally developed as an internal tool for a Chinese-speaking
team. The UI is fully in Simplified Chinese, and the main README was in
Chinese only. That blocked international evaluation.

The v1.1.0 release makes the project **internationally evaluable** without
fully translating the product:

| Asset | Language | Notes |
|---|---|---|
| `README.md` | 🇬🇧 English | Top-level entry point |
| `README.zh-CN.md` | 🇨🇳 Chinese | Full reference (formerly the main README) |
| `CONTRIBUTING.md` | 🇬🇧 English | |
| `CODE_OF_CONDUCT.md` | 🇬🇧 English | |
| `SECURITY.md` | 🇬🇧 English | |
| `CHANGELOG.md` | 🇬🇧 English | (Chinese contributors welcome to add a `CHANGELOG.zh-CN.md`) |
| `docs/QUICKSTART.md` | 🇬🇧 English | |
| `docs/01..07-*.md` | 🇨🇳 Chinese | Original architecture docs |
| All UI strings | 🇨🇳 Chinese | Product strings |

So: an English-speaking engineer can install, configure, read the API, and
contribute — but using the product itself requires reading Chinese.

---

## Phase 2 plan (P2-1)

The full i18n work is part of the **P2 — Polish** phase of the v2.0 plan.
Estimated scope:

1. Adopt [`react-i18next`](https://react.i18next.com/) as the frontend
   translation runtime.
2. Extract every hardcoded Chinese string from `packages/web/src/**/*.tsx`
   into `packages/web/src/locales/zh-CN.json` (the source-of-truth Chinese
   bundle).
3. Add `packages/web/src/locales/en-US.json` — translated by maintainers +
   community.
4. Add a language switcher in the top bar.
5. Persist user language preference (Zustand + `localStorage`).
6. Update the chat input placeholder / agent welcome cards to use `t()`.
7. Make the LLM system prompts `prompt-builder*.ts` accept a `locale`
   parameter and emit user-facing strings in the chosen language.
8. Format dates / numbers with `Intl.DateTimeFormat` / `Intl.NumberFormat`
   so 1,000.50 ≠ 1.000,50.

### Translation policy

- **Source language is Chinese.** All new strings enter `zh-CN.json` first.
- `en-US.json` is updated by maintainers + community PRs (label:
  [`i18n`](../../.github/ISSUE_TEMPLATE/)).
- Strings containing Chinese *product names* (e.g. 智能问数, 指标开发)
  stay in Chinese but get a glossed English alias in `en-US.json`.

### Language detection priority

1. User-selected language (Settings or top-bar switcher)
2. `localStorage["datanova.locale"]`
3. `navigator.language`
4. Fallback: `zh-CN`

---

## Why we are *not* doing full i18n in v1.1.0

- The product surface is large (~30 React components with hardcoded Chinese).
- The semantic-layer content (metric `display_name`, query-skill names,
  agent welcome text) is user-authored and lives in SQLite, so it doesn't
  translate via i18n — it has to be authored in multiple languages by users.
- Translating without native-speaker review risks producing poor Chinese in
  the source-of-truth file.

Doing it well takes a release. v1.1.0 is the **evaluable** milestone; v2.0
is the **translatable** milestone.

---

## How to help

- 🇨🇳 Review Chinese strings in `zh-CN.json` for tone / consistency
- 🇬🇧 Translate new English strings in `en-US.json`
- 🐛 File issues for untranslated UI (label: `i18n`)
- 💡 Suggest glossary entries (terms used across the product)

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the PR workflow.