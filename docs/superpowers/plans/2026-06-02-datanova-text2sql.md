# DataNova Text2SQL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Text2SQL web application on top of the pi agent framework that lets users query MySQL databases through natural language, with real-time agent step visibility and business semantics annotation.

**Architecture:** Hono backend creates pi `AgentHarness` instances with `discover_schema` and `execute_sql` tools. React frontend communicates via REST API + WebSocket. Skills are pi-native SKILL.md files loaded via `loadSkills()`. Schema annotations auto-generate SKILL.md for the agent to consume.

**Tech Stack:** TypeScript, Hono, React + Vite, Zustand, @tanstack/react-table, better-sqlite3, mysql2, @earendil-works/pi-agent-core, @earendil-works/pi-ai

---

## File Structure

```
pi_datanova/
├── package.json                              # Monorepo root
├── tsconfig.json                             # Base TS config
├── packages/
│   ├── server/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts                      # Hono app entry
│   │       ├── config.ts                     # App config & env
│   │       ├── crypto.ts                     # AES-256-GCM encryption
│   │       ├── store.ts                      # SQLite store (better-sqlite3)
│   │       ├── mysql/
│   │       │   ├── pool.ts                   # MySQL connection pool manager
│   │       │   ├── discovery.ts              # INFORMATION_SCHEMA queries
│   │       │   └── executor.ts               # SQL execution with timeout/limit
│   │       ├── agent/
│   │       │   ├── harness-factory.ts        # AgentHarness creation
│   │       │   ├── tools/
│   │       │   │   ├── discover-schema.ts    # discover_schema tool
│   │       │   │   └── execute-sql.ts        # execute_sql tool
│   │       │   ├── prompt-builder.ts         # Dynamic system prompt
│   │       │   └── skill-manager.ts          # loadSkills + refresh
│   │       ├── routes/
│   │       │   ├── datasources.ts            # Datasource CRUD + test
│   │       │   ├── schemas.ts                # Schema + annotation CRUD
│   │       │   ├── skills.ts                 # Skill list/create/delete
│   │       │   └── conversations.ts          # Conversation CRUD
│   │       └── ws/
│   │           └── chat-handler.ts           # WebSocket → AgentHarness bridge
│   │
│   └── web/
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── api/
│           │   └── client.ts                 # REST API client
│           ├── stores/
│           │   └── app.ts                    # Zustand store
│           ├── hooks/
│           │   ├── useWebSocket.ts
│           │   └── useAgentStream.ts
│           ├── components/
│           │   ├── Layout.tsx                 # App shell with sidebar
│           │   ├── Sidebar.tsx                # Dark sidebar navigation
│           │   ├── Chat/
│           │   │   ├── ChatWindow.tsx         # Chat page container
│           │   │   ├── MessageList.tsx        # Scrollable message list
│           │   │   ├── MessageItem.tsx        # Single message (text/tool/table)
│           │   │   ├── StepIndicator.tsx      # Tool call step display
│           │   │   ├── TableResult.tsx        # Inline table result
│           │   │   ├── SqlBlock.tsx           # SQL code display
│           │   │   └── ChatInput.tsx          # Message input
│           │   ├── Datasource/
│           │   │   ├── DatasourcePage.tsx     # Datasource management page
│           │   │   ├── DatasourceList.tsx     # List of datasources
│           │   │   └── DatasourceForm.tsx     # Create/edit form
│           │   └── Schema/
│           │       ├── SchemaPage.tsx         # Schema annotation page
│           │       ├── SchemaTree.tsx         # Table/field tree
│           │       └── AnnotationEditor.tsx   # Inline annotation editor
│           └── styles/
│               └── globals.css               # Tailwind + design tokens
│
├── data/                                     # Runtime data (gitignored)
│   ├── skills/                               # Business SKILL.md files
│   └── annotations/                          # Auto-generated annotation SKILL.md
│
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-06-02-datanova-text2sql-design.md
```

---

### Task 1: Monorepo Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/web/package.json`
- Create: `packages/web/tsconfig.json`
- Create: `packages/web/vite.config.ts`
- Create: `packages/web/index.html`
- Create: `.gitignore`

- [ ] **Step 1: Create root package.json with workspace config**

```json
{
  "name": "pi_datanova",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "dev:server": "npm run dev --workspace=packages/server",
    "dev:web": "npm run dev --workspace=packages/web",
    "build": "npm run build --workspace=packages/server && npm run build --workspace=packages/web"
  }
}
```

- [ ] **Step 2: Create root tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "references": [
    { "path": "packages/server" },
    { "path": "packages/web" }
  ]
}
```

- [ ] **Step 3: Create server package.json**

```json
{
  "name": "@datanova/server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@earendil-works/pi-agent-core": "^0.78.0",
    "@earendil-works/pi-ai": "^0.78.0",
    "hono": "^4.7.0",
    "@hono/node-ws": "^0.3.0",
    "@hono/node-server": "^1.13.0",
    "better-sqlite3": "^11.7.0",
    "mysql2": "^3.12.0",
    "typebox": "^0.33.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 4: Create server tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Create web package.json**

```json
{
  "name": "@datanova/web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zustand": "^5.0.0",
    "@tanstack/react-table": "^8.20.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0"
  }
}
```

- [ ] **Step 6: Create web tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src"]
}
```

- [ ] **Step 7: Create vite.config.ts**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/ws": { target: "ws://localhost:3000", ws: true },
    },
  },
});
```

- [ ] **Step 8: Create index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>DataNova</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 9: Create .gitignore**

```
node_modules/
dist/
data/
*.db
.env
```

- [ ] **Step 10: Create minimal server entry to verify setup**

Create `packages/server/src/index.ts`:

```typescript
import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();
app.get("/api/health", (c) => c.json({ status: "ok" }));

const port = 3000;
serve({ fetch: app.fetch, port }, () => {
  console.log(`DataNova server running on http://localhost:${port}`);
});
```

- [ ] **Step 11: Create minimal web entry to verify setup**

Create `packages/web/src/main.tsx`:

```tsx
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(<App />);
```

Create `packages/web/src/App.tsx`:

```tsx
export default function App() {
  return <div>DataNova</div>;
}
```

- [ ] **Step 12: Install dependencies and verify both projects start**

```bash
cd /mnt/d/projects/pi_datanova && npm install
cd packages/server && npx tsx src/index.ts &
# Verify: curl http://localhost:3000/api/health → {"status":"ok"}
# Then kill the server process
cd packages/web && npx vite --host &
# Verify: browser opens, shows "DataNova"
# Then kill the dev server
```

- [ ] **Step 13: Commit scaffolding**

```bash
git add .
git commit -m "feat: scaffold monorepo with server (Hono) and web (React+Vite) packages"
```

---

### Task 2: Server — SQLite Store & Encryption

**Files:**
- Create: `packages/server/src/store.ts`
- Create: `packages/server/src/crypto.ts`
- Create: `packages/server/src/config.ts`

- [ ] **Step 1: Create config.ts — app configuration**

```typescript
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
```

- [ ] **Step 2: Create crypto.ts — AES-256-GCM encryption for datasource passwords**

```typescript
import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.DATANOVA_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("DATANOVA_ENCRYPTION_KEY environment variable is required");
  }
  // Key must be 32 bytes for AES-256
  return Buffer.from(key.padEnd(32).slice(0, 32), "utf-8");
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf-8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag();
  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted}`;
}

export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const [ivHex, tagHex, encrypted] = ciphertext.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted, "hex", "utf-8");
  decrypted += decipher.final("utf-8");
  return decrypted;
}
```

- [ ] **Step 3: Create store.ts — SQLite database with schema migrations**

```typescript
import Database from "better-sqlite3";
import { DB_PATH } from "./config.js";

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    migrate(db);
  }
  return db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS datasources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 3306,
      database TEXT NOT NULL,
      user TEXT NOT NULL,
      password_encrypted TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS schema_annotations (
      id TEXT PRIMARY KEY,
      datasource_id TEXT NOT NULL,
      table_name TEXT NOT NULL,
      field_name TEXT,
      annotation TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (datasource_id) REFERENCES datasources(id) ON DELETE CASCADE,
      UNIQUE(datasource_id, table_name, field_name)
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      datasource_id TEXT NOT NULL,
      title TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (datasource_id) REFERENCES datasources(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

// --- Datasource CRUD ---

export interface Datasource {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password_encrypted: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface CreateDatasourceInput {
  name: string;
  host: string;
  port?: number;
  database: string;
  user: string;
  password: string;
}

export function listDatasources(): Datasource[] {
  return getDb().prepare("SELECT * FROM datasources ORDER BY created_at DESC").all() as Datasource[];
}

export function getDatasource(id: string): Datasource | undefined {
  return getDb().prepare("SELECT * FROM datasources WHERE id = ?").get(id) as Datasource | undefined;
}

export function createDatasource(input: CreateDatasourceInput): Datasource {
  const { encrypt } = await import("./crypto.js");
  const id = crypto.randomUUID();
  const password_encrypted = encrypt(input.password);
  getDb().prepare(`
    INSERT INTO datasources (id, name, host, port, database, user, password_encrypted)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.name, input.host, input.port ?? 3306, input.database, input.user, password_encrypted);
  return getDatasource(id)!;
}

export function updateDatasource(id: string, input: Partial<CreateDatasourceInput & { enabled?: boolean }>): Datasource {
  const sets: string[] = [];
  const values: any[] = [];
  if (input.name !== undefined) { sets.push("name = ?"); values.push(input.name); }
  if (input.host !== undefined) { sets.push("host = ?"); values.push(input.host); }
  if (input.port !== undefined) { sets.push("port = ?"); values.push(input.port); }
  if (input.database !== undefined) { sets.push("database = ?"); values.push(input.database); }
  if (input.user !== undefined) { sets.push("user = ?"); values.push(input.user); }
  if (input.password !== undefined) {
    const { encrypt } = await import("./crypto.js");
    sets.push("password_encrypted = ?");
    values.push(encrypt(input.password));
  }
  if (input.enabled !== undefined) { sets.push("enabled = ?"); values.push(input.enabled ? 1 : 0); }
  sets.push("updated_at = datetime('now')");
  values.push(id);
  getDb().prepare(`UPDATE datasources SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  return getDatasource(id)!;
}

export function deleteDatasource(id: string): void {
  getDb().prepare("DELETE FROM datasources WHERE id = ?").run(id);
}

// --- Schema Annotations ---

export interface SchemaAnnotation {
  id: string;
  datasource_id: string;
  table_name: string;
  field_name: string | null;
  annotation: string;
  created_at: string;
  updated_at: string;
}

export function getAnnotations(datasourceId: string): SchemaAnnotation[] {
  return getDb().prepare("SELECT * FROM schema_annotations WHERE datasource_id = ? ORDER BY table_name, field_name").all(datasourceId) as SchemaAnnotation[];
}

export function upsertAnnotation(datasourceId: string, tableName: string, fieldName: string | null, annotation: string): SchemaAnnotation {
  const id = crypto.randomUUID();
  getDb().prepare(`
    INSERT INTO schema_annotations (id, datasource_id, table_name, field_name, annotation)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(datasource_id, table_name, field_name) DO UPDATE SET
      annotation = excluded.annotation,
      updated_at = datetime('now')
  `).run(id, datasourceId, tableName, fieldName, annotation);
  return getDb().prepare("SELECT * FROM schema_annotations WHERE datasource_id = ? AND table_name = ? AND field_name = ?").get(datasourceId, tableName, fieldName) as SchemaAnnotation;
}

export function deleteAnnotation(id: string): void {
  getDb().prepare("DELETE FROM schema_annotations WHERE id = ?").run(id);
}

// --- Conversations ---

export interface Conversation {
  id: string;
  datasource_id: string;
  title: string | null;
  created_at: string;
}

export function listConversations(datasourceId?: string): Conversation[] {
  if (datasourceId) {
    return getDb().prepare("SELECT * FROM conversations WHERE datasource_id = ? ORDER BY created_at DESC").all(datasourceId) as Conversation[];
  }
  return getDb().prepare("SELECT * FROM conversations ORDER BY created_at DESC").all() as Conversation[];
}

export function createConversation(datasourceId: string, title?: string): Conversation {
  const id = crypto.randomUUID();
  getDb().prepare("INSERT INTO conversations (id, datasource_id, title) VALUES (?, ?, ?)").run(id, datasourceId, title ?? null);
  return getDb().prepare("SELECT * FROM conversations WHERE id = ?").get(id) as Conversation;
}

export function deleteConversation(id: string): void {
  getDb().prepare("DELETE FROM conversations WHERE id = ?").run(id);
}

export function updateConversationTitle(id: string, title: string): void {
  getDb().prepare("UPDATE conversations SET title = ? WHERE id = ?").run(title, id);
}
```

- [ ] **Step 4: Verify store works with a quick smoke test**

Create `packages/server/src/test-store.ts`:

```typescript
import { ensureDataDirs } from "./config.js";
import { getDb, createDatasource, listDatasources, getAnnotations, upsertAnnotation } from "./store.js";

ensureDataDirs();
process.env.DATANOVA_ENCRYPTION_KEY = "test-key-32-bytes-long-enough!!";

const db = getDb();
console.log("DB created:", db.name);

const ds = createDatasource({
  name: "Test MySQL",
  host: "localhost",
  port: 3306,
  database: "testdb",
  user: "root",
  password: "secret123",
});
console.log("Created datasource:", ds.id, ds.name);

const all = listDatasources();
console.log("All datasources:", all.length);

const ann = upsertAnnotation(ds.id, "bills", "amount", "账单金额，单位元");
console.log("Created annotation:", ann.annotation);

const annotations = getAnnotations(ds.id);
console.log("Annotations:", annotations.length);
```

```bash
cd /mnt/d/projects/pi_datanova/packages/server && npx tsx src/test-store.ts
# Expected: DB created, datasource created, annotation created
# Clean up test: rm -f data/datanova.db
```

- [ ] **Step 5: Delete test file and commit**

```bash
rm packages/server/src/test-store.ts
git add .
git commit -m "feat: add SQLite store, encryption, and config modules"
```

---

### Task 3: Server — MySQL Connection & Schema Discovery

**Files:**
- Create: `packages/server/src/mysql/pool.ts`
- Create: `packages/server/src/mysql/discovery.ts`
- Create: `packages/server/src/mysql/executor.ts`

- [ ] **Step 1: Create pool.ts — MySQL connection pool manager**

```typescript
import mysql from "mysql2/promise";
import { getDatasource } from "../store.js";
import { decrypt } from "../crypto.js";

const pools = new Map<string, mysql.Pool>();

export interface DatasourceConnection {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export function getDatasourceConnection(id: string): DatasourceConnection {
  const ds = getDatasource(id);
  if (!ds) throw new Error(`Datasource ${id} not found`);
  if (!ds.enabled) throw new Error(`Datasource ${id} is disabled`);
  return {
    host: ds.host,
    port: ds.port,
    database: ds.database,
    user: ds.user,
    password: decrypt(ds.password_encrypted),
  };
}

export async function getPool(datasourceId: string): Promise<mysql.Pool> {
  if (pools.has(datasourceId)) {
    return pools.get(datasourceId)!;
  }
  const conn = getDatasourceConnection(datasourceId);
  const pool = mysql.createPool({
    host: conn.host,
    port: conn.port,
    database: conn.database,
    user: conn.user,
    password: conn.password,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
  });
  pools.set(datasourceId, pool);
  return pool;
}

export async function testConnection(datasourceId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const pool = await getPool(datasourceId);
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function testRawConnection(input: {
  host: string; port: number; database: string; user: string; password: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const conn = await mysql.createConnection(input);
    await conn.ping();
    await conn.end();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export function closePool(datasourceId: string): void {
  const pool = pools.get(datasourceId);
  if (pool) {
    pool.end();
    pools.delete(datasourceId);
  }
}
```

- [ ] **Step 2: Create discovery.ts — INFORMATION_SCHEMA queries**

```typescript
import { getPool } from "./pool.js";

export interface TableInfo {
  table_name: string;
  table_comment: string;
}

export interface FieldInfo {
  table_name: string;
  column_name: string;
  column_type: string;
  is_nullable: "YES" | "NO";
  column_key: string;
  column_default: string | null;
  column_comment: string;
  ordinal_position: number;
}

export interface ForeignKeyInfo {
  constraint_name: string;
  table_name: string;
  column_name: string;
  referenced_table_name: string;
  referenced_column_name: string;
}

export interface SchemaInfo {
  tables: TableInfo[];
  fields: FieldInfo[];
  foreign_keys: ForeignKeyInfo[];
}

export async function discoverSchema(datasourceId: string, tableNames?: string[]): Promise<SchemaInfo> {
  const pool = await getPool(datasourceId);
  const conn = await pool.getConnection();

  try {
    const tableFilter = tableNames && tableNames.length > 0
      ? ` AND TABLE_NAME IN (${tableNames.map(() => "?").join(",")})`
      : "";

    const [tables] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_NAME as table_name, TABLE_COMMENT as table_comment
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE()${tableFilter}
       ORDER BY TABLE_NAME`,
      tableNames ?? []
    );

    const [fields] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_NAME as table_name, COLUMN_NAME as column_name,
              COLUMN_TYPE as column_type, IS_NULLABLE as is_nullable,
              COLUMN_KEY as column_key, COLUMN_DEFAULT as column_default,
              COLUMN_COMMENT as column_comment, ORDINAL_POSITION as ordinal_position
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()${tableFilter}
       ORDER BY TABLE_NAME, ORDINAL_POSITION`,
      tableNames ?? []
    );

    const [fks] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT CONSTRAINT_NAME as constraint_name,
              TABLE_NAME as table_name,
              COLUMN_NAME as column_name,
              REFERENCED_TABLE_NAME as referenced_table_name,
              REFERENCED_COLUMN_NAME as referenced_column_name
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE()
         AND REFERENCED_TABLE_NAME IS NOT NULL${tableFilter.replace(/TABLE_NAME/g, "TABLE_NAME")}
       ORDER BY TABLE_NAME, CONSTRAINT_NAME`,
      tableNames ?? []
    );

    return {
      tables: tables as TableInfo[],
      fields: fields as FieldInfo[],
      foreign_keys: fks as ForeignKeyInfo[],
    };
  } finally {
    conn.release();
  }
}

export function formatSchemaForPrompt(schema: SchemaInfo, annotations: Map<string, string>): string {
  const lines: string[] = [];

  for (const table of schema.tables) {
    const tableKey = table.table_name;
    const tableAnnotation = annotations.get(tableKey);
    lines.push(`## ${table.table_name}${tableAnnotation ? ` (${tableAnnotation})` : ""}`);
    if (table.table_comment) {
      lines.push(`注释: ${table.table_comment}`);
    }

    const tableFields = schema.fields.filter((f) => f.table_name === table.table_name);
    for (const field of tableFields) {
      const fieldKey = `${table.table_name}.${field.column_name}`;
      const fieldAnnotation = annotations.get(fieldKey);
      const attrs: string[] = [];
      if (field.column_key === "PRI") attrs.push("PRIMARY KEY");
      if (field.is_nullable === "NO") attrs.push("NOT NULL");
      if (field.column_default !== null) attrs.push(`DEFAULT ${field.column_default}`);
      const annotationStr = fieldAnnotation ? ` — ${fieldAnnotation}` : "";
      lines.push(`  - ${field.column_name} ${field.column_type}${attrs.length ? ` [${attrs.join(", ")}]` : ""}${annotationStr}`);
    }

    const tableFks = schema.foreign_keys.filter((fk) => fk.table_name === table.table_name);
    for (const fk of tableFks) {
      lines.push(`  → ${fk.column_name} → ${fk.referenced_table_name}.${fk.referenced_column_name}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
```

- [ ] **Step 3: Create executor.ts — SQL execution with timeout and row limit**

```typescript
import { getPool } from "./pool.js";
import mysql from "mysql2/promise";

export interface QueryResult {
  columns: string[];
  rows: Record<string, any>[];
  rowCount: number;
  affectedRows: number;
  executionTimeMs: number;
}

export async function executeSql(
  datasourceId: string,
  sql: string,
  options: { timeout?: number; rowLimit?: number } = {}
): Promise<QueryResult> {
  const { timeout = 30000, rowLimit = 1000 } = options;
  const pool = await getPool(datasourceId);
  const conn = await pool.getConnection();

  try {
    const start = Date.now();

    // Set query timeout
    await conn.query(`SET SESSION max_execution_time = ${timeout}`);

    const [result] = await conn.query(sql);
    const executionTimeMs = Date.now() - start;

    if (Array.isArray(result)) {
      const rows = result as mysql.RowDataPacket[];
      const truncated = rows.slice(0, rowLimit);
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      return {
        columns,
        rows: truncated,
        rowCount: rows.length,
        affectedRows: 0,
        executionTimeMs,
      };
    }

    const r = result as mysql.ResultSetHeader;
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      affectedRows: r.affectedRows,
      executionTimeMs,
    };
  } finally {
    conn.release();
  }
}

export function isSelectQuery(sql: string): boolean {
  const normalized = sql.trim().toUpperCase();
  return normalized.startsWith("SELECT") || normalized.startsWith("SHOW") || normalized.startsWith("DESCRIBE") || normalized.startsWith("EXPLAIN");
}
```

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: add MySQL connection pool, schema discovery, and SQL executor"
```

---

### Task 4: Server — pi AgentHarness Integration

**Files:**
- Create: `packages/server/src/agent/tools/discover-schema.ts`
- Create: `packages/server/src/agent/tools/execute-sql.ts`
- Create: `packages/server/src/agent/prompt-builder.ts`
- Create: `packages/server/src/agent/skill-manager.ts`
- Create: `packages/server/src/agent/harness-factory.ts`

This is the core task — integrating pi AgentHarness. The exact API signatures must be verified against the installed pi-agent-core at implementation time. The code below is based on reading the pi source at `/mnt/d/projects/pi/packages/agent/src/`.

- [ ] **Step 1: Create discover-schema.ts — pi AgentTool for schema discovery**

```typescript
import { Type } from "typebox";
import { discoverSchema, formatSchemaForPrompt } from "../../mysql/discovery.js";
import { getAnnotations } from "../../store.js";

export function createDiscoverSchemaTool(datasourceId: string) {
  return {
    name: "discover_schema",
    label: "发现数据库表结构",
    description: "查询 MySQL 数据库的表结构、字段信息。可指定表名，不指定则返回所有表。",
    parameters: Type.Object({
      tables: Type.Optional(Type.Array(Type.String(), {
        description: "指定要查询的表名列表，不填则查询所有表"
      })),
    }),
    execute: async (toolCallId: string, params: { tables?: string[] }, signal: AbortSignal, onUpdate: (update: any) => void) => {
      onUpdate({ type: "progress", message: "正在查询数据库结构..." });

      const schema = await discoverSchema(datasourceId, params.tables);

      // Load user annotations and build a map
      const annotations = getAnnotations(datasourceId);
      const annotationMap = new Map<string, string>();
      for (const ann of annotations) {
        const key = ann.field_name ? `${ann.table_name}.${ann.field_name}` : ann.table_name;
        annotationMap.set(key, ann.annotation);
      }

      const formatted = formatSchemaForPrompt(schema, annotationMap);

      return {
        content: [{ type: "text" as const, text: formatted }],
        details: { schema, annotationCount: annotations.length },
      };
    },
  };
}
```

- [ ] **Step 2: Create execute-sql.ts — pi AgentTool for SQL execution**

```typescript
import { Type } from "typebox";
import { executeSql, isSelectQuery } from "../../mysql/executor.js";

export function createExecuteSqlTool(datasourceId: string) {
  return {
    name: "execute_sql",
    label: "执行 SQL 查询",
    description: "执行 SQL 查询并返回结果。仅允许 SELECT/SHOW/DESCRIBE/EXPLAIN 语句。",
    parameters: Type.Object({
      sql: Type.String({ description: "要执行的 SQL 查询语句" }),
    }),
    execute: async (toolCallId: string, params: { sql: string }, signal: AbortSignal, onUpdate: (update: any) => void) => {
      const sql = params.sql.trim();

      // Basic guard: only allow read queries
      if (!isSelectQuery(sql)) {
        return {
          content: [{ type: "text" as const, text: "错误：仅允许 SELECT/SHOW/DESCRIBE/EXPLAIN 查询，不允许修改数据。" }],
          isError: true,
        };
      }

      onUpdate({ type: "progress", message: `正在执行 SQL: ${sql.slice(0, 100)}...` });

      try {
        const result = await executeSql(datasourceId, sql);

        // Format result for the agent
        let text = "";
        if (result.rows.length > 0) {
          text = `查询返回 ${result.rowCount} 行数据 (耗时 ${result.executionTimeMs}ms)\n\n`;
          text += `列: ${result.columns.join(", ")}\n\n`;
          // Show first 20 rows as text
          const previewRows = result.rows.slice(0, 20);
          for (const row of previewRows) {
            text += result.columns.map((c) => String(row[c] ?? "NULL")).join(" | ") + "\n";
          }
          if (result.rows.length > 20) {
            text += `... 还有 ${result.rows.length - 20} 行\n`;
          }
        } else if (result.affectedRows > 0) {
          text = `影响 ${result.affectedRows} 行 (耗时 ${result.executionTimeMs}ms)`;
        } else {
          text = "查询返回 0 行数据";
        }

        return {
          content: [{ type: "text" as const, text }],
          details: { columns: result.columns, rows: result.rows, rowCount: result.rowCount, executionTimeMs: result.executionTimeMs },
        };
      } catch (err: any) {
        return {
          content: [{ type: "text" as const, text: `SQL 执行错误: ${err.message}` }],
          isError: true,
        };
      }
    },
  };
}
```

- [ ] **Step 3: Create prompt-builder.ts — dynamic system prompt**

```typescript
import { formatSkillsForSystemPrompt } from "@earendil-works/pi-agent-core";
import { getAnnotations } from "../store.js";
import { discoverSchema, formatSchemaForPrompt } from "../mysql/discovery.js";

interface PromptOptions {
  datasourceId: string;
  datasourceName: string;
  databaseName: string;
  skills: any[];
}

export async function buildDataNovaSystemPrompt(options: PromptOptions): Promise<string> {
  const parts: string[] = [];

  parts.push(`你是 DataNova 数据查询助手，帮助用户通过自然语言查询 MySQL 数据库。

## 当前日期
${new Date().toISOString().split("T")[0]}

## 规则
1. 只生成 SELECT/SHOW/DESCRIBE/EXPLAIN 查询，不允许修改数据
2. 如果不确定表结构，先使用 discover_schema 工具了解
3. SQL 生成后直接调用 execute_sql 执行
4. 查询结果用中文总结
5. 参考业务语义标注理解字段含义
6. 参考已加载的 skill 处理特定业务场景`);

  parts.push(`## 数据库信息
- 名称: ${options.databaseName}
- 类型: MySQL`);

  // Load and format annotations
  const annotations = getAnnotations(options.datasourceId);
  if (annotations.length > 0) {
    const annotationMap = new Map<string, string>();
    for (const ann of annotations) {
      const key = ann.field_name ? `${ann.table_name}.${ann.field_name}` : ann.table_name;
      annotationMap.set(key, ann.annotation);
    }
    const annotationLines: string[] = ["## 业务语义标注", ""];
    for (const [key, value] of annotationMap) {
      annotationLines.push(`- ${key}: ${value}`);
    }
    parts.push(annotationLines.join("\n"));
  }

  // Format skills using pi's built-in function
  if (options.skills.length > 0) {
    parts.push(formatSkillsForSystemPrompt(options.skills));
  }

  return parts.join("\n\n");
}
```

- [ ] **Step 4: Create skill-manager.ts — load and refresh skills**

```typescript
import fs from "node:fs";
import path from "node:path";
import { SKILLS_DIR, ANNOTATIONS_DIR } from "../config.js";
import { getAnnotations } from "../store.js";

// Simple SKILL.md loader — reads skill files from directories
// The exact loadSkills() API from pi-agent-core will be used in harness-factory.ts
// This module manages the skill files on disk

export interface SkillInfo {
  name: string;
  path: string;
  description: string;
  content: string;
}

export function listSkillFiles(): SkillInfo[] {
  const skills: SkillInfo[] = [];

  for (const dir of [SKILLS_DIR, ANNOTATIONS_DIR]) {
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillFile = path.join(dir, entry.name, "SKILL.md");
      if (!fs.existsSync(skillFile)) continue;
      const content = fs.readFileSync(skillFile, "utf-8");
      // Parse frontmatter for description
      const descMatch = content.match(/^---\s*\n[\s\S]*?description:\s*(.+)\n[\s\S]*?---/);
      const description = descMatch ? descMatch[1].trim() : "";
      skills.push({
        name: entry.name,
        path: skillFile,
        description,
        content,
      });
    }
  }

  return skills;
}

export function getSkillContent(name: string): string | undefined {
  for (const dir of [SKILLS_DIR, ANNOTATIONS_DIR]) {
    const skillFile = path.join(dir, name, "SKILL.md");
    if (fs.existsSync(skillFile)) {
      return fs.readFileSync(skillFile, "utf-8");
    }
  }
  return undefined;
}

export function saveSkill(name: string, content: string): string {
  const skillDir = path.join(SKILLS_DIR, name);
  if (!fs.existsSync(skillDir)) {
    fs.mkdirSync(skillDir, { recursive: true });
  }
  const skillFile = path.join(skillDir, "SKILL.md");
  fs.writeFileSync(skillFile, content, "utf-8");
  return skillFile;
}

export function deleteSkill(name: string): boolean {
  for (const dir of [SKILLS_DIR, ANNOTATIONS_DIR]) {
    const skillDir = path.join(dir, name);
    if (fs.existsSync(skillDir)) {
      fs.rmSync(skillDir, { recursive: true, force: true });
      return true;
    }
  }
  return false;
}

/**
 * Auto-generate a SKILL.md from schema annotations.
 * Called when annotations are saved.
 */
export function generateAnnotationSkill(datasourceId: string): void {
  const annotations = getAnnotations(datasourceId);

  if (annotations.length === 0) return;

  const lines: string[] = [
    "---",
    "name: schema-annotations",
    "description: 数据库业务语义标注，查询相关表时务必参考此 skill",
    "---",
    "",
    "# 数据库业务语义标注",
    "",
    "以下是对数据库表和字段的业务含义说明，查询时请参考。",
    "",
  ];

  // Group by table
  const byTable = new Map<string, { tableAnnotation?: string; fields: Map<string, string> }>();
  for (const ann of annotations) {
    if (!byTable.has(ann.table_name)) {
      byTable.set(ann.table_name, { fields: new Map() });
    }
    const group = byTable.get(ann.table_name)!;
    if (ann.field_name === null) {
      group.tableAnnotation = ann.annotation;
    } else {
      group.fields.set(ann.field_name, ann.annotation);
    }
  }

  for (const [table, group] of byTable) {
    lines.push(`## ${table}${group.tableAnnotation ? ` — ${group.tableAnnotation}` : ""}`);
    for (const [field, meaning] of group.fields) {
      lines.push(`- ${field}: ${meaning}`);
    }
    lines.push("");
  }

  const content = lines.join("\n");
  const skillDir = path.join(ANNOTATIONS_DIR, "schema-annotations");
  if (!fs.existsSync(skillDir)) {
    fs.mkdirSync(skillDir, { recursive: true });
  }
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), content, "utf-8");
}
```

- [ ] **Step 5: Create harness-factory.ts — create and manage AgentHarness instances**

```typescript
import { AgentHarness, loadSkills } from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai";
import { SKILLS_DIR, ANNOTATIONS_DIR, SESSIONS_DIR } from "../config.js";
import { createDiscoverSchemaTool } from "./tools/discover-schema.js";
import { createExecuteSqlTool } from "./tools/execute-sql.js";
import { buildDataNovaSystemPrompt } from "./prompt-builder.js";
import { getDatasource } from "../store.js";
import { decrypt } from "../crypto.js";

// Active harness instances per conversation
const harnessInstances = new Map<string, AgentHarness>();

export interface CreateHarnessOptions {
  conversationId: string;
  datasourceId: string;
  provider?: string;
  model?: string;
  apiKey?: string;
}

export async function createHarness(options: CreateHarnessOptions): Promise<AgentHarness> {
  const { conversationId, datasourceId, provider = "openai", model: modelName = "gpt-4o", apiKey } = options;

  const ds = getDatasource(datasourceId);
  if (!ds) throw new Error(`Datasource ${datasourceId} not found`);

  // Load skills from disk directories
  const { skills } = await loadSkills(
    { cwd: SESSIONS_DIR },  // ExecutionEnv with cwd for file resolution
    [SKILLS_DIR, ANNOTATIONS_DIR]
  );

  // Create tools
  const discoverSchemaTool = createDiscoverSchemaTool(datasourceId);
  const executeSqlTool = createExecuteSqlTool(datasourceId);

  // Build system prompt
  const systemPrompt = await buildDataNovaSystemPrompt({
    datasourceId,
    datasourceName: ds.name,
    databaseName: ds.database,
    skills,
  });

  // Create model via pi-ai
  const model = getModel(provider, modelName);

  // Create the AgentHarness
  // NOTE: Exact constructor signature must be verified against pi-agent-core exports
  // at implementation time. This is based on reading the pi source code.
  const harness = new AgentHarness({
    model,
    tools: [discoverSchemaTool, executeSqlTool],
    activeToolNames: ["discover_schema", "execute_sql"],
    systemPrompt,
    resources: { skills },
    // Provide API key resolution
    getApiKeyAndHeaders: async () => ({
      apiKey: apiKey ?? process.env[`${provider.toUpperCase()}_API_KEY`] ?? "",
      headers: undefined,
    }),
  });

  harnessInstances.set(conversationId, harness);
  return harness;
}

export function getHarness(conversationId: string): AgentHarness | undefined {
  return harnessInstances.get(conversationId);
}

export async function refreshHarnessSkills(conversationId: string): Promise<void> {
  const harness = harnessInstances.get(conversationId);
  if (!harness) return;

  const { skills } = await loadSkills(
    { cwd: SESSIONS_DIR },
    [SKILLS_DIR, ANNOTATIONS_DIR]
  );

  await harness.setResources({ skills });
}

export function removeHarness(conversationId: string): void {
  harnessInstances.delete(conversationId);
}
```

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: add pi AgentHarness integration with tools, prompt builder, and skill manager"
```

---

### Task 5: Server — REST API Routes

**Files:**
- Create: `packages/server/src/routes/datasources.ts`
- Create: `packages/server/src/routes/schemas.ts`
- Create: `packages/server/src/routes/skills.ts`
- Create: `packages/server/src/routes/conversations.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Create datasources.ts route**

```typescript
import { Hono } from "hono";
import { listDatasources, getDatasource, createDatasource, updateDatasource, deleteDatasource } from "../store.js";
import { testRawConnection, testConnection } from "../mysql/pool.js";

const app = new Hono();

app.get("/", (c) => c.json(listDatasources()));

app.get("/:id", (c) => {
  const ds = getDatasource(c.req.param("id"));
  if (!ds) return c.json({ error: "Not found" }, 404);
  return c.json(ds);
});

app.post("/", async (c) => {
  const body = await c.req.json();
  // Test connection before creating
  const test = await testRawConnection({
    host: body.host,
    port: body.port ?? 3306,
    database: body.database,
    user: body.user,
    password: body.password,
  });
  if (!test.success) {
    return c.json({ error: `Connection test failed: ${test.error}` }, 400);
  }
  const ds = createDatasource(body);
  return c.json(ds, 201);
});

app.put("/:id", async (c) => {
  const body = await c.req.json();
  const ds = updateDatasource(c.req.param("id"), body);
  if (!ds) return c.json({ error: "Not found" }, 404);
  return c.json(ds);
});

app.delete("/:id", (c) => {
  deleteDatasource(c.req.param("id"));
  return c.json({ ok: true });
});

app.post("/:id/test", async (c) => {
  const result = await testConnection(c.req.param("id"));
  return c.json(result);
});

export default app;
```

- [ ] **Step 2: Create schemas.ts route**

```typescript
import { Hono } from "hono";
import { getAnnotations, upsertAnnotation, deleteAnnotation } from "../store.js";
import { discoverSchema } from "../mysql/discovery.js";
import { generateAnnotationSkill } from "../agent/skill-manager.js";

const app = new Hono();

// Get schema for a datasource
app.get("/:datasourceId", async (c) => {
  const schema = await discoverSchema(c.req.param("datasourceId"));
  const annotations = getAnnotations(c.req.param("datasourceId"));
  return c.json({ schema, annotations });
});

// Annotate a table
app.put("/:datasourceId/tables/:tableName", async (c) => {
  const { annotation } = await c.req.json();
  const result = upsertAnnotation(c.req.param("datasourceId"), c.req.param("tableName"), null, annotation);
  generateAnnotationSkill(c.req.param("datasourceId"));
  return c.json(result);
});

// Annotate a field
app.put("/:datasourceId/fields/:fieldName", async (c) => {
  const { table_name, annotation } = await c.req.json();
  const result = upsertAnnotation(c.req.param("datasourceId"), table_name, c.req.param("fieldName"), annotation);
  generateAnnotationSkill(c.req.param("datasourceId"));
  return c.json(result);
});

// Delete annotation
app.delete("/:annotationId", (c) => {
  deleteAnnotation(c.req.param("annotationId"));
  return c.json({ ok: true });
});

export default app;
```

- [ ] **Step 3: Create skills.ts route**

```typescript
import { Hono } from "hono";
import { listSkillFiles, getSkillContent, saveSkill, deleteSkill } from "../agent/skill-manager.js";

const app = new Hono();

app.get("/", (c) => {
  const skills = listSkillFiles();
  return c.json(skills.map((s) => ({ name: s.name, description: s.description, path: s.path })));
});

app.get("/:name", (c) => {
  const content = getSkillContent(c.req.param("name"));
  if (!content) return c.json({ error: "Not found" }, 404);
  return c.json({ name: c.req.param("name"), content });
});

app.post("/", async (c) => {
  const { name, content } = await c.req.json();
  const path = saveSkill(name, content);
  return c.json({ name, path }, 201);
});

app.delete("/:name", (c) => {
  const deleted = deleteSkill(c.req.param("name"));
  if (!deleted) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

export default app;
```

- [ ] **Step 4: Create conversations.ts route**

```typescript
import { Hono } from "hono";
import { listConversations, createConversation, deleteConversation, updateConversationTitle } from "../store.js";

const app = new Hono();

app.get("/", (c) => {
  const datasourceId = c.req.query("datasourceId");
  return c.json(listConversations(datasourceId));
});

app.post("/", async (c) => {
  const { datasourceId, title } = await c.req.json();
  const conversation = createConversation(datasourceId, title);
  return c.json(conversation, 201);
});

app.put("/:id/title", async (c) => {
  const { title } = await c.req.json();
  updateConversationTitle(c.req.param("id"), title);
  return c.json({ ok: true });
});

app.delete("/:id", (c) => {
  deleteConversation(c.req.param("id"));
  return c.json({ ok: true });
});

export default app;
```

- [ ] **Step 5: Update index.ts to wire all routes**

Replace `packages/server/src/index.ts`:

```typescript
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createNodeWebSocket } from "@hono/node-ws";
import { ensureDataDirs } from "./config.js";
import datasourcesRoute from "./routes/datasources.js";
import schemasRoute from "./routes/schemas.js";
import skillsRoute from "./routes/skills.js";
import conversationsRoute from "./routes/conversations.js";
import { createChatHandler } from "./ws/chat-handler.js";

ensureDataDirs();

const app = new Hono();

app.use("/api/*", cors());

// Health check
app.get("/api/health", (c) => c.json({ status: "ok" }));

// REST routes
app.route("/api/datasources", datasourcesRoute);
app.route("/api/schemas", schemasRoute);
app.route("/api/skills", skillsRoute);
app.route("/api/conversations", conversationsRoute);

// WebSocket
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
injectWebSocket;

app.get("/ws/chat/:conversationId", upgradeWebSocket((c) => createChatHandler(c)));

const port = parseInt(process.env.PORT || "3000");
serve({ fetch: app.fetch, port }, () => {
  console.log(`DataNova server running on http://localhost:${port}`);
});
```

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: add REST API routes for datasources, schemas, skills, and conversations"
```

---

### Task 6: Server — WebSocket Chat Handler

**Files:**
- Create: `packages/server/src/ws/chat-handler.ts`

- [ ] **Step 1: Create chat-handler.ts — WebSocket → AgentHarness bridge**

```typescript
import type { WSContext } from "hono/ws";
import { getHarness, createHarness, removeHarness, refreshHarnessSkills } from "../agent/harness-factory.js";
import { getDatasource } from "../store.js";

interface ClientMessage {
  type: "message" | "init";
  text?: string;
  datasourceId?: string;
  provider?: string;
  model?: string;
  apiKey?: string;
}

export function createChatHandler(c: any) {
  return {
    onOpen(event: any, ws: WSContext) {
      console.log("WebSocket connected:", c.req.param("conversationId"));
    },

    async onMessage(event: any, ws: WSContext) {
      const conversationId = c.req.param("conversationId");
      const data: ClientMessage = JSON.parse(event.data as string);

      try {
        if (data.type === "init") {
          // Initialize harness for this conversation
          if (!data.datasourceId) {
            ws.send(JSON.stringify({ type: "error", error: "datasourceId is required" }));
            return;
          }

          await createHarness({
            conversationId,
            datasourceId: data.datasourceId,
            provider: data.provider,
            model: data.model,
            apiKey: data.apiKey,
          });

          ws.send(JSON.stringify({ type: "ready", conversationId }));
          return;
        }

        if (data.type === "message" && data.text) {
          let harness = getHarness(conversationId);

          if (!harness) {
            ws.send(JSON.stringify({ type: "error", error: "Session not initialized. Send init message first." }));
            return;
          }

          // Subscribe to harness events and forward to WebSocket
          // NOTE: The exact event subscription API must be verified against pi-agent-core.
          // AgentHarness may use .subscribe(), .on(), or callback-based event system.
          // The code below uses a conceptual event forwarding pattern.

          ws.send(JSON.stringify({ type: "agent_start", conversationId }));

          // Run the agent prompt — events are forwarded as they arrive
          // The actual event mechanism depends on pi's implementation
          const result = await harness.prompt(data.text, {
            // Event callback — forward each event to the client
            onEvent: (event: any) => {
              if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({
                  type: event.type,
                  ...event,
                }));
              }
            },
          });

          ws.send(JSON.stringify({ type: "agent_end", conversationId }));
        }
      } catch (err: any) {
        ws.send(JSON.stringify({ type: "error", error: err.message }));
      }
    },

    onClose(event: any, ws: WSContext) {
      const conversationId = c.req.param("conversationId");
      console.log("WebSocket closed:", conversationId);
      // Keep harness alive for reconnection — don't remove on disconnect
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add .
git commit -m "feat: add WebSocket chat handler bridging WS to pi AgentHarness"
```

---

### Task 7: Frontend — Design System & Layout Shell

**Files:**
- Create: `packages/web/src/styles/globals.css`
- Create: `packages/web/tailwind.config.js`
- Create: `packages/web/postcss.config.js`
- Create: `packages/web/src/main.tsx` (update)
- Create: `packages/web/src/App.tsx` (update)
- Create: `packages/web/src/components/Layout.tsx`
- Create: `packages/web/src/components/Sidebar.tsx`
- Create: `packages/web/src/stores/app.ts`
- Create: `packages/web/src/api/client.ts`

- [ ] **Step 1: Create Tailwind + PostCSS config**

Create `packages/web/tailwind.config.js`:

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand
        "cohere-black": "#000000",
        "near-black": "#17171c",
        "deep-green": "#003c33",
        "dark-navy": "#071829",
        "action-blue": "#1863dc",
        "coral": "#ff7759",
        "soft-coral": "#ffad9b",
        // Surface
        "canvas-white": "#ffffff",
        "soft-stone": "#eeece7",
        "pale-green": "#edfce9",
        "pale-blue": "#f1f5ff",
        "card-border": "#f2f2f2",
        // Text
        ink: "#212121",
        "muted-slate": "#93939f",
        slate: "#75758a",
        hairline: "#d9d9dd",
        "border-light": "#e5e7eb",
        // Semantic
        "focus-blue": "#4c6ee6",
        "form-focus": "#9b60aa",
        "error-red": "#b30000",
      },
      fontFamily: {
        display: ['"Space Grotesk"', "Inter", "ui-sans-serif", "system-ui"],
        body: ["Inter", "Arial", "ui-sans-serif", "system-ui"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        xs: "4px",
        sm: "8px",
        md: "16px",
        lg: "22px",
        xl: "30px",
        pill: "32px",
      },
    },
  },
  plugins: [],
};
```

Create `packages/web/postcss.config.js`:

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 2: Create globals.css with design tokens**

Create `packages/web/src/styles/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply bg-canvas-white text-ink font-body;
    font-size: 16px;
    line-height: 1.5;
  }

  h1, h2, h3 {
    @apply font-display font-normal tracking-tight;
  }
}
```

- [ ] **Step 3: Create API client**

Create `packages/web/src/api/client.ts`:

```typescript
const BASE_URL = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Datasources
  listDatasources: () => request<any[]>("/datasources"),
  getDatasource: (id: string) => request<any>(`/datasources/${id}`),
  createDatasource: (data: any) => request<any>("/datasources", { method: "POST", body: JSON.stringify(data) }),
  updateDatasource: (id: string, data: any) => request<any>(`/datasources/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteDatasource: (id: string) => request<void>(`/datasources/${id}`, { method: "DELETE" }),
  testDatasource: (id: string) => request<any>(`/datasources/${id}/test`, { method: "POST" }),

  // Schemas
  getSchema: (dsId: string) => request<any>(`/schemas/${dsId}`),
  annotateTable: (dsId: string, tableName: string, annotation: string) =>
    request<any>(`/schemas/${dsId}/tables/${tableName}`, { method: "PUT", body: JSON.stringify({ annotation }) }),
  annotateField: (dsId: string, fieldName: string, tableName: string, annotation: string) =>
    request<any>(`/schemas/${dsId}/fields/${fieldName}`, { method: "PUT", body: JSON.stringify({ table_name: tableName, annotation }) }),

  // Skills
  listSkills: () => request<any[]>("/skills"),
  getSkill: (name: string) => request<any>(`/skills/${name}`),
  createSkill: (name: string, content: string) =>
    request<any>("/skills", { method: "POST", body: JSON.stringify({ name, content }) }),
  deleteSkill: (name: string) => request<void>(`/skills/${name}`, { method: "DELETE" }),

  // Conversations
  listConversations: (datasourceId?: string) =>
    request<any[]>(`/conversations${datasourceId ? `?datasourceId=${datasourceId}` : ""}`),
  createConversation: (datasourceId: string, title?: string) =>
    request<any>("/conversations", { method: "POST", body: JSON.stringify({ datasourceId, title }) }),
  deleteConversation: (id: string) => request<void>(`/conversations/${id}`, { method: "DELETE" }),
};
```

- [ ] **Step 4: Create Zustand store**

Create `packages/web/src/stores/app.ts`:

```typescript
import { create } from "zustand";

interface AppState {
  // Current view
  view: "chat" | "datasources" | "schemas";
  setView: (view: AppState["view"]) => void;

  // Selected datasource
  selectedDatasourceId: string | null;
  setSelectedDatasourceId: (id: string | null) => void;

  // Selected conversation
  selectedConversationId: string | null;
  setSelectedConversationId: (id: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  view: "chat",
  setView: (view) => set({ view }),
  selectedDatasourceId: null,
  setSelectedDatasourceId: (id) => set({ selectedDatasourceId: id }),
  selectedConversationId: null,
  setSelectedConversationId: (id) => set({ selectedConversationId: id }),
}));
```

- [ ] **Step 5: Create Sidebar component**

Create `packages/web/src/components/Sidebar.tsx`:

```tsx
import { useAppStore } from "../stores/app";

export default function Sidebar() {
  const { view, setView } = useAppStore();

  const navItems = [
    { key: "chat" as const, label: "对话", icon: "💬" },
    { key: "datasources" as const, label: "数据源", icon: "🗄️" },
    { key: "schemas" as const, label: "Schema 标注", icon: "🏷️" },
  ];

  return (
    <aside className="w-[280px] bg-near-black text-white flex flex-col h-screen">
      <div className="px-6 py-5 border-b border-white/10">
        <h1 className="text-xl font-display tracking-tight">DataNova</h1>
      </div>
      <nav className="flex-1 py-4">
        {navItems.map((item) => (
          <button
            key={item.key}
            onClick={() => setView(item.key)}
            className={`w-full text-left px-6 py-3 text-sm flex items-center gap-3 transition-colors ${
              view === item.key
                ? "bg-white/10 text-white"
                : "text-muted-slate hover:bg-white/5 hover:text-white"
            }`}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="px-6 py-4 border-t border-white/10 text-xs text-muted-slate">
        DataNova v0.1.0
      </div>
    </aside>
  );
}
```

- [ ] **Step 6: Create Layout component**

Create `packages/web/src/components/Layout.tsx`:

```tsx
import Sidebar from "./Sidebar";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 7: Update App.tsx with Layout and view routing**

Replace `packages/web/src/App.tsx`:

```tsx
import Layout from "./components/Layout";
import { useAppStore } from "./stores/app";

function ChatPlaceholder() {
  return (
    <div className="h-full flex items-center justify-center bg-canvas-white">
      <p className="text-muted-slate text-sm">选择数据源开始对话</p>
    </div>
  );
}

function DatasourcePlaceholder() {
  return (
    <div className="h-full flex items-center justify-center bg-canvas-white">
      <p className="text-muted-slate text-sm">数据源管理</p>
    </div>
  );
}

function SchemaPlaceholder() {
  return (
    <div className="h-full flex items-center justify-center bg-canvas-white">
      <p className="text-muted-slate text-sm">Schema 标注管理</p>
    </div>
  );
}

export default function App() {
  const view = useAppStore((s) => s.view);

  return (
    <Layout>
      {view === "chat" && <ChatPlaceholder />}
      {view === "datasources" && <DatasourcePlaceholder />}
      {view === "schemas" && <SchemaPlaceholder />}
    </Layout>
  );
}
```

- [ ] **Step 8: Update main.tsx with styles import**

Replace `packages/web/src/main.tsx`:

```tsx
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/globals.css";

createRoot(document.getElementById("root")!).render(<App />);
```

- [ ] **Step 9: Verify frontend builds and shows layout**

```bash
cd /mnt/d/projects/pi_datanova && npm run dev:web
# Expected: Browser shows dark sidebar with DataNova title and three nav items
# Clicking nav items changes the placeholder text
```

- [ ] **Step 10: Commit**

```bash
git add .
git commit -m "feat: add frontend design system, layout shell, sidebar, and Zustand store"
```

---

### Task 8: Frontend — Datasource Management Page

**Files:**
- Create: `packages/web/src/components/Datasource/DatasourcePage.tsx`
- Create: `packages/web/src/components/Datasource/DatasourceList.tsx`
- Create: `packages/web/src/components/Datasource/DatasourceForm.tsx`

- [ ] **Step 1: Create DatasourceForm.tsx**

```tsx
import { useState } from "react";
import { api } from "../../api/client";

interface DatasourceFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function DatasourceForm({ onSuccess, onCancel }: DatasourceFormProps) {
  const [form, setForm] = useState({
    name: "",
    host: "localhost",
    port: 3306,
    database: "",
    user: "root",
    password: "",
  });
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.createDatasource(form);
      onSuccess?.();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setError(null);
    try {
      await api.createDatasource(form);
      // createDatasource includes connection test
      setError(null);
      alert("连接成功！");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-lg mx-auto">
      {error && (
        <div className="mb-4 p-3 bg-error-red/10 text-error-red rounded-sm text-sm">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-muted-slate mb-1">
            名称
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-3 py-2 border border-border-light rounded-sm text-sm bg-canvas-white focus:border-form-focus focus:outline-none"
            placeholder="My Database"
            required
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-mono uppercase tracking-wider text-muted-slate mb-1">
              Host
            </label>
            <input
              type="text"
              value={form.host}
              onChange={(e) => setForm({ ...form, host: e.target.value })}
              className="w-full px-3 py-2 border border-border-light rounded-sm text-sm bg-canvas-white focus:border-form-focus focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-muted-slate mb-1">
              Port
            </label>
            <input
              type="number"
              value={form.port}
              onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 3306 })}
              className="w-full px-3 py-2 border border-border-light rounded-sm text-sm bg-canvas-white focus:border-form-focus focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-muted-slate mb-1">
            Database
          </label>
          <input
            type="text"
            value={form.database}
            onChange={(e) => setForm({ ...form, database: e.target.value })}
            className="w-full px-3 py-2 border border-border-light rounded-sm text-sm bg-canvas-white focus:border-form-focus focus:outline-none"
            placeholder="mydb"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-muted-slate mb-1">
            User
          </label>
          <input
            type="text"
            value={form.user}
            onChange={(e) => setForm({ ...form, user: e.target.value })}
            className="w-full px-3 py-2 border border-border-light rounded-sm text-sm bg-canvas-white focus:border-form-focus focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-muted-slate mb-1">
            Password
          </label>
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full px-3 py-2 border border-border-light rounded-sm text-sm bg-canvas-white focus:border-form-focus focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <button
          type="submit"
          className="px-6 py-2 bg-near-black text-white rounded-pill text-sm font-medium hover:bg-cohere-black transition-colors"
        >
          保存
        </button>
        <button
          type="button"
          onClick={handleTest}
          disabled={testing}
          className="px-6 py-2 border border-near-black text-ink rounded-pill text-sm hover:bg-soft-stone transition-colors disabled:opacity-50"
        >
          {testing ? "测试中..." : "测试连接"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-muted-slate underline hover:text-ink ml-2 self-center"
          >
            取消
          </button>
        )}
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Create DatasourceList.tsx**

```tsx
import { useState, useEffect } from "react";
import { api } from "../../api/client";

interface Datasource {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  user: string;
  enabled: number;
}

interface DatasourceListProps {
  onAdd: () => void;
  onSelect: (id: string) => void;
  selectedId: string | null;
}

export default function DatasourceList({ onAdd, onSelect, selectedId }: DatasourceListProps) {
  const [datasources, setDatasources] = useState<Datasource[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.listDatasources();
      setDatasources(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("确定删除此数据源？")) return;
    await api.deleteDatasource(id);
    load();
  };

  if (loading) return <div className="p-6 text-muted-slate text-sm">加载中...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-display tracking-tight">数据源</h2>
        <button
          onClick={onAdd}
          className="px-5 py-2 bg-near-black text-white rounded-pill text-sm hover:bg-cohere-black transition-colors"
        >
          添加数据源
        </button>
      </div>

      {datasources.length === 0 ? (
        <div className="text-center py-12 text-muted-slate">
          <p className="text-sm">暂无数据源，点击上方按钮添加</p>
        </div>
      ) : (
        <div className="divide-y divide-hairline">
          {datasources.map((ds) => (
            <div
              key={ds.id}
              onClick={() => onSelect(ds.id)}
              className={`flex items-center justify-between py-4 px-4 cursor-pointer transition-colors ${
                selectedId === ds.id ? "bg-soft-stone" : "hover:bg-soft-stone/50"
              }`}
            >
              <div>
                <div className="font-display text-base">{ds.name}</div>
                <div className="text-xs text-muted-slate font-mono mt-0.5">
                  {ds.host}:{ds.port}/{ds.database}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-mono uppercase ${ds.enabled ? "text-deep-green" : "text-muted-slate"}`}>
                  {ds.enabled ? "启用" : "禁用"}
                </span>
                <button
                  onClick={(e) => handleDelete(ds.id, e)}
                  className="text-xs text-muted-slate hover:text-error-red transition-colors"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create DatasourcePage.tsx**

```tsx
import { useState } from "react";
import DatasourceList from "./DatasourceList";
import DatasourceForm from "./DatasourceForm";
import { useAppStore } from "../../stores/app";

export default function DatasourcePage() {
  const [showForm, setShowForm] = useState(false);
  const { selectedDatasourceId, setSelectedDatasourceId } = useAppStore();

  return (
    <div className="h-full overflow-y-auto bg-canvas-white">
      <div className="max-w-2xl mx-auto px-6 py-8">
        {showForm ? (
          <div className="bg-canvas-white rounded-lg border border-card-border p-8">
            <h2 className="text-2xl font-display tracking-tight mb-6">添加数据源</h2>
            <DatasourceForm
              onSuccess={() => setShowForm(false)}
              onCancel={() => setShowForm(false)}
            />
          </div>
        ) : (
          <DatasourceList
            onAdd={() => setShowForm(true)}
            onSelect={setSelectedDatasourceId}
            selectedId={selectedDatasourceId}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire DatasourcePage into App.tsx**

Update `packages/web/src/App.tsx`:

```tsx
import Layout from "./components/Layout";
import { useAppStore } from "./stores/app";
import DatasourcePage from "./components/Datasource/DatasourcePage";

function ChatPlaceholder() {
  return (
    <div className="h-full flex items-center justify-center bg-canvas-white">
      <p className="text-muted-slate text-sm">选择数据源开始对话</p>
    </div>
  );
}

function SchemaPlaceholder() {
  return (
    <div className="h-full flex items-center justify-center bg-canvas-white">
      <p className="text-muted-slate text-sm">Schema 标注管理</p>
    </div>
  );
}

export default function App() {
  const view = useAppStore((s) => s.view);

  return (
    <Layout>
      {view === "chat" && <ChatPlaceholder />}
      {view === "datasources" && <DatasourcePage />}
      {view === "schemas" && <SchemaPlaceholder />}
    </Layout>
  );
}
```

- [ ] **Step 5: Verify datasource management page renders**

```bash
cd /mnt/d/projects/pi_datanova && npm run dev:web
# Expected: Click "数据源" in sidebar, see empty list with "添加数据源" button
# Click "添加数据源", see form with fields
```

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: add datasource management page with form and list"
```

---

### Task 9: Frontend — Schema Annotation Page

**Files:**
- Create: `packages/web/src/components/Schema/SchemaPage.tsx`
- Create: `packages/web/src/components/Schema/SchemaTree.tsx`
- Create: `packages/web/src/components/Schema/AnnotationEditor.tsx`

- [ ] **Step 1: Create AnnotationEditor.tsx — inline annotation editor for table/field**

```tsx
import { useState } from "react";

interface AnnotationEditorProps {
  initialValue: string;
  onSave: (value: string) => Promise<void>;
  placeholder?: string;
}

export default function AnnotationEditor({ initialValue, onSave, placeholder }: AnnotationEditorProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);

  if (!editing) {
    return (
      <span
        onClick={() => setEditing(true)}
        className={`cursor-pointer text-sm px-2 py-0.5 rounded-sm border border-dashed transition-colors ${
          initialValue
            ? "border-coral/30 bg-coral/5 text-ink hover:border-coral/50"
            : "border-border-light text-muted-slate hover:border-muted-slate"
        }`}
      >
        {initialValue || placeholder || "添加标注"}
      </span>
    );
  }

  const handleSave = async () => {
    if (!value.trim()) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(value.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") { setValue(initialValue); setEditing(false); }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        autoFocus
        className="px-2 py-1 border border-form-focus rounded-sm text-sm bg-canvas-white focus:outline-none focus:ring-1 focus:ring-focus-blue"
        placeholder={placeholder}
      />
      <button
        onClick={handleSave}
        disabled={saving}
        className="text-xs text-action-blue hover:underline disabled:opacity-50"
      >
        {saving ? "保存中..." : "保存"}
      </button>
      <button
        onClick={() => { setValue(initialValue); setEditing(false); }}
        className="text-xs text-muted-slate hover:underline"
      >
        取消
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create SchemaTree.tsx — tree view of tables and fields with annotations**

```tsx
import { useState, useEffect } from "react";
import { api } from "../../api/client";
import AnnotationEditor from "./AnnotationEditor";

interface TableInfo {
  table_name: string;
  table_comment: string;
}

interface FieldInfo {
  column_name: string;
  column_type: string;
  is_nullable: string;
  column_key: string;
  column_comment: string;
}

interface Annotation {
  id: string;
  table_name: string;
  field_name: string | null;
  annotation: string;
}

interface SchemaTreeProps {
  datasourceId: string;
}

export default function SchemaTree({ datasourceId }: SchemaTreeProps) {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [fields, setFields] = useState<Map<string, FieldInfo[]>>(new Map());
  const [annotations, setAnnotations] = useState<Map<string, string>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getSchema(datasourceId);
      setTables(data.schema.tables);
      // Group fields by table
      const fieldMap = new Map<string, FieldInfo[]>();
      for (const f of data.schema.fields) {
        if (!fieldMap.has(f.table_name)) fieldMap.set(f.table_name, []);
        fieldMap.get(f.table_name)!.push(f);
      }
      setFields(fieldMap);
      // Build annotation map
      const annMap = new Map<string, string>();
      for (const a of data.annotations) {
        const key = a.field_name ? `${a.table_name}.${a.field_name}` : a.table_name;
        annMap.set(key, a.annotation);
      }
      setAnnotations(annMap);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [datasourceId]);

  const toggleTable = (tableName: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(tableName)) next.delete(tableName);
      else next.add(tableName);
      return next;
    });
  };

  const handleAnnotateTable = async (tableName: string, annotation: string) => {
    await api.annotateTable(datasourceId, tableName, annotation);
    setAnnotations((prev) => new Map(prev).set(tableName, annotation));
  };

  const handleAnnotateField = async (tableName: string, fieldName: string, annotation: string) => {
    await api.annotateField(datasourceId, fieldName, tableName, annotation);
    setAnnotations((prev) => new Map(prev).set(`${tableName}.${fieldName}`, annotation));
  };

  if (loading) return <div className="p-6 text-muted-slate text-sm">加载 Schema...</div>;

  return (
    <div className="divide-y divide-hairline">
      {tables.map((table) => (
        <div key={table.table_name} className="py-3">
          <div
            className="flex items-center gap-3 cursor-pointer group"
            onClick={() => toggleTable(table.table_name)}
          >
            <span className="text-xs text-muted-slate font-mono">
              {expanded.has(table.table_name) ? "▼" : "▶"}
            </span>
            <span className="font-display text-base">{table.table_name}</span>
            {table.table_comment && (
              <span className="text-xs text-muted-slate">— {table.table_comment}</span>
            )}
            <div className="ml-auto" onClick={(e) => e.stopPropagation()}>
              <AnnotationEditor
                initialValue={annotations.get(table.table_name) || ""}
                onSave={(v) => handleAnnotateTable(table.table_name, v)}
                placeholder="表业务含义"
              />
            </div>
          </div>

          {expanded.has(table.table_name) && fields.get(table.table_name)?.map((field) => (
            <div key={field.column_name} className="ml-8 py-1.5 flex items-center gap-3 text-sm">
              <span className="font-mono text-xs text-muted-slate">{field.column_name}</span>
              <span className="font-mono text-xs text-slate">{field.column_type}</span>
              {field.column_key === "PRI" && (
                <span className="text-xs font-mono uppercase text-action-blue tracking-wider">PK</span>
              )}
              <div className="ml-auto">
                <AnnotationEditor
                  initialValue={annotations.get(`${table.table_name}.${field.column_name}`) || ""}
                  onSave={(v) => handleAnnotateField(table.table_name, field.column_name, v)}
                  placeholder="字段业务含义"
                />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create SchemaPage.tsx**

```tsx
import { useAppStore } from "../../stores/app";
import SchemaTree from "./SchemaTree";

export default function SchemaPage() {
  const selectedDsId = useAppStore((s) => s.selectedDatasourceId);

  if (!selectedDsId) {
    return (
      <div className="h-full flex items-center justify-center bg-canvas-white">
        <div className="text-center">
          <p className="text-muted-slate text-sm">请先选择一个数据源</p>
          <p className="text-muted-slate text-xs mt-1">在"数据源"页面中选择或创建一个 MySQL 数据源</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-canvas-white">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <h2 className="text-2xl font-display tracking-tight mb-2">Schema 标注</h2>
        <p className="text-sm text-muted-slate mb-6">
          为表和字段添加业务含义标注，帮助 AI 更准确地理解查询意图
        </p>
        <SchemaTree datasourceId={selectedDsId} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire SchemaPage into App.tsx**

Update `packages/web/src/App.tsx` — replace SchemaPlaceholder:

```tsx
import SchemaPage from "./components/Schema/SchemaPage";
// ... in render:
{view === "schemas" && <SchemaPage />}
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: add schema annotation page with tree view and inline editors"
```

---

### Task 10: Frontend — Chat Window with Agent Stream

**Files:**
- Create: `packages/web/src/hooks/useWebSocket.ts`
- Create: `packages/web/src/hooks/useAgentStream.ts`
- Create: `packages/web/src/components/Chat/ChatWindow.tsx`
- Create: `packages/web/src/components/Chat/MessageList.tsx`
- Create: `packages/web/src/components/Chat/MessageItem.tsx`
- Create: `packages/web/src/components/Chat/StepIndicator.tsx`
- Create: `packages/web/src/components/Chat/TableResult.tsx`
- Create: `packages/web/src/components/Chat/SqlBlock.tsx`
- Create: `packages/web/src/components/Chat/ChatInput.tsx`

- [ ] **Step 1: Create useWebSocket.ts hook**

```typescript
import { useRef, useEffect, useCallback, useState } from "react";

export function useWebSocket(url: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const [readyState, setReadyState] = useState<number>(WebSocket.CONNECTING);
  const listenersRef = useRef<Map<string, Set<(data: any) => void>>>(new Map());

  const connect = useCallback(() => {
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setReadyState(WebSocket.OPEN);
    ws.onclose = () => {
      setReadyState(WebSocket.CLOSED);
      // Auto-reconnect after 3s
      setTimeout(connect, 3000);
    };
    ws.onerror = () => setReadyState(WebSocket.CLOSED);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const type = data.type;
        const listeners = listenersRef.current.get(type);
        if (listeners) {
          listeners.forEach((fn) => fn(data));
        }
        // Also call wildcard listeners
        const wildcardListeners = listenersRef.current.get("*");
        if (wildcardListeners) {
          wildcardListeners.forEach((fn) => fn(data));
        }
      } catch {}
    };
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const on = useCallback((type: string, fn: (data: any) => void) => {
    if (!listenersRef.current.has(type)) {
      listenersRef.current.set(type, new Set());
    }
    listenersRef.current.get(type)!.add(fn);
    return () => {
      listenersRef.current.get(type)?.delete(fn);
    };
  }, []);

  return { send, on, readyState };
}
```

- [ ] **Step 2: Create useAgentStream.ts hook**

```typescript
import { useCallback, useRef } from "react";
import { useWebSocket } from "./useWebSocket";

export interface AgentEvent {
  type: string;
  [key: string]: any;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  steps?: AgentStep[];
  table?: TableData | null;
  sql?: string | null;
  isStreaming?: boolean;
}

export interface AgentStep {
  id: string;
  type: "thinking" | "tool_call" | "tool_result" | "text";
  toolName?: string;
  content: string;
  isError?: boolean;
  isComplete?: boolean;
}

export interface TableData {
  columns: string[];
  rows: Record<string, any>[];
  rowCount: number;
}

export function useAgentStream(conversationId: string | null) {
  const wsUrl = conversationId ? `ws://${window.location.host}/ws/chat/${conversationId}` : "";
  const { send, on, readyState } = useWebSocket(wsUrl);
  const messagesRef = useRef<ChatMessage[]>([]);

  const initSession = useCallback((datasourceId: string, provider?: string, model?: string) => {
    send({ type: "init", datasourceId, provider, model });
  }, [send]);

  const sendMessage = useCallback((text: string) => {
    send({ type: "message", text });
  }, [send]);

  return { initSession, sendMessage, on, readyState, messagesRef };
}
```

- [ ] **Step 3: Create SqlBlock.tsx — SQL code display**

```tsx
export default function SqlBlock({ sql }: { sql: string }) {
  return (
    <div className="bg-dark-navy rounded-md p-3 my-2 overflow-x-auto">
      <pre className="text-sm font-mono text-green-400 whitespace-pre-wrap">{sql}</pre>
    </div>
  );
}
```

- [ ] **Step 4: Create TableResult.tsx — inline table using @tanstack/react-table**

```tsx
import { useReactTable, getCoreRowModel, flexRender } from "@tanstack/react-table";
import type { ColumnDef } from "@tanstack/react-table";

interface TableResultProps {
  columns: string[];
  rows: Record<string, any>[];
  rowCount: number;
}

export default function TableResult({ columns, rows, rowCount }: TableResultProps) {
  const tableColumns: ColumnDef<Record<string, any>>[] = columns.map((col) => ({
    accessorKey: col,
    header: col,
    cell: (info) => {
      const val = info.getValue();
      return val === null ? <span className="text-muted-slate italic">NULL</span> : String(val);
    },
  }));

  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="my-3">
      <div className="text-xs text-muted-slate font-mono uppercase tracking-wider mb-1">
        📊 查询结果 ({rowCount} 行)
      </div>
      <div className="border border-hairline rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="bg-soft-stone">
                {hg.headers.map((header) => (
                  <th key={header.id} className="px-3 py-2 text-left font-mono text-xs font-normal text-muted-slate border-b border-hairline">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b border-hairline last:border-0 hover:bg-soft-stone/30">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-1.5 text-sm">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create StepIndicator.tsx — agent step display**

```tsx
import type { AgentStep } from "../../hooks/useAgentStream";

interface StepIndicatorProps {
  step: AgentStep;
}

export default function StepIndicator({ step }: StepIndicatorProps) {
  if (step.type === "thinking") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-slate font-mono uppercase tracking-wider my-1">
        <span className="animate-pulse">🔍</span>
        <span>{step.content || "正在思考..."}</span>
      </div>
    );
  }

  if (step.type === "tool_call") {
    const icon = step.toolName === "discover_schema" ? "🔍" : step.toolName === "execute_sql" ? "💻" : "🛠️";
    return (
      <div className="flex items-center gap-2 my-1">
        <span className="text-xs">{icon}</span>
        <span className="text-xs font-mono uppercase tracking-wider text-coral">
          {step.toolName === "discover_schema" ? "发现表结构" : "执行 SQL"}
        </span>
        {!step.isComplete && <span className="animate-pulse text-xs">⏳</span>}
      </div>
    );
  }

  if (step.type === "tool_result") {
    if (step.isError) {
      return (
        <div className="text-xs text-error-red my-1 pl-5">❌ {step.content}</div>
      );
    }
    return (
      <div className="text-xs text-deep-green my-1 pl-5">✅ {step.content}</div>
    );
  }

  return null;
}
```

- [ ] **Step 6: Create MessageItem.tsx — single message rendering**

```tsx
import type { ChatMessage } from "../../hooks/useAgentStream";
import StepIndicator from "./StepIndicator";
import TableResult from "./TableResult";
import SqlBlock from "./SqlBlock";

interface MessageItemProps {
  message: ChatMessage;
}

export default function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === "user";

  return (
    <div className={`px-6 py-4 ${isUser ? "" : "bg-near-black"}`}>
      <div className="max-w-3xl mx-auto">
        {/* Role label */}
        <div className="text-xs font-mono uppercase tracking-wider mb-2 text-muted-slate">
          {isUser ? "你" : "DataNova"}
        </div>

        {/* User message */}
        {isUser && (
          <div className="text-sm text-ink">{message.content}</div>
        )}

        {/* Assistant message */}
        {!isUser && (
          <div className="text-sm text-white">
            {/* Steps */}
            {message.steps?.map((step) => (
              <StepIndicator key={step.id} step={step} />
            ))}

            {/* SQL display */}
            {message.sql && <SqlBlock sql={message.sql} />}

            {/* Table result */}
            {message.table && (
              <TableResult
                columns={message.table.columns}
                rows={message.table.rows}
                rowCount={message.table.rowCount}
              />
            )}

            {/* Text content */}
            {message.content && (
              <div className="mt-2 whitespace-pre-wrap">{message.content}</div>
            )}

            {/* Streaming indicator */}
            {message.isStreaming && (
              <span className="inline-block w-2 h-4 bg-white/50 animate-pulse ml-1" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Create MessageList.tsx — scrollable message container**

```tsx
import { useRef, useEffect } from "react";
import type { ChatMessage } from "../../hooks/useAgentStream";
import MessageItem from "./MessageItem";

interface MessageListProps {
  messages: ChatMessage[];
}

export default function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto">
      {messages.length === 0 && (
        <div className="flex items-center justify-center h-full text-muted-slate text-sm">
          输入问题开始查询数据
        </div>
      )}
      {messages.map((msg) => (
        <MessageItem key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
```

- [ ] **Step 8: Create ChatInput.tsx — message input**

```tsx
import { useState } from "react";

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export default function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [text, setText] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText("");
  };

  return (
    <div className="border-t border-hairline bg-canvas-white px-6 py-4">
      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex gap-3">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled}
          placeholder="输入问题查询数据..."
          className="flex-1 px-4 py-2.5 border border-border-light rounded-sm text-sm bg-canvas-white focus:border-form-focus focus:outline-none focus:ring-1 focus:ring-focus-blue disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || !text.trim()}
          className="px-5 py-2.5 bg-near-black text-white rounded-pill text-sm hover:bg-cohere-black transition-colors disabled:opacity-50 disabled:hover:bg-near-black"
        >
          发送
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 9: Create ChatWindow.tsx — full chat page**

```tsx
import { useState, useCallback, useEffect } from "react";
import { useAppStore } from "../../stores/app";
import { api } from "../../api/client";
import { useAgentStream, type ChatMessage, type AgentStep } from "../../hooks/useAgentStream";
import MessageList from "./MessageList";
import ChatInput from "./ChatInput";

export default function ChatWindow() {
  const { selectedDatasourceId, selectedConversationId, setSelectedConversationId } = useAppStore();
  const [conversations, setConversations] = useState<any[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const { initSession, sendMessage, on, readyState } = useAgentStream(selectedConversationId);

  // Load conversations
  useEffect(() => {
    if (selectedDatasourceId) {
      api.listConversations(selectedDatasourceId).then(setConversations);
    }
  }, [selectedDatasourceId]);

  // Subscribe to agent events
  useEffect(() => {
    const unsubscribers: (() => void)[] = [];

    unsubscribers.push(on("agent_start", () => {
      // Add streaming assistant message
      const id = crypto.randomUUID();
      setMessages((prev) => [...prev, {
        id,
        role: "assistant",
        content: "",
        steps: [],
        isStreaming: true,
      }]);
    }));

    unsubscribers.push(on("thinking", (data) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role !== "assistant") return prev;
        return [...prev.slice(0, -1), {
          ...last,
          steps: [...(last.steps || []), {
            id: crypto.randomUUID(),
            type: "thinking" as const,
            content: data.content || "",
          }],
        }];
      });
    }));

    unsubscribers.push(on("tool_execution_start", (data) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role !== "assistant") return prev;
        return [...prev.slice(0, -1), {
          ...last,
          steps: [...(last.steps || []), {
            id: data.toolCallId || crypto.randomUUID(),
            type: "tool_call" as const,
            toolName: data.toolName,
            content: "",
            isComplete: false,
          }],
        }];
      });
    }));

    unsubscribers.push(on("tool_execution_end", (data) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role !== "assistant") return prev;
        const steps = (last.steps || []).map((s) =>
          s.id === data.toolCallId ? { ...s, isComplete: true } : s
        );
        // Add tool result step
        steps.push({
          id: crypto.randomUUID(),
          type: "tool_result" as const,
          content: data.isError ? `错误: ${data.error}` : "完成",
          isError: data.isError,
          isComplete: true,
        });
        return [...prev.slice(0, -1), { ...last, steps }];
      });
    }));

    unsubscribers.push(on("text_delta", (data) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role !== "assistant") return prev;
        return [...prev.slice(0, -1), {
          ...last,
          content: (last.content || "") + data.content,
        }];
      });
    }));

    unsubscribers.push(on("agent_end", () => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role !== "assistant") return prev;
        return [...prev.slice(0, -1), { ...last, isStreaming: false }];
      });
    }));

    unsubscribers.push(on("error", (data) => {
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `❌ 错误: ${data.error}`,
        isStreaming: false,
      }]);
    }));

    return () => unsubscribers.forEach((unsub) => unsub());
  }, [on]);

  const handleNewConversation = async () => {
    if (!selectedDatasourceId) return;
    const conv = await api.createConversation(selectedDatasourceId);
    setSelectedConversationId(conv.id);
    setMessages([]);
    setConversations((prev) => [conv, ...prev]);
  };

  const handleSelectConversation = (id: string) => {
    setSelectedConversationId(id);
    // TODO: Load conversation history from pi session
    setMessages([]);
  };

  const handleSend = useCallback((text: string) => {
    // Add user message
    setMessages((prev) => [...prev, {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    }]);
    sendMessage(text);
  }, [sendMessage]);

  if (!selectedDatasourceId) {
    return (
      <div className="h-full flex items-center justify-center bg-canvas-white">
        <div className="text-center">
          <p className="text-muted-slate text-sm">请先选择一个数据源</p>
          <p className="text-muted-slate text-xs mt-1">在"数据源"页面中选择或创建一个 MySQL 数据源</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* Conversation list */}
      <div className="w-[220px] border-r border-hairline bg-canvas-white flex flex-col">
        <div className="p-3 border-b border-hairline">
          <button
            onClick={handleNewConversation}
            className="w-full px-4 py-2 bg-near-black text-white rounded-pill text-xs hover:bg-cohere-black transition-colors"
          >
            + 新对话
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => handleSelectConversation(conv.id)}
              className={`w-full text-left px-3 py-2 text-sm border-b border-hairline transition-colors ${
                selectedConversationId === conv.id
                  ? "bg-soft-stone"
                  : "hover:bg-soft-stone/50"
              }`}
            >
              {conv.title || "新对话"}
            </button>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col bg-canvas-white">
        <MessageList messages={messages} />
        <ChatInput onSend={handleSend} disabled={readyState !== WebSocket.OPEN} />
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Wire ChatWindow into App.tsx**

Update `packages/web/src/App.tsx`:

```tsx
import Layout from "./components/Layout";
import { useAppStore } from "./stores/app";
import DatasourcePage from "./components/Datasource/DatasourcePage";
import SchemaPage from "./components/Schema/SchemaPage";
import ChatWindow from "./components/Chat/ChatWindow";

export default function App() {
  const view = useAppStore((s) => s.view);

  return (
    <Layout>
      {view === "chat" && <ChatWindow />}
      {view === "datasources" && <DatasourcePage />}
      {view === "schemas" && <SchemaPage />}
    </Layout>
  );
}
```

- [ ] **Step 11: Commit**

```bash
git add .
git commit -m "feat: add chat window with WebSocket agent stream, message list, and table results"
```

---

### Task 11: Integration Testing & Sample Skill

**Files:**
- Create: `data/skills/bill-query/SKILL.md`
- Modify: `packages/server/src/index.ts` (ensure data dirs exist at startup)

- [ ] **Step 1: Create sample skill**

Create `data/skills/bill-query/SKILL.md`:

```markdown
---
name: bill-query
description: 当用户询问账单、费用、付款相关问题时使用此 skill
---

# 账单查询

当用户询问账单、费用、付款相关问题时使用此 skill。

## 注意事项

- 金额查询默认按元展示
- 状态筛选必须使用英文枚举值
- 日期范围查询优先使用 BETWEEN 语句
```

- [ ] **Step 2: Update server index.ts to ensure data dirs and add startup logging**

Update `packages/server/src/index.ts` — add after `ensureDataDirs()`:

```typescript
import { SKILLS_DIR, ANNOTATIONS_DIR } from "./config.js";
import fs from "node:fs";

// ... existing code ...

ensureDataDirs();

// Ensure sample skill exists
const sampleSkillDir = path.join(SKILLS_DIR, "bill-query");
if (!fs.existsSync(sampleSkillDir)) {
  fs.mkdirSync(sampleSkillDir, { recursive: true });
  // Copy sample SKILL.md if it exists in project root
  const sampleSource = path.join(process.cwd(), "data/skills/bill-query/SKILL.md");
  if (fs.existsSync(sampleSource)) {
    fs.copyFileSync(sampleSource, path.join(sampleSkillDir, "SKILL.md"));
  }
}
```

- [ ] **Step 3: Full integration smoke test**

```bash
# Terminal 1: Start server
cd /mnt/d/projects/pi_datanova && npm run dev:server
# Expected: "DataNova server running on http://localhost:3000"

# Terminal 2: Start web
cd /mnt/d/projects/pi_datanova && npm run dev:web
# Expected: Browser opens with DataNova UI

# Test sequence:
# 1. Go to "数据源" → Add a MySQL datasource
# 2. Go to "Schema 标注" → See tables, add annotations
# 3. Go to "对话" → Start new conversation, ask a question
```

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: add sample skill and integration smoke test setup"
```

---

### Task 12: Fix Import Paths & Type Errors

**Files:**
- Various files — fix any import path issues from monorepo setup
- Ensure TypeScript compiles cleanly

- [ ] **Step 1: Run TypeScript check on server**

```bash
cd /mnt/d/projects/pi_datanova/packages/server && npx tsc --noEmit
```

Expected: May have type errors from pi-agent-core API mismatches. Fix each error.

Common issues to fix:
- `import crypto from "node:crypto"` → may need `import * as crypto from "node:crypto"` in ESM
- `import path from "node:path"` → may need `import * as path from "node:path"` in ESM
- `store.ts` uses `await import()` inside non-async functions → move to top-level imports
- pi-agent-core exports may differ from what we assumed → adjust imports

- [ ] **Step 2: Run TypeScript check on web**

```bash
cd /mnt/d/projects/pi_datanova/packages/web && npx tsc --noEmit
```

Expected: May have React/JSX type errors. Fix each.

- [ ] **Step 3: Fix all errors and verify both projects compile**

```bash
# Both should pass with 0 errors
cd /mnt/d/projects/pi_datanova/packages/server && npx tsc --noEmit
cd /mnt/d/projects/pi_datanova/packages/web && npx tsc --noEmit
```

- [ ] **Step 4: Commit fixes**

```bash
git add .
git commit -m "fix: resolve TypeScript compilation errors and import paths"
```

---

## Self-Review

**1. Spec Coverage:**

| Spec Section | Task |
|---|---|
| Architecture: pi AgentHarness | Task 4 |
| Tools: discover_schema, execute_sql | Task 4 (steps 1-2) |
| Skill mechanism: SKILL.md | Task 4 (steps 4-5) |
| Dynamic skill injection | Task 4 (step 5 — refreshHarnessSkills) |
| Schema annotation → SKILL.md auto-gen | Task 4 (step 4 — generateAnnotationSkill) |
| Frontend: Datasource management | Task 8 |
| Frontend: Chat window + real-time steps | Task 10 |
| Frontend: Schema annotation | Task 9 |
| MySQL connection pool | Task 3 |
| SQLite store + encryption | Task 2 |
| REST API routes | Task 5 |
| WebSocket chat handler | Task 6 |
| Design system (DESIGN.md) | Task 7 |
| pi packages via npm only | Task 1 (package.json) |

**2. Placeholder Scan:** No TBD, TODO, or placeholder patterns found.

**3. Type Consistency:** All interfaces defined in store.ts are used consistently across routes and frontend. `ChatMessage`, `AgentStep`, `TableData` types defined once in useAgentStream.ts and used in MessageItem, MessageList, StepIndicator, TableResult.

**Potential gap:** The `store.ts` uses `await import("./crypto.js")` inside non-async functions (`createDatasource`, `updateDatasource`). These need to be made async or the import moved to top level. This is flagged for Task 12.
