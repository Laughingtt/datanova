import path from "node:path";
import fs from "node:fs";

export const APP_DIR = path.resolve(process.env.DATANOVA_DIR || path.join(process.cwd(), "data"));
export const DB_PATH = path.join(APP_DIR, "datanova.db");
export const SKILLS_DIR = path.join(APP_DIR, "skills");
export const ANNOTATIONS_DIR = path.join(APP_DIR, "annotations");
export const SESSIONS_DIR = path.join(APP_DIR, "sessions");
export const ENCRYPTION_KEY_ENV = "DATANOVA_ENCRYPTION_KEY";

export function ensureDataDirs(): void {
  [APP_DIR, SKILLS_DIR, ANNOTATIONS_DIR, SESSIONS_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}
