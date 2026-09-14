# Security Policy

## Supported Versions

The following versions of DataNova receive security updates:

| Version | Supported          |
| ------- | ------------------ |
| v1.1.x  | ✅ Active support   |
| v1.0.x  | ✅ Critical fixes only |
| < 1.0   | ❌ No longer supported |

We follow [semantic versioning](https://semver.org/). Security patches are
backported to the latest minor of the previous major version for at least
6 months after a new major release.

---

## Reporting a Vulnerability

**Please do not file a public issue for security vulnerabilities.**

We accept vulnerability reports via:

- **Email** — `security@datanova.local` (PGP key below)
- **GitHub Security Advisories** — use the
  [private disclosure form](https://github.com/your-org/datanova/security/advisories/new)

You should receive an acknowledgement within **2 business days**. We aim to
triage the report within **5 business days** and either:

- confirm the issue and start working on a fix, or
- ask for clarification if the report is unclear.

Once a fix is ready we will:

1. Prepare a patch on a private branch.
2. Coordinate disclosure timing with you.
4. Credit you in the release notes (unless you prefer to remain anonymous).

---

## PGP Key

```
-----BEGIN PGP PUBLIC KEY BLOCK-----
[To be filled in once a key is provisioned]
-----END PGP PUBLIC KEY BLOCK-----
```

---

## Security Design Notes

DataNova is designed with the following security properties:

| Property | How |
|---|---|
| **SQL safety** | Only `SELECT / SHOW / DESCRIBE / EXPLAIN` allowed (whitelist). Every query goes through schema cache validation (table names must match; column names warn only). |
| **Timeout & limits** | 30-second query timeout. 1000-row result cap. EXPLAIN-based syntax check before saving metric drafts. |
| **Credential storage** | Datasource passwords encrypted with AES-256-GCM. The encryption key is read from `DATANOVA_ENCRYPTION_KEY` (32 bytes). |
| **Query history** | Every SQL execution (success or failure) is recorded in `sql_query_history` for audit. |
| **No remote code execution** | The agent harness executes only registered tools; no `eval` / dynamic import from user input. |

> Even with these guards, **DataNova is not a replacement for database-level
> access controls**. Always connect the agent with a read-only database user
> that has the minimum privileges required for your use case.

---

## Known Security Considerations

- **Prompt injection** — User-supplied text is fed directly to the LLM as part
  of the prompt. A malicious user could try to make the agent execute unsafe
  SQL. Mitigations: SQL whitelist + schema validation + read-only credentials.
- **Token exposure** — `ANTHROPIC_API_KEY` etc. are passed to the LLM provider
  over HTTPS. Don't commit `.env`; rotate keys if leaked.
- **In-memory sessions** — Active Agent conversations live in memory; a crash
  leaks conversation text to logs if `LOG_LEVEL=debug` is enabled in prod.
  Use `LOG_LEVEL=info` or higher in production.

---

## Out-of-scope

The following are **not** considered security vulnerabilities for the purpose
of this policy:

- Vulnerabilities in dependencies that are already fixed upstream and can be
  resolved by `npm audit fix`.
- Issues that require physical access to the server.
- Issues that require the attacker to already have shell access on the host.
- Theoretical issues without a concrete attack scenario.