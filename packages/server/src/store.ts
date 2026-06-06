import * as crypto from "node:crypto";
import Database from "better-sqlite3";
import { DB_PATH } from "./config.js";
import type { Datasource, SchemaAnnotation, Conversation, StoredMessage, TableQueryExample, QueryFeedback, QueryExample, SemanticMetric, SemanticDimension, SemanticModel, ScheduledQuery, QueryAlert, QueryExecutionHistory } from "./types.js";

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
      status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('draft', 'confirmed')),
      domain_type TEXT CHECK(domain_type IS NULL OR domain_type IN ('enum', 'range')),
      domain_values TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (datasource_id) REFERENCES datasources(id) ON DELETE CASCADE,
      UNIQUE(datasource_id, table_name, field_name)
    )
  `);

  // Migration: add new columns to existing schema_annotations table
  const annotationColumns = (database.pragma("table_info(schema_annotations)") as Array<{ name: string }>).map(c => c.name);
  if (!annotationColumns.includes("status")) {
    database.exec(`ALTER TABLE schema_annotations ADD COLUMN status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('draft', 'confirmed'))`);
  }
  if (!annotationColumns.includes("domain_type")) {
    database.exec(`ALTER TABLE schema_annotations ADD COLUMN domain_type TEXT CHECK(domain_type IS NULL OR domain_type IN ('enum', 'range'))`);
  }
  if (!annotationColumns.includes("domain_values")) {
    database.exec(`ALTER TABLE schema_annotations ADD COLUMN domain_values TEXT`);
  }

  // Table query examples
  database.exec(`
    CREATE TABLE IF NOT EXISTS table_query_examples (
      id TEXT PRIMARY KEY,
      datasource_id TEXT NOT NULL,
      table_name TEXT NOT NULL,
      question TEXT NOT NULL,
      sql TEXT NOT NULL,
      is_verified INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (datasource_id) REFERENCES datasources(id) ON DELETE CASCADE
    )
  `);

  // Query examples (auto-saved from conversations)
  database.exec(`
    CREATE TABLE IF NOT EXISTS query_examples (
      id TEXT PRIMARY KEY,
      datasource_id TEXT NOT NULL,
      conversation_id TEXT,
      question TEXT NOT NULL,
      sql TEXT NOT NULL,
      tables_used TEXT NOT NULL DEFAULT '[]',
      difficulty TEXT NOT NULL DEFAULT 'simple' CHECK(difficulty IN ('simple', 'medium', 'complex')),
      success_count INTEGER DEFAULT 1,
      is_verified INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (datasource_id) REFERENCES datasources(id) ON DELETE CASCADE
    )
  `);

  // Query feedback
  database.exec(`
    CREATE TABLE IF NOT EXISTS query_feedback (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      rating TEXT NOT NULL CHECK(rating IN ('positive', 'negative')),
      issue_type TEXT,
      issue_detail TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Schema version tracking
  const currentVersion = getConfig("schema_version");
  if (!currentVersion) setConfig("schema_version", "2");

  // ==================== Semantic Layer (Phase 2) ====================

  database.exec(`
    CREATE TABLE IF NOT EXISTS semantic_metrics (
      id TEXT PRIMARY KEY,
      datasource_id TEXT NOT NULL,
      name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      sql_expression TEXT NOT NULL,
      filters TEXT NOT NULL DEFAULT '[]',
      dimensions TEXT NOT NULL DEFAULT '[]',
      default_granularity TEXT,
      unit TEXT,
      category TEXT,
      aliases TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'deprecated')),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (datasource_id) REFERENCES datasources(id) ON DELETE CASCADE,
      UNIQUE(datasource_id, name)
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS semantic_dimensions (
      id TEXT PRIMARY KEY,
      datasource_id TEXT NOT NULL,
      name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      sql_expression TEXT NOT NULL,
      data_type TEXT NOT NULL DEFAULT 'string' CHECK(data_type IN ('string', 'number', 'date')),
      hierarchy TEXT,
      values TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (datasource_id) REFERENCES datasources(id) ON DELETE CASCADE,
      UNIQUE(datasource_id, name)
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS semantic_models (
      id TEXT PRIMARY KEY,
      datasource_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      base_table TEXT NOT NULL,
      joins TEXT NOT NULL DEFAULT '[]',
      metrics TEXT NOT NULL DEFAULT '[]',
      dimensions TEXT NOT NULL DEFAULT '[]',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (datasource_id) REFERENCES datasources(id) ON DELETE CASCADE,
      UNIQUE(datasource_id, name)
    )
  `);

  // ==================== Scheduled Queries (Phase 4) ====================

  database.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_queries (
      id TEXT PRIMARY KEY,
      datasource_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      sql TEXT NOT NULL,
      cron_expression TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'UTC',
      enabled INTEGER NOT NULL DEFAULT 1,
      alert_conditions TEXT,
      last_run_at TEXT,
      last_run_status TEXT CHECK(last_run_status IS NULL OR last_run_status IN ('success', 'error')),
      last_run_result TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (datasource_id) REFERENCES datasources(id) ON DELETE CASCADE
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS query_alerts (
      id TEXT PRIMARY KEY,
      scheduled_query_id TEXT NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('warning', 'critical')),
      condition_triggered TEXT NOT NULL,
      actual_value TEXT NOT NULL,
      threshold TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (scheduled_query_id) REFERENCES scheduled_queries(id) ON DELETE CASCADE
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS query_execution_history (
      id TEXT PRIMARY KEY,
      scheduled_query_id TEXT NOT NULL,
      executed_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('success', 'error')),
      result_summary TEXT,
      execution_time_ms INTEGER,
      row_count INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (scheduled_query_id) REFERENCES scheduled_queries(id) ON DELETE CASCADE
    )
  `);

  setConfig("schema_version", "3");

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

  // Messages table
  database.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL DEFAULT '',
      steps TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    )
  `);
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_conversation
    ON messages(conversation_id, created_at ASC)
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
    SELECT id, datasource_id, table_name, field_name, annotation, status, domain_type, domain_values, created_at, updated_at
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
      SET annotation = ?, status = ?, domain_type = ?, domain_values = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(input.annotation, input.status, input.domain_type ?? null, input.domain_values ?? null, (existing as { id: string }).id);
    return getDb().prepare(`
      SELECT id, datasource_id, table_name, field_name, annotation, status, domain_type, domain_values, created_at, updated_at
      FROM schema_annotations WHERE id = ?
    `).get((existing as { id: string }).id) as SchemaAnnotation;
  }

  const id = generateId();
  const stmt = getDb().prepare(`
    INSERT INTO schema_annotations (id, datasource_id, table_name, field_name, annotation, status, domain_type, domain_values)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, input.datasource_id, input.table_name, input.field_name ?? null, input.annotation, input.status, input.domain_type ?? null, input.domain_values ?? null);

  return getDb().prepare(`
    SELECT id, datasource_id, table_name, field_name, annotation, status, domain_type, domain_values, created_at, updated_at
    FROM schema_annotations WHERE id = ?
  `).get(id) as SchemaAnnotation;
}

export function upsertDomainAnnotation(
  input: Omit<SchemaAnnotation, "id" | "created_at" | "updated_at"> & {
    domain_type: "enum" | "range";
    domain_values: string;
  }
): SchemaAnnotation {
  return upsertAnnotation(input);
}

export function confirmAnnotation(id: string): SchemaAnnotation | undefined {
  getDb().prepare(`
    UPDATE schema_annotations SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(id);
  return getDb().prepare(`
    SELECT id, datasource_id, table_name, field_name, annotation, status, domain_type, domain_values, created_at, updated_at
    FROM schema_annotations WHERE id = ?
  `).get(id) as SchemaAnnotation | undefined;
}

export function deleteAnnotation(id: string): boolean {
  const stmt = getDb().prepare("DELETE FROM schema_annotations WHERE id = ?");
  const result = stmt.run(id);
  return result.changes > 0;
}

// ==================== Table Query Examples CRUD ====================

export function listQueryExamples(datasourceId: string, tableName?: string): TableQueryExample[] {
  if (tableName) {
    const stmt = getDb().prepare(`
      SELECT * FROM table_query_examples WHERE datasource_id = ? AND table_name = ? ORDER BY created_at DESC
    `);
    return stmt.all(datasourceId, tableName) as TableQueryExample[];
  }
  const stmt = getDb().prepare(`
    SELECT * FROM table_query_examples WHERE datasource_id = ? ORDER BY table_name, created_at DESC
  `);
  return stmt.all(datasourceId) as TableQueryExample[];
}

export function createQueryExample(input: Omit<TableQueryExample, "id" | "is_verified" | "created_at" | "updated_at">): TableQueryExample {
  const id = generateId();
  getDb().prepare(`
    INSERT INTO table_query_examples (id, datasource_id, table_name, question, sql)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, input.datasource_id, input.table_name, input.question, input.sql);
  return getDb().prepare(`SELECT * FROM table_query_examples WHERE id = ?`).get(id) as TableQueryExample;
}

export function updateQueryExample(id: string, input: Partial<Pick<TableQueryExample, "question" | "sql" | "is_verified" | "table_name">>): TableQueryExample | undefined {
  const updates: string[] = [];
  const values: (string | number)[] = [];
  if (input.question !== undefined) { updates.push("question = ?"); values.push(input.question); }
  if (input.sql !== undefined) { updates.push("sql = ?"); values.push(input.sql); }
  if (input.is_verified !== undefined) { updates.push("is_verified = ?"); values.push(input.is_verified); }
  if (input.table_name !== undefined) { updates.push("table_name = ?"); values.push(input.table_name); }
  if (updates.length === 0) return getDb().prepare(`SELECT * FROM table_query_examples WHERE id = ?`).get(id) as TableQueryExample | undefined;
  updates.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id);
  getDb().prepare(`UPDATE table_query_examples SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  return getDb().prepare(`SELECT * FROM table_query_examples WHERE id = ?`).get(id) as TableQueryExample | undefined;
}

export function deleteQueryExample(id: string): boolean {
  return getDb().prepare("DELETE FROM table_query_examples WHERE id = ?").run(id).changes > 0;
}

// ==================== Query Examples (Auto-Saved) CRUD ====================

export function listAutoQueryExamples(datasourceId: string): QueryExample[] {
  return getDb().prepare(`
    SELECT * FROM query_examples WHERE datasource_id = ? ORDER BY success_count DESC, created_at DESC
  `).all(datasourceId) as QueryExample[];
}

export function saveQueryExample(input: Omit<QueryExample, "id" | "created_at" | "updated_at">): QueryExample {
  const id = generateId();
  getDb().prepare(`
    INSERT INTO query_examples (id, datasource_id, conversation_id, question, sql, tables_used, difficulty, success_count, is_verified)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.datasource_id, input.conversation_id ?? null, input.question, input.sql, input.tables_used, input.difficulty, input.success_count, input.is_verified);
  return getDb().prepare(`SELECT * FROM query_examples WHERE id = ?`).get(id) as QueryExample;
}

export function findQueryExampleByMessageId(messageId: string): QueryExample | undefined {
  // Find by matching the conversation's SQL with the query examples
  return undefined; // Placeholder — requires message-to-SQL mapping
}

// ==================== Query Feedback CRUD ====================

export function saveFeedback(input: Omit<QueryFeedback, "id" | "created_at">): QueryFeedback {
  const id = generateId();
  getDb().prepare(`
    INSERT INTO query_feedback (id, message_id, conversation_id, rating, issue_type, issue_detail)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, input.message_id, input.conversation_id, input.rating, input.issue_type ?? null, input.issue_detail ?? null);
  return getDb().prepare(`SELECT * FROM query_feedback WHERE id = ?`).get(id) as QueryFeedback;
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
  // Messages are deleted by CASCADE, but delete explicitly for safety
  getDb().prepare("DELETE FROM messages WHERE conversation_id = ?").run(id);
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

// ==================== Messages CRUD ====================

export interface SaveMessageInput {
  id?: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  steps?: unknown[];  // AgentStep[] serialized to JSON
}

export function saveMessage(input: SaveMessageInput): StoredMessage {
  const id = input.id ?? generateId();
  const stepsJson = input.steps ? JSON.stringify(input.steps) : null;

  const stmt = getDb().prepare(`
    INSERT INTO messages (id, conversation_id, role, content, steps)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET content = excluded.content, steps = excluded.steps
  `);
  stmt.run(id, input.conversationId, input.role, input.content, stepsJson);

  // Touch conversation updated_at
  getDb().prepare(`
    UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(input.conversationId);

  return getDb().prepare(`
    SELECT id, conversation_id, role, content, steps, created_at
    FROM messages WHERE id = ?
  `).get(id) as StoredMessage;
}

export function listMessages(conversationId: string): StoredMessage[] {
  const stmt = getDb().prepare(`
    SELECT id, conversation_id, role, content, steps, created_at
    FROM messages
    WHERE conversation_id = ?
    ORDER BY created_at ASC
  `);
  return stmt.all(conversationId) as StoredMessage[];
}

// ==================== Semantic Metrics CRUD ====================

export function listMetrics(datasourceId: string): SemanticMetric[] {
  return getDb().prepare(`
    SELECT * FROM semantic_metrics WHERE datasource_id = ? ORDER BY category, name
  `).all(datasourceId) as SemanticMetric[];
}

export function getMetric(id: string): SemanticMetric | undefined {
  return getDb().prepare(`SELECT * FROM semantic_metrics WHERE id = ?`).get(id) as SemanticMetric | undefined;
}

export function createMetric(input: Omit<SemanticMetric, "id" | "created_at" | "updated_at">): SemanticMetric {
  const id = generateId();
  getDb().prepare(`
    INSERT INTO semantic_metrics (id, datasource_id, name, display_name, description, sql_expression, filters, dimensions, default_granularity, unit, category, aliases, status, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.datasource_id, input.name, input.display_name, input.description, input.sql_expression, input.filters, input.dimensions, input.default_granularity ?? null, input.unit ?? null, input.category ?? null, input.aliases, input.status, input.version ?? 1);
  return getMetric(id)!;
}

export function updateMetric(id: string, input: Partial<Omit<SemanticMetric, "id" | "datasource_id" | "created_at" | "updated_at">>): SemanticMetric | undefined {
  const updates: string[] = [];
  const values: unknown[] = [];
  const fields = ["name", "display_name", "description", "sql_expression", "filters", "dimensions", "default_granularity", "unit", "category", "aliases", "status"];
  for (const f of fields) {
    if ((input as any)[f] !== undefined) {
      updates.push(`${f} = ?`);
      values.push((input as any)[f]);
    }
  }
  if (updates.length === 0) return getMetric(id);
  updates.push("version = version + 1");
  updates.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id);
  getDb().prepare(`UPDATE semantic_metrics SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  return getMetric(id);
}

export function deleteMetric(id: string): boolean {
  return getDb().prepare("DELETE FROM semantic_metrics WHERE id = ?").run(id).changes > 0;
}

// ==================== Semantic Dimensions CRUD ====================

export function listDimensions(datasourceId: string): SemanticDimension[] {
  return getDb().prepare(`
    SELECT * FROM semantic_dimensions WHERE datasource_id = ? ORDER BY name
  `).all(datasourceId) as SemanticDimension[];
}

export function getDimension(id: string): SemanticDimension | undefined {
  return getDb().prepare(`SELECT * FROM semantic_dimensions WHERE id = ?`).get(id) as SemanticDimension | undefined;
}

export function createDimension(input: Omit<SemanticDimension, "id" | "created_at" | "updated_at">): SemanticDimension {
  const id = generateId();
  getDb().prepare(`
    INSERT INTO semantic_dimensions (id, datasource_id, name, display_name, sql_expression, data_type, hierarchy, values)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.datasource_id, input.name, input.display_name, input.sql_expression, input.data_type, input.hierarchy ?? null, input.values ?? null);
  return getDimension(id)!;
}

export function updateDimension(id: string, input: Partial<Omit<SemanticDimension, "id" | "datasource_id" | "created_at" | "updated_at">>): SemanticDimension | undefined {
  const updates: string[] = [];
  const values: unknown[] = [];
  const fields = ["name", "display_name", "sql_expression", "data_type", "hierarchy", "values"];
  for (const f of fields) {
    if ((input as any)[f] !== undefined) {
      updates.push(`${f} = ?`);
      values.push((input as any)[f]);
    }
  }
  if (updates.length === 0) return getDimension(id);
  updates.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id);
  getDb().prepare(`UPDATE semantic_dimensions SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  return getDimension(id);
}

export function deleteDimension(id: string): boolean {
  return getDb().prepare("DELETE FROM semantic_dimensions WHERE id = ?").run(id).changes > 0;
}

// ==================== Semantic Models CRUD ====================

export function listModels(datasourceId: string): SemanticModel[] {
  return getDb().prepare(`
    SELECT * FROM semantic_models WHERE datasource_id = ? ORDER BY name
  `).all(datasourceId) as SemanticModel[];
}

export function getModel(id: string): SemanticModel | undefined {
  return getDb().prepare(`SELECT * FROM semantic_models WHERE id = ?`).get(id) as SemanticModel | undefined;
}

export function createModel(input: Omit<SemanticModel, "id" | "created_at" | "updated_at">): SemanticModel {
  const id = generateId();
  getDb().prepare(`
    INSERT INTO semantic_models (id, datasource_id, name, description, base_table, joins, metrics, dimensions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.datasource_id, input.name, input.description ?? null, input.base_table, input.joins, input.metrics, input.dimensions);
  return getModel(id)!;
}

export function updateModel(id: string, input: Partial<Omit<SemanticModel, "id" | "datasource_id" | "created_at" | "updated_at">>): SemanticModel | undefined {
  const updates: string[] = [];
  const values: unknown[] = [];
  const fields = ["name", "description", "base_table", "joins", "metrics", "dimensions"];
  for (const f of fields) {
    if ((input as any)[f] !== undefined) {
      updates.push(`${f} = ?`);
      values.push((input as any)[f]);
    }
  }
  if (updates.length === 0) return getModel(id);
  updates.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id);
  getDb().prepare(`UPDATE semantic_models SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  return getModel(id);
}

export function deleteModel(id: string): boolean {
  return getDb().prepare("DELETE FROM semantic_models WHERE id = ?").run(id).changes > 0;
}

// ==================== Scheduled Queries CRUD ====================

export function listScheduledQueries(datasourceId: string): ScheduledQuery[] {
  return getDb().prepare(`SELECT * FROM scheduled_queries WHERE datasource_id = ? ORDER BY name`).all(datasourceId) as ScheduledQuery[];
}

export function getScheduledQuery(id: string): ScheduledQuery | undefined {
  return getDb().prepare(`SELECT * FROM scheduled_queries WHERE id = ?`).get(id) as ScheduledQuery | undefined;
}

export function createScheduledQuery(input: Omit<ScheduledQuery, "id" | "last_run_at" | "last_run_status" | "last_run_result" | "created_at" | "updated_at">): ScheduledQuery {
  const id = generateId();
  getDb().prepare(`
    INSERT INTO scheduled_queries (id, datasource_id, name, description, sql, cron_expression, timezone, enabled, alert_conditions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.datasource_id, input.name, input.description ?? null, input.sql, input.cron_expression, input.timezone, input.enabled, input.alert_conditions ?? null);
  return getScheduledQuery(id)!;
}

export function updateScheduledQuery(id: string, input: Partial<Omit<ScheduledQuery, "id" | "datasource_id" | "created_at" | "updated_at">>): ScheduledQuery | undefined {
  const updates: string[] = [];
  const values: unknown[] = [];
  const fields = ["name", "description", "sql", "cron_expression", "timezone", "enabled", "alert_conditions", "last_run_at", "last_run_status", "last_run_result"];
  for (const f of fields) {
    if ((input as any)[f] !== undefined) {
      updates.push(`${f} = ?`);
      values.push((input as any)[f]);
    }
  }
  if (updates.length === 0) return getScheduledQuery(id);
  updates.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id);
  getDb().prepare(`UPDATE scheduled_queries SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  return getScheduledQuery(id);
}

export function deleteScheduledQuery(id: string): boolean {
  return getDb().prepare("DELETE FROM scheduled_queries WHERE id = ?").run(id).changes > 0;
}

// ==================== Query Alerts CRUD ====================

export function listAlerts(datasourceId: string, since?: string, limit = 50): QueryAlert[] {
  if (since) {
    return getDb().prepare(`
      SELECT a.* FROM query_alerts a
      JOIN scheduled_queries sq ON a.scheduled_query_id = sq.id
      WHERE sq.datasource_id = ? AND a.created_at >= ?
      ORDER BY a.created_at DESC LIMIT ?
    `).all(datasourceId, since, limit) as QueryAlert[];
  }
  return getDb().prepare(`
    SELECT a.* FROM query_alerts a
    JOIN scheduled_queries sq ON a.scheduled_query_id = sq.id
    WHERE sq.datasource_id = ?
    ORDER BY a.created_at DESC LIMIT ?
  `).all(datasourceId, limit) as QueryAlert[];
}

export function createAlert(input: Omit<QueryAlert, "id" | "created_at">): QueryAlert {
  const id = generateId();
  getDb().prepare(`
    INSERT INTO query_alerts (id, scheduled_query_id, severity, condition_triggered, actual_value, threshold)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, input.scheduled_query_id, input.severity, input.condition_triggered, input.actual_value, input.threshold);
  return getDb().prepare(`SELECT * FROM query_alerts WHERE id = ?`).get(id) as QueryAlert;
}

// ==================== Execution History CRUD ====================

export function listExecutionHistory(scheduledQueryId: string, limit = 20): QueryExecutionHistory[] {
  return getDb().prepare(`
    SELECT * FROM query_execution_history WHERE scheduled_query_id = ? ORDER BY executed_at DESC LIMIT ?
  `).all(scheduledQueryId, limit) as QueryExecutionHistory[];
}

export function createExecutionHistory(input: Omit<QueryExecutionHistory, "id" | "created_at">): QueryExecutionHistory {
  const id = generateId();
  getDb().prepare(`
    INSERT INTO query_execution_history (id, scheduled_query_id, executed_at, status, result_summary, execution_time_ms, row_count)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.scheduled_query_id, input.executed_at, input.status, input.result_summary ?? null, input.execution_time_ms ?? null, input.row_count ?? null);
  return getDb().prepare(`SELECT * FROM query_execution_history WHERE id = ?`).get(id) as QueryExecutionHistory;
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
