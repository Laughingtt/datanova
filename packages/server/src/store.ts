import * as crypto from "node:crypto";
import Database from "better-sqlite3";
import { DB_PATH } from "./config.js";
import { normalizeSql } from "./agent/tools/sql-normalize.js";
import type { Datasource, SchemaAnnotation, Conversation, StoredMessage, TableQueryExample, QueryFeedback, QueryExample, SemanticMetric, SemanticDimension, SemanticModel, ScheduledQuery, QueryAlert, QueryExecutionHistory, SqlQueryHistory, QueryBookmark, QuerySkill } from "./types.js";

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
  if (!annotationColumns.includes("column_type")) {
    database.exec(`ALTER TABLE schema_annotations ADD COLUMN column_type TEXT`);
  }
  if (!annotationColumns.includes("sample_data")) {
    database.exec(`ALTER TABLE schema_annotations ADD COLUMN sample_data TEXT`);
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

  // Migration: add unique index on query_examples for upsert support
  const qeIndexes = (database.pragma("index_list(query_examples)") as Array<{ name: string }>).map(i => i.name);
  if (!qeIndexes.includes("idx_qe_datasource_question_sql")) {
    database.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_qe_datasource_question_sql ON query_examples(datasource_id, question, sql)`);
  }


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

  // Migration: Add feedback_category and sql_query_history_id to query_feedback
  try {
    database.exec(`ALTER TABLE query_feedback ADD COLUMN feedback_category TEXT`);
  } catch { /* column already exists */ }
  try {
    database.exec(`ALTER TABLE query_feedback ADD COLUMN sql_query_history_id TEXT`);
  } catch { /* column already exists */ }

  // App config table — MUST be created first since getConfig() is called during init
  database.exec(`
    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
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
      sql TEXT NOT NULL,
      dimensions TEXT NOT NULL DEFAULT '[]',
      default_granularity TEXT,
      unit TEXT,
      category TEXT,
      aliases TEXT NOT NULL DEFAULT '[]',
      metric_type TEXT NOT NULL DEFAULT 'atomic' CHECK(metric_type IN ('atomic', 'derived', 'compound')),
      business_context TEXT NOT NULL DEFAULT '',
      calculation_logic TEXT NOT NULL DEFAULT '',
      applicable_scenarios TEXT NOT NULL DEFAULT '',
      data_quality_notes TEXT NOT NULL DEFAULT '',
      default_sort TEXT,
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
      "values" TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'deprecated')),
      grain TEXT CHECK(grain IN ('day', 'week', 'month', 'quarter', 'year')),
      date_column TEXT,
      description TEXT NOT NULL DEFAULT '',
      is_enum_dict INTEGER NOT NULL DEFAULT 0,
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
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'deprecated')),
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

  // SQL query history — records ALL executed SQL queries across conversations
  database.exec(`
    CREATE TABLE IF NOT EXISTS sql_query_history (
      id TEXT PRIMARY KEY,
      datasource_id TEXT NOT NULL,
      datasource_name TEXT NOT NULL DEFAULT '',
      conversation_id TEXT,
      question TEXT,
      sql TEXT NOT NULL,
      executed_at TEXT NOT NULL,
      execution_time_ms INTEGER,
      row_count INTEGER,
      status TEXT NOT NULL DEFAULT 'success' CHECK(status IN ('success', 'error')),
      error_message TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (datasource_id) REFERENCES datasources(id) ON DELETE CASCADE
    )
  `);

  // Migration: Add status to semantic_models
  try {
    database.exec(`ALTER TABLE semantic_models ADD COLUMN status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'deprecated'))`);
  } catch { /* column already exists */ }

  // P2-2: Add new columns to semantic_metrics
  const metricColumns = database.prepare("PRAGMA table_info(semantic_metrics)").all() as Array<{name: string}>;
  const metricColNames = new Set(metricColumns.map(c => c.name));

  if (!metricColNames.has('sql')) {
    try { database.exec(`ALTER TABLE semantic_metrics ADD COLUMN sql TEXT`); } catch {}
  }
  if (!metricColNames.has('metric_type')) {
    try { database.exec(`ALTER TABLE semantic_metrics ADD COLUMN metric_type TEXT NOT NULL DEFAULT 'atomic' CHECK(metric_type IN ('atomic', 'derived', 'compound'))`); } catch {}
  }
  if (!metricColNames.has('business_context')) {
    try { database.exec(`ALTER TABLE semantic_metrics ADD COLUMN business_context TEXT NOT NULL DEFAULT ''`); } catch {}
  }
  if (!metricColNames.has('calculation_logic')) {
    try { database.exec(`ALTER TABLE semantic_metrics ADD COLUMN calculation_logic TEXT NOT NULL DEFAULT ''`); } catch {}
  }
  if (!metricColNames.has('applicable_scenarios')) {
    try { database.exec(`ALTER TABLE semantic_metrics ADD COLUMN applicable_scenarios TEXT NOT NULL DEFAULT ''`); } catch {}
  }
  if (!metricColNames.has('data_quality_notes')) {
    try { database.exec(`ALTER TABLE semantic_metrics ADD COLUMN data_quality_notes TEXT NOT NULL DEFAULT ''`); } catch {}
  }
  if (!metricColNames.has('default_sort')) {
    try { database.exec(`ALTER TABLE semantic_metrics ADD COLUMN default_sort TEXT`); } catch {}
  }

  // P2-2: Add new columns to semantic_dimensions
  const dimColumns = database.prepare("PRAGMA table_info(semantic_dimensions)").all() as Array<{name: string}>;
  const dimColNames = new Set(dimColumns.map(c => c.name));

  if (!dimColNames.has('status')) {
    try { database.exec(`ALTER TABLE semantic_dimensions ADD COLUMN status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'deprecated'))`); } catch {}
  }
  if (!dimColNames.has('grain')) {
    try { database.exec(`ALTER TABLE semantic_dimensions ADD COLUMN grain TEXT CHECK(grain IN ('day', 'week', 'month', 'quarter', 'year'))`); } catch {}
  }
  if (!dimColNames.has('date_column')) {
    try { database.exec(`ALTER TABLE semantic_dimensions ADD COLUMN date_column TEXT`); } catch {}
  }
  if (!dimColNames.has('description')) {
    try { database.exec(`ALTER TABLE semantic_dimensions ADD COLUMN description TEXT NOT NULL DEFAULT ''`); } catch {}
  }
  if (!dimColNames.has('is_enum_dict')) {
    try { database.exec(`ALTER TABLE semantic_dimensions ADD COLUMN is_enum_dict INTEGER NOT NULL DEFAULT 0`); } catch {}
  }

  // Metric dev agent fields migration
  const metricDevCols = database.prepare("PRAGMA table_info(semantic_metrics)").all() as Array<{ name: string }>;
  const metricDevColNames = new Set(metricDevCols.map(c => c.name));
  if (!metricDevColNames.has("created_by")) {
    database.exec(`ALTER TABLE semantic_metrics ADD COLUMN created_by TEXT NOT NULL DEFAULT 'manual' CHECK(created_by IN ('manual', 'agent', 'ai_suggest'))`);
  }
  if (!metricDevColNames.has("agent_session_id")) {
    database.exec(`ALTER TABLE semantic_metrics ADD COLUMN agent_session_id TEXT`);
  }
  if (!metricDevColNames.has("validation_status")) {
    database.exec(`ALTER TABLE semantic_metrics ADD COLUMN validation_status TEXT NOT NULL DEFAULT 'unvalidated' CHECK(validation_status IN ('unvalidated', 'passed', 'failed'))`);
  }
  if (!metricDevColNames.has("validation_result")) {
    database.exec(`ALTER TABLE semantic_metrics ADD COLUMN validation_result TEXT`);
  }

  const dimDevCols = database.prepare("PRAGMA table_info(semantic_dimensions)").all() as Array<{ name: string }>;
  const dimDevColNames = new Set(dimDevCols.map(c => c.name));
  if (!dimDevColNames.has("created_by")) {
    database.exec(`ALTER TABLE semantic_dimensions ADD COLUMN created_by TEXT NOT NULL DEFAULT 'manual' CHECK(created_by IN ('manual', 'agent', 'ai_suggest'))`);
  }
  if (!dimDevColNames.has("agent_session_id")) {
    database.exec(`ALTER TABLE semantic_dimensions ADD COLUMN agent_session_id TEXT`);
  }

  // P2-2: Clear old test data (sql_expression-based metrics are incompatible with new sql field)
  database.exec(`DELETE FROM semantic_metrics`);
  database.exec(`DELETE FROM semantic_dimensions`);
  database.exec(`DELETE FROM semantic_models`);

  // Migration: Add parent_query_id, correction_round, intent_type to sql_query_history
  try {
    database.exec(`ALTER TABLE sql_query_history ADD COLUMN parent_query_id TEXT`);
  } catch { /* column already exists */ }
  try {
    database.exec(`ALTER TABLE sql_query_history ADD COLUMN correction_round INTEGER DEFAULT 0`);
  } catch { /* column already exists */ }
  try {
    database.exec(`ALTER TABLE sql_query_history ADD COLUMN intent_type TEXT`);
  } catch { /* column already exists */ }


	  // Query bookmarks — user-curated SQL for the insights page
	  database.exec(`
	    CREATE TABLE IF NOT EXISTS query_bookmarks (
	      id TEXT PRIMARY KEY,
	      datasource_id TEXT NOT NULL,
	      title TEXT NOT NULL,
	      sql TEXT NOT NULL,
	      description TEXT,
	      sort_order INTEGER DEFAULT 0,
	      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
	      FOREIGN KEY (datasource_id) REFERENCES datasources(id) ON DELETE CASCADE
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

  // Query Skills table (replaces business_knowledge)
  database.exec(`
    CREATE TABLE IF NOT EXISTS query_skill (
      id TEXT PRIMARY KEY,
      datasource_id TEXT NOT NULL,
      domain TEXT NOT NULL,
      name TEXT NOT NULL,
      trigger_keywords TEXT NOT NULL DEFAULT '[]',
      business_context TEXT NOT NULL DEFAULT '',
      core_tables TEXT NOT NULL DEFAULT '[]',
      join_path TEXT NOT NULL DEFAULT '',
      query_steps TEXT NOT NULL DEFAULT '',
      example_sql TEXT NOT NULL DEFAULT '',
      caveats TEXT NOT NULL DEFAULT '',
      common_issues TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (datasource_id) REFERENCES datasources(id) ON DELETE CASCADE
    )
  `);
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_query_skill_datasource
    ON query_skill(datasource_id)
  `);
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_query_skill_domain
    ON query_skill(datasource_id, domain)
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

/** Create a datasource directly without encryption (for test helpers). */
export function createDatasourceDirect(input: Omit<Datasource, "id" | "created_at" | "updated_at">): Datasource {
  const id = generateId();
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
    input.password,
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
    SELECT id, datasource_id, table_name, field_name, column_type, annotation, status, domain_type, domain_values, sample_data, created_at, updated_at
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
      SET annotation = ?, status = ?, domain_type = ?, domain_values = ?, column_type = ?, sample_data = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(input.annotation, input.status, input.domain_type ?? null, input.domain_values ?? null, input.column_type ?? null, input.sample_data ?? null, (existing as { id: string }).id);
    return getDb().prepare(`
      SELECT id, datasource_id, table_name, field_name, column_type, annotation, status, domain_type, domain_values, sample_data, created_at, updated_at
      FROM schema_annotations WHERE id = ?
    `).get((existing as { id: string }).id) as SchemaAnnotation;
  }

  const id = generateId();
  const stmt = getDb().prepare(`
    INSERT INTO schema_annotations (id, datasource_id, table_name, field_name, column_type, annotation, status, domain_type, domain_values, sample_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, input.datasource_id, input.table_name, input.field_name ?? null, input.column_type ?? null, input.annotation, input.status, input.domain_type ?? null, input.domain_values ?? null, input.sample_data ?? null);

  return getDb().prepare(`
    SELECT id, datasource_id, table_name, field_name, column_type, annotation, status, domain_type, domain_values, sample_data, created_at, updated_at
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
    SELECT id, datasource_id, table_name, field_name, column_type, annotation, status, domain_type, domain_values, sample_data, created_at, updated_at
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
    INSERT INTO query_feedback (id, message_id, conversation_id, rating, issue_type, issue_detail, feedback_category, sql_query_history_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.message_id, input.conversation_id, input.rating, input.issue_type ?? null, input.issue_detail ?? null, input.feedback_category ?? null, input.sql_query_history_id ?? null);
  return getDb().prepare(`SELECT * FROM query_feedback WHERE id = ?`).get(id) as QueryFeedback;
}

/**
 * List feedback for a datasource, joining with sql_query_history to get SQL info.
 * Used by lookup_examples to adjust example scores based on user feedback.
 */
export function listFeedbackByDatasource(datasourceId: string, limit = 100): Array<{
  id: string;
  rating: string;
  issue_type: string | null;
  feedback_category: string | null;
  sql: string | null;
  sql_query_history_id: string | null;
}> {
  return getDb().prepare(`
    SELECT
      qf.id,
      qf.rating,
      qf.issue_type,
      qf.feedback_category,
      sqh.sql,
      qf.sql_query_history_id
    FROM query_feedback qf
    LEFT JOIN sql_query_history sqh ON qf.sql_query_history_id = sqh.id
    WHERE (qf.sql_query_history_id IS NOT NULL AND sqh.datasource_id = ?)
       OR (qf.sql_query_history_id IS NULL AND qf.conversation_id IN (
         SELECT id FROM conversations WHERE datasource_id = ?
       ))
    ORDER BY qf.created_at DESC
    LIMIT ?
  `).all(datasourceId, datasourceId, limit) as Array<{
    id: string;
    rating: string;
    issue_type: string | null;
    feedback_category: string | null;
    sql: string | null;
    sql_query_history_id: string | null;
  }>;
}

/**
 * Get aggregated feedback statistics per SQL for a datasource.
 * Returns a Map of sql -> { positiveCount, negativeCount, topCategories }.
 */
export function getFeedbackStatsBySQL(datasourceId: string): Map<string, {
  positiveCount: number;
  negativeCount: number;
  topCategories: string[];
}> {
  const rows = getDb().prepare(`
    SELECT
      COALESCE(sqh.sql, '') AS sql,
      SUM(CASE WHEN qf.rating = 'positive' THEN 1 ELSE 0 END) AS positive_count,
      SUM(CASE WHEN qf.rating = 'negative' THEN 1 ELSE 0 END) AS negative_count,
      GROUP_CONCAT(DISTINCT CASE WHEN qf.feedback_category IS NOT NULL THEN qf.feedback_category END, '|') AS categories
    FROM query_feedback qf
    LEFT JOIN sql_query_history sqh ON qf.sql_query_history_id = sqh.id
    WHERE sqh.datasource_id = ? OR (qf.sql_query_history_id IS NULL AND qf.conversation_id IN (
      SELECT id FROM conversations WHERE datasource_id = ?
    ))
    GROUP BY sqh.sql
    HAVING sqh.sql IS NOT NULL AND sqh.sql != ''
  `).all(datasourceId, datasourceId) as Array<{
    sql: string;
    positive_count: number;
    negative_count: number;
    categories: string | null;
  }>;

  const map = new Map<string, { positiveCount: number; negativeCount: number; topCategories: string[] }>();
  for (const row of rows) {
    if (!row.sql) continue;
    map.set(row.sql, {
      positiveCount: row.positive_count,
      negativeCount: row.negative_count,
      topCategories: row.categories ? row.categories.split("|") : [],
    });
  }
  return map;
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


// ==================== Query History Sync & Context ====================

/**
 * Sync query_examples from sql_query_history statistics.
 * Aggregates execution counts by (question, sql), identifies high-frequency
 * successful queries, and upserts them into query_examples so that
 * lookup_examples can surface them as Few-Shot references.
 */
export function syncQueryExamplesFromHistory(datasourceId: string): number {
  const db = getDb();

  // Aggregate successful executions grouped by (question, sql)
  const stats = db.prepare(`
    SELECT
      question,
      sql,
      COUNT(*) AS total_executions,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success_executions,
      AVG(CASE WHEN execution_time_ms IS NOT NULL THEN execution_time_ms ELSE NULL END) AS avg_time_ms
    FROM sql_query_history
    WHERE datasource_id = ? AND question IS NOT NULL AND question != ''
    GROUP BY question, sql
    HAVING success_executions >= 2
    ORDER BY success_executions DESC, total_executions DESC
    LIMIT 50
  `).all(datasourceId) as Array<{
    question: string;
    sql: string;
    total_executions: number;
    success_executions: number;
    avg_time_ms: number | null;
  }>;

  let upserted = 0;
  const upsertStmt = db.prepare(`
    INSERT INTO query_examples (id, datasource_id, conversation_id, question, sql, tables_used, difficulty, success_count, is_verified)
    VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 0)
    ON CONFLICT(datasource_id, question, sql) DO UPDATE SET
      success_count = excluded.success_count,
      tables_used = excluded.tables_used,
      difficulty = excluded.difficulty,
      updated_at = CURRENT_TIMESTAMP
  `);

  // Extract table names from SQL (simple heuristic)
  function extractTables(sql: string): string[] {
    const matches = sql.match(/(?:FROM|JOIN)\s+`?(\w+)`?/gi) ?? [];
    return [...new Set(matches.map(m => {
      const name = m.match(/`?(\w+)`?$/)?.[1] ?? "";
      return name;
    }).filter(Boolean))];
  }

  for (const row of stats) {
    const tables = extractTables(row.sql);
    const difficulty: string = row.avg_time_ms !== null && row.avg_time_ms > 2000 ? "complex"
      : tables.length > 2 ? "medium"
      : "simple";

    upsertStmt.run(
      generateId(),
      datasourceId,
      row.question,
      row.sql,
      JSON.stringify(tables),
      difficulty,
      row.success_executions,
    );
    upserted++;
  }

  return upserted;
}

export function getQueryExecutionStats(datasourceId: string): Map<string, { successCount: number; errorCount: number; avgTimeMs: number }> {
  const rows = getDb().prepare(`
    SELECT
      sql,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success_count,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_count,
      AVG(CASE WHEN execution_time_ms IS NOT NULL THEN execution_time_ms ELSE NULL END) AS avg_time_ms
    FROM sql_query_history
    WHERE datasource_id = ?
    GROUP BY sql
  `).all(datasourceId) as Array<{ sql: string; success_count: number; error_count: number; avg_time_ms: number | null }>;

  const map = new Map<string, { successCount: number; errorCount: number; avgTimeMs: number }>();
  for (const row of rows) {
    map.set(row.sql, {
      successCount: row.success_count,
      errorCount: row.error_count,
      avgTimeMs: row.avg_time_ms ?? 0,
    });
  }
  return map;
}

export function getRecentSqlContext(datasourceId: string, limit = 3): Array<{
  question: string | null;
  sql: string;
  tables: string[];
  executionTimeMs: number | null;
  rowCount: number | null;
}> {
  const rows = getDb().prepare(`
    SELECT question, sql, execution_time_ms, row_count
    FROM sql_query_history
    WHERE datasource_id = ? AND status = 'success' AND question IS NOT NULL AND question != ''
    ORDER BY executed_at DESC
    LIMIT ?
  `).all(datasourceId, limit) as Array<{
    question: string | null;
    sql: string;
    execution_time_ms: number | null;
    row_count: number | null;
  }>;

  return rows.map(row => {
    // Extract table names from SQL
    const matches = row.sql.match(/(?:FROM|JOIN)\s+`?(\w+)`?/gi) ?? [];
    const tables = [...new Set(matches.map(m => {
      const name = m.match(/`?(\w+)`?$/)?.[1] ?? "";
      return name;
    }).filter(Boolean))];

    return {
      question: row.question,
      sql: row.sql,
      tables,
      executionTimeMs: row.execution_time_ms,
      rowCount: row.row_count,
    };
  });
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
  // Normalize SQL — fix keyword粘连 (e.g. "revenueFROM" → "revenue FROM")
  const normalizedSql = normalizeSql(input.sql);
  getDb().prepare(`
    INSERT INTO semantic_metrics (id, datasource_id, name, display_name, description, sql, dimensions, default_granularity, unit, category, aliases, metric_type, business_context, calculation_logic, applicable_scenarios, data_quality_notes, default_sort, status, version, created_by, agent_session_id, validation_status, validation_result)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.datasource_id, input.name, input.display_name, input.description, normalizedSql, input.dimensions, input.default_granularity ?? null, input.unit ?? null, input.category ?? null, input.aliases, input.metric_type ?? 'atomic', input.business_context ?? '', input.calculation_logic ?? '', input.applicable_scenarios ?? '', input.data_quality_notes ?? '', input.default_sort ?? null, input.status, input.version ?? 1, input.created_by ?? 'manual', input.agent_session_id ?? null, input.validation_status ?? 'unvalidated', input.validation_result ?? null);
  return getMetric(id)!;
}

export function updateMetric(id: string, input: Partial<Omit<SemanticMetric, "id" | "datasource_id" | "created_at" | "updated_at">>): SemanticMetric | undefined {
  const updates: string[] = [];
  const values: unknown[] = [];
  const fields = ["name", "display_name", "description", "sql", "dimensions", "default_granularity", "unit", "category", "aliases", "metric_type", "business_context", "calculation_logic", "applicable_scenarios", "data_quality_notes", "default_sort", "status"];
  for (const f of fields) {
    if ((input as any)[f] !== undefined) {
      updates.push(`${f} = ?`);
      // Normalize SQL field — fix keyword粘连
      let value = (input as any)[f];
      if (f === "sql" && typeof value === "string") {
        value = normalizeSql(value);
      }
      values.push(value);
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

// ==================== Metric Conflict Checks ====================

export function checkMetricNameConflict(datasourceId: string, name: string): SemanticMetric | null {
  const row = getDb().prepare(
    "SELECT * FROM semantic_metrics WHERE datasource_id = ? AND name = ?"
  ).get(datasourceId, name) as SemanticMetric | undefined;
  return row ?? null;
}

export function checkMetricDisplayNameConflict(datasourceId: string, displayName: string): SemanticMetric[] {
  return getDb().prepare(
    "SELECT * FROM semantic_metrics WHERE datasource_id = ? AND display_name = ?"
  ).all(datasourceId, displayName) as SemanticMetric[];
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
    INSERT INTO semantic_dimensions (id, datasource_id, name, display_name, description, sql_expression, data_type, hierarchy, "values", status, grain, date_column, is_enum_dict, created_by, agent_session_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.datasource_id, input.name, input.display_name, input.description ?? '', input.sql_expression, input.data_type, input.hierarchy ?? null, input.values ?? null, input.status ?? 'draft', input.grain ?? null, input.date_column ?? null, input.is_enum_dict ? 1 : 0, input.created_by ?? 'manual', input.agent_session_id ?? null);
  return getDimension(id)!;
}

export function updateDimension(id: string, input: Partial<Omit<SemanticDimension, "id" | "datasource_id" | "created_at" | "updated_at">>): SemanticDimension | undefined {
  const updates: string[] = [];
  const values: unknown[] = [];
  const fields = ["name", "display_name", "description", "sql_expression", "data_type", "hierarchy", "values", "status", "grain", "date_column", "is_enum_dict"];
  for (const f of fields) {
    if ((input as any)[f] !== undefined) {
      updates.push(`${f === "values" ? '"values"' : f} = ?`);
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
    INSERT INTO semantic_models (id, datasource_id, name, description, base_table, joins, metrics, dimensions, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.datasource_id, input.name, input.description ?? null, input.base_table, input.joins, input.metrics, input.dimensions, input.status || 'draft');
  return getModel(id)!;
}

export function updateModel(id: string, input: Partial<Omit<SemanticModel, "id" | "datasource_id" | "created_at" | "updated_at">>): SemanticModel | undefined {
  const updates: string[] = [];
  const values: unknown[] = [];
  const fields = ["name", "description", "base_table", "joins", "metrics", "dimensions", "status"];
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

// ==================== SQL Query History CRUD ====================

export function listSqlQueryHistory(datasourceId: string, limit = 100): SqlQueryHistory[] {
  return getDb().prepare(`
    SELECT * FROM sql_query_history WHERE datasource_id = ? ORDER BY executed_at DESC LIMIT ?
  `).all(datasourceId, limit) as SqlQueryHistory[];
}

export function listAllSqlQueryHistory(limit = 200): SqlQueryHistory[] {
  return getDb().prepare(`
    SELECT * FROM sql_query_history ORDER BY executed_at DESC LIMIT ?
  `).all(limit) as SqlQueryHistory[];
}

export function createSqlQueryHistory(input: Omit<SqlQueryHistory, "id" | "created_at">): SqlQueryHistory {
  const id = generateId();
  getDb().prepare(`
    INSERT INTO sql_query_history (id, datasource_id, datasource_name, conversation_id, question, sql, executed_at, execution_time_ms, row_count, status, error_message, parent_query_id, correction_round, intent_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.datasource_id,
    input.datasource_name,
    input.conversation_id ?? null,
    input.question ?? null,
    input.sql,
    input.executed_at,
    input.execution_time_ms ?? null,
    input.row_count ?? null,
    input.status,
    input.error_message ?? null,
    input.parent_query_id ?? null,
    input.correction_round ?? 0,
    input.intent_type ?? null,
  );
  return getDb().prepare(`SELECT * FROM sql_query_history WHERE id = ?`).get(id) as SqlQueryHistory;
}

// ==================== Query Bookmarks CRUD ====================

export function listBookmarks(datasourceId: string): QueryBookmark[] {
  return getDb().prepare(`
    SELECT * FROM query_bookmarks WHERE datasource_id = ? ORDER BY sort_order, created_at DESC
  `).all(datasourceId) as QueryBookmark[];
}

export function createBookmark(input: Omit<QueryBookmark, "id" | "created_at">): QueryBookmark {
  const id = generateId();
  getDb().prepare(`
    INSERT INTO query_bookmarks (id, datasource_id, title, sql, description, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, input.datasource_id, input.title, input.sql, input.description ?? null, input.sort_order ?? 0);
  return getDb().prepare(`SELECT * FROM query_bookmarks WHERE id = ?`).get(id) as QueryBookmark;
}

export function deleteBookmark(id: string): boolean {
  return getDb().prepare("DELETE FROM query_bookmarks WHERE id = ?").run(id).changes > 0;
}

// ==================== Insights Stats ====================

export interface InsightsStats {
  totalQueries: number;
  successRate: number;
  avgExecutionTimeMs: number;
  topTable: { name: string; count: number } | null;
  dailyTrend: Array<{ date: string; count: number }>;
}

export function getInsightsStats(datasourceId: string): InsightsStats {
  const db = getDb();

  const totalRow = db.prepare(`
    SELECT COUNT(*) AS cnt FROM sql_query_history WHERE datasource_id = ?
  `).get(datasourceId) as { cnt: number };
  const totalQueries = totalRow.cnt;

  const successRow = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successes
    FROM sql_query_history WHERE datasource_id = ?
  `).get(datasourceId) as { total: number; successes: number };
  const successRate = successRow.total > 0
    ? Math.round((successRow.successes / successRow.total) * 1000) / 10
    : 0;

  const avgRow = db.prepare(`
    SELECT AVG(execution_time_ms) AS avg_ms FROM sql_query_history
    WHERE datasource_id = ? AND status = 'success' AND execution_time_ms IS NOT NULL
  `).get(datasourceId) as { avg_ms: number | null };
  const avgExecutionTimeMs = avgRow.avg_ms ? Math.round(avgRow.avg_ms) : 0;

  // Most queried table
  const tableRows = db.prepare(`
    SELECT sql FROM sql_query_history WHERE datasource_id = ? AND status = 'success'
  `).all(datasourceId) as Array<{ sql: string }>;
  const tableCounts = new Map<string, number>();
  for (const row of tableRows) {
    const matches = row.sql.match(/(?:FROM|JOIN)\s+`?(\w+)`?/gi) ?? [];
    for (const m of matches) {
      const name = m.match(/`?(\w+)`?$/)?.[1] ?? "";
      if (name) tableCounts.set(name, (tableCounts.get(name) ?? 0) + 1);
    }
  }
  let topTable: { name: string; count: number } | null = null;
  for (const [name, count] of tableCounts) {
    if (!topTable || count > topTable.count) topTable = { name, count };
  }

  // Daily trend (last 7 days)
  const dailyTrend: Array<{ date: string; count: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const countRow = db.prepare(`
      SELECT COUNT(*) AS cnt FROM sql_query_history
      WHERE datasource_id = ? AND date(executed_at) = ?
    `).get(datasourceId, dateStr) as { cnt: number };
    dailyTrend.push({ date: dateStr, count: countRow.cnt });
  }

  return { totalQueries, successRate, avgExecutionTimeMs, topTable, dailyTrend };
}

export interface TopQuery {
  sql: string;
  question: string | null;
  executionCount: number;
  lastExecutedAt: string;
}

export function getTopQueries(datasourceId: string, limit = 10): TopQuery[] {
  return getDb().prepare(`
    SELECT
      sql,
      MAX(question) AS question,
      COUNT(*) AS execution_count,
      MAX(executed_at) AS last_executed_at
    FROM sql_query_history
    WHERE datasource_id = ? AND status = 'success'
    GROUP BY sql
    ORDER BY execution_count DESC
    LIMIT ?
  `).all(datasourceId, limit) as any[];
}

// ==================== Query Skill CRUD ====================

export function listQuerySkills(datasourceId: string, domain?: string): QuerySkill[] {
  if (domain) {
    return getDb().prepare(`
      SELECT * FROM query_skill
      WHERE datasource_id = ? AND domain = ?
      ORDER BY sort_order, created_at
    `).all(datasourceId, domain) as QuerySkill[];
  }
  return getDb().prepare(`
    SELECT * FROM query_skill
    WHERE datasource_id = ?
    ORDER BY domain, sort_order, created_at
  `).all(datasourceId) as QuerySkill[];
}

export function getQuerySkill(id: string): QuerySkill | undefined {
  return getDb().prepare(`SELECT * FROM query_skill WHERE id = ?`).get(id) as QuerySkill | undefined;
}

export function createQuerySkill(input: {
  datasource_id: string;
  domain: string;
  name: string;
  trigger_keywords?: string;
  business_context?: string;
  core_tables?: string;
  join_path?: string;
  query_steps?: string;
  example_sql?: string;
  caveats?: string;
  common_issues?: string;
  enabled?: number;
  sort_order?: number;
}): QuerySkill {
  const id = generateId();
  const stmt = getDb().prepare(`
    INSERT INTO query_skill (id, datasource_id, domain, name, trigger_keywords, business_context, core_tables, join_path, query_steps, example_sql, caveats, common_issues, enabled, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    input.datasource_id,
    input.domain,
    input.name,
    input.trigger_keywords ?? "[]",
    input.business_context ?? "",
    input.core_tables ?? "[]",
    input.join_path ?? "",
    input.query_steps ?? "",
    input.example_sql ?? "",
    input.caveats ?? "",
    input.common_issues ?? "",
    input.enabled ?? 1,
    input.sort_order ?? 0,
  );
  return getQuerySkill(id)!;
}

export function updateQuerySkill(id: string, input: {
  domain?: string;
  name?: string;
  trigger_keywords?: string;
  business_context?: string;
  core_tables?: string;
  join_path?: string;
  query_steps?: string;
  example_sql?: string;
  caveats?: string;
  common_issues?: string;
  enabled?: number;
  sort_order?: number;
}): QuerySkill | undefined {
  const existing = getQuerySkill(id);
  if (!existing) return undefined;

  const updates: string[] = [];
  const values: any[] = [];

  if (input.domain !== undefined) { updates.push("domain = ?"); values.push(input.domain); }
  if (input.name !== undefined) { updates.push("name = ?"); values.push(input.name); }
  if (input.trigger_keywords !== undefined) { updates.push("trigger_keywords = ?"); values.push(input.trigger_keywords); }
  if (input.business_context !== undefined) { updates.push("business_context = ?"); values.push(input.business_context); }
  if (input.core_tables !== undefined) { updates.push("core_tables = ?"); values.push(input.core_tables); }
  if (input.join_path !== undefined) { updates.push("join_path = ?"); values.push(input.join_path); }
  if (input.query_steps !== undefined) { updates.push("query_steps = ?"); values.push(input.query_steps); }
  if (input.example_sql !== undefined) { updates.push("example_sql = ?"); values.push(input.example_sql); }
  if (input.caveats !== undefined) { updates.push("caveats = ?"); values.push(input.caveats); }
  if (input.common_issues !== undefined) { updates.push("common_issues = ?"); values.push(input.common_issues); }
  if (input.enabled !== undefined) { updates.push("enabled = ?"); values.push(input.enabled); }
  if (input.sort_order !== undefined) { updates.push("sort_order = ?"); values.push(input.sort_order); }

  if (updates.length === 0) return existing;

  updates.push("updated_at = datetime('now')");
  values.push(id);

  getDb().prepare(`UPDATE query_skill SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  return getQuerySkill(id);
}

export function deleteQuerySkill(id: string): boolean {
  const result = getDb().prepare(`DELETE FROM query_skill WHERE id = ?`).run(id);
  return result.changes > 0;
}

export function listEnabledQuerySkills(datasourceId: string): QuerySkill[] {
  return getDb().prepare(`
    SELECT * FROM query_skill
    WHERE datasource_id = ? AND enabled = 1
    ORDER BY domain, sort_order, created_at
  `).all(datasourceId) as QuerySkill[];
}

export function listQuerySkillDomains(datasourceId: string): string[] {
  const rows = getDb().prepare(`
    SELECT DISTINCT domain FROM query_skill
    WHERE datasource_id = ?
    ORDER BY domain
  `).all(datasourceId) as { domain: string }[];
  return rows.map(r => r.domain);
}

// Close database connection
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
