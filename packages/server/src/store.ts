import * as crypto from "node:crypto";
import Database from "better-sqlite3";
import { DB_PATH } from "./config.js";
import type { Datasource, SchemaAnnotation, Conversation } from "./types.js";

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    initTables(db);
  }
  return db;
}

function initTables(database: Database.Database): void {
  // Datasources table
  database.exec(`
    CREATE TABLE IF NOT EXISTS datasources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      host TEXT NOT NULL,
      port INTEGER NOT NULL,
      database TEXT NOT NULL,
      user TEXT NOT NULL,
      password TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Schema annotations table
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_annotations (
      id TEXT PRIMARY KEY,
      datasource_id TEXT NOT NULL,
      table_name TEXT NOT NULL,
      field_name TEXT,
      annotation TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (datasource_id) REFERENCES datasources(id) ON DELETE CASCADE,
      UNIQUE(datasource_id, table_name, field_name)
    )
  `);

  // Conversations table
  database.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT,
      datasource_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (datasource_id) REFERENCES datasources(id) ON DELETE SET NULL
    )
  `);

  // App config table
  database.exec(`
    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// Generate UUID
function generateId(): string {
  return crypto.randomUUID();
}

// ==================== Datasource CRUD ====================

export function listDatasources(): Datasource[] {
  const stmt = getDb().prepare(`
    SELECT id, name, host, port, database, user, password, enabled, created_at, updated_at
    FROM datasources
    ORDER BY name
  `);
  return stmt.all() as Datasource[];
}

export function getDatasource(id: string): Datasource | undefined {
  const stmt = getDb().prepare(`
    SELECT id, name, host, port, database, user, password, enabled, created_at, updated_at
    FROM datasources
    WHERE id = ?
  `);
  return stmt.get(id) as Datasource | undefined;
}

export async function createDatasource(input: Omit<Datasource, "id" | "created_at" | "updated_at">): Promise<Datasource> {
  const { encrypt } = await import("./crypto.js");
  const id = generateId();
  const encryptedPassword = encrypt(input.password);

  const stmt = getDb().prepare(`
    INSERT INTO datasources (id, name, host, port, database, user, password, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    input.name,
    input.host,
    input.port,
    input.database,
    input.user,
    encryptedPassword,
    input.enabled ? 1 : 0
  );

  return getDatasource(id)!;
}

export async function updateDatasource(id: string, input: Partial<Omit<Datasource, "id" | "created_at" | "updated_at">>): Promise<Datasource | undefined> {
  const ds = getDatasource(id);
  if (!ds) return undefined;

  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (input.name !== undefined) {
    updates.push("name = ?");
    values.push(input.name);
  }
  if (input.host !== undefined) {
    updates.push("host = ?");
    values.push(input.host);
  }
  if (input.port !== undefined) {
    updates.push("port = ?");
    values.push(input.port);
  }
  if (input.database !== undefined) {
    updates.push("database = ?");
    values.push(input.database);
  }
  if (input.user !== undefined) {
    updates.push("user = ?");
    values.push(input.user);
  }
  if (input.password !== undefined) {
    const { encrypt } = await import("./crypto.js");
    updates.push("password = ?");
    values.push(encrypt(input.password));
  }
  if (input.enabled !== undefined) {
    updates.push("enabled = ?");
    values.push(input.enabled ? 1 : 0);
  }

  if (updates.length === 0) return ds;

  updates.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id);

  const stmt = getDb().prepare(`
    UPDATE datasources
    SET ${updates.join(", ")}
    WHERE id = ?
  `);

  stmt.run(...values);
  return getDatasource(id);
}

export function deleteDatasource(id: string): boolean {
  const stmt = getDb().prepare("DELETE FROM datasources WHERE id = ?");
  const result = stmt.run(id);
  return result.changes > 0;
}

// ==================== Schema Annotations CRUD ====================

export function getAnnotations(datasourceId: string): SchemaAnnotation[] {
  const stmt = getDb().prepare(`
    SELECT id, datasource_id, table_name, field_name, annotation, created_at, updated_at
    FROM schema_annotations
    WHERE datasource_id = ?
    ORDER BY table_name, field_name
  `);
  return stmt.all(datasourceId) as SchemaAnnotation[];
}

export function upsertAnnotation(input: Omit<SchemaAnnotation, "id" | "created_at" | "updated_at">): SchemaAnnotation {
  const existing = getDb().prepare(`
    SELECT id FROM schema_annotations
    WHERE datasource_id = ? AND table_name = ? AND field_name IS ?
  `).get(input.datasource_id, input.table_name, input.field_name ?? null);

  if (existing) {
    const stmt = getDb().prepare(`
      UPDATE schema_annotations
      SET annotation = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(input.annotation, (existing as { id: string }).id);
    return getDb().prepare(`
      SELECT id, datasource_id, table_name, field_name, annotation, created_at, updated_at
      FROM schema_annotations
      WHERE id = ?
    `).get((existing as { id: string }).id) as SchemaAnnotation;
  }

  const id = generateId();
  const stmt = getDb().prepare(`
    INSERT INTO schema_annotations (id, datasource_id, table_name, field_name, annotation)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(id, input.datasource_id, input.table_name, input.field_name ?? null, input.annotation);

  return getDb().prepare(`
    SELECT id, datasource_id, table_name, field_name, annotation, created_at, updated_at
    FROM schema_annotations
    WHERE id = ?
  `).get(id) as SchemaAnnotation;
}

export function deleteAnnotation(id: string): boolean {
  const stmt = getDb().prepare("DELETE FROM schema_annotations WHERE id = ?");
  const result = stmt.run(id);
  return result.changes > 0;
}

// ==================== Conversations CRUD ====================

export function listConversations(datasourceId?: string): Conversation[] {
  let stmt;
  if (datasourceId) {
    stmt = getDb().prepare(`
      SELECT id, title, datasource_id, created_at, updated_at
      FROM conversations
      WHERE datasource_id = ?
      ORDER BY updated_at DESC
    `);
    return stmt.all(datasourceId) as Conversation[];
  }

  stmt = getDb().prepare(`
    SELECT id, title, datasource_id, created_at, updated_at
    FROM conversations
    ORDER BY updated_at DESC
  `);
  return stmt.all() as Conversation[];
}

export function createConversation(input: { title?: string; datasourceId?: string }): Conversation {
  const id = generateId();
  const stmt = getDb().prepare(`
    INSERT INTO conversations (id, title, datasource_id)
    VALUES (?, ?, ?)
  `);
  stmt.run(id, input.title ?? null, input.datasourceId ?? null);

  return getDb().prepare(`
    SELECT id, title, datasource_id, created_at, updated_at
    FROM conversations
    WHERE id = ?
  `).get(id) as Conversation;
}

export function deleteConversation(id: string): boolean {
  const stmt = getDb().prepare("DELETE FROM conversations WHERE id = ?");
  const result = stmt.run(id);
  return result.changes > 0;
}

export function updateConversationTitle(id: string, title: string): Conversation | undefined {
  const stmt = getDb().prepare(`
    UPDATE conversations
    SET title = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  stmt.run(title, id);

  return getDb().prepare(`
    SELECT id, title, datasource_id, created_at, updated_at
    FROM conversations
    WHERE id = ?
  `).get(id) as Conversation | undefined;
}

// ==================== App Config ====================

export function getConfig(key: string): string | undefined {
  const stmt = getDb().prepare("SELECT value FROM app_config WHERE key = ?");
  const result = stmt.get(key) as { value: string } | undefined;
  return result?.value;
}

export function setConfig(key: string, value: string): void {
  const stmt = getDb().prepare(`
    INSERT INTO app_config (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);
  stmt.run(key, value);
}

// Close database connection
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
