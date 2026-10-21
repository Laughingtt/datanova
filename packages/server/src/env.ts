import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

/**
 * Re-apply the repo-root `.env` on top of `process.env`.
 *
 * Node's `--env-file` does not overwrite variables that already exist in the
 * shell, so a stale exported key (a common situation when the same shell is
 * reused across projects) silently wins over `.env`. `scripts/start.sh`
 * sources `.env`, which does overwrite; doing the same here keeps
 * `npm run dev:server` consistent with it.
 *
 * Must be imported before anything that reads env at module scope.
 */
const envPath = fileURLToPath(new URL("../../../.env", import.meta.url));

if (fs.existsSync(envPath)) {
  const parsed = parseEnv(fs.readFileSync(envPath, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (value !== undefined) process.env[key] = value;
  }
}
