export interface Datasource {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface SchemaAnnotation {
  id: string;
  datasource_id: string;
  table_name: string;
  field_name: string | null;
  column_type: string | null;
  annotation: string;
  status: "draft" | "confirmed";
  domain_type: "enum" | "range" | null;
  domain_values: string | null; // JSON string
  sample_data: string | null; // JSON string
  created_at: string;
  updated_at: string;
}

export interface TableQueryExample {
  id: string;
  datasource_id: string;
  table_name: string;
  question: string;
  sql: string;
  is_verified: number; // 0 or 1
  created_at: string;
  updated_at: string;
}

export interface QueryFeedback {
  id: string;
  message_id: string;
  conversation_id: string;
  rating: "positive" | "negative";
  issue_type: string | null;
  issue_detail: string | null;
  feedback_category?: string | null;  // 'wrong_result' | 'slow_query' | 'wrong_table' | 'missing_data' | 'other'
  sql_query_history_id?: string | null;  // FK to sql_query_history
  created_at: string;
}

export interface QueryExample {
  id: string;
  datasource_id: string;
  conversation_id: string | null;
  question: string;
  sql: string;
  tables_used: string; // JSON array
  difficulty: "simple" | "medium" | "complex";
  success_count: number;
  is_verified: number;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  title: string | null;
  datasource_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface StoredMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  steps: string | null;       // JSON-serialized AgentStep[]
  created_at: string;
}

export interface TableInfo {
  name: string;
  comment?: string;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string;
  comment?: string;
  isPrimaryKey: boolean;
}

export interface ForeignKeyInfo {
  name: string;
  columnName: string;
  referencedTable: string;
  referencedColumn: string;
}

export interface TableSchema {
  table: TableInfo;
  columns: ColumnInfo[];
  foreignKeys: ForeignKeyInfo[];
}

export interface SchemaInfo {
  tables: TableSchema[];
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTime: number;
}

export interface DatasourceConnection {
  id: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

// ==================== Semantic Layer (Phase 2) ====================

export interface SemanticMetric {
  id: string;
  datasource_id: string;
  name: string;
  display_name: string;
  description: string;
  sql: string;
  dimensions: string; // JSON array of dimension names
  default_granularity: string | null;
  unit: string | null;
  category: string | null;
  aliases: string; // JSON array
  metric_type: "atomic" | "derived" | "compound";
  business_context: string;
  calculation_logic: string;
  applicable_scenarios: string;
  data_quality_notes: string;
  default_sort: string | null;
  status: "draft" | "published" | "deprecated";
  version: number;
  created_by: "manual" | "agent" | "ai_suggest";
  agent_session_id: string | null;
  validation_status: "unvalidated" | "passed" | "failed";
  validation_result: string | null; // JSON
  created_at: string;
  updated_at: string;
}

export interface SemanticDimension {
  id: string;
  datasource_id: string;
  name: string;
  display_name: string;
  sql_expression: string;
  data_type: "string" | "number" | "date";
  hierarchy: string | null; // JSON object
  values: string | null; // JSON array
  status: "draft" | "published" | "deprecated";
  grain: "day" | "week" | "month" | "quarter" | "year" | null;
  date_column: string | null;
  description: string;
  is_enum_dict: boolean;
  created_by: "manual" | "agent" | "ai_suggest";
  agent_session_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SemanticModel {
  id: string;
  datasource_id: string;
  name: string;
  description: string | null;
  base_table: string;
  joins: string; // JSON array
  metrics: string; // JSON array of metric names
  dimensions: string; // JSON array of dimension names
  status: "draft" | "published" | "deprecated";
  created_at: string;
  updated_at: string;
}

// ==================== Scheduled Queries (Phase 4) ====================

export interface ScheduledQuery {
  id: string;
  datasource_id: string;
  name: string;
  description: string | null;
  sql: string;
  cron_expression: string;
  timezone: string;
  enabled: number;
  alert_conditions: string | null; // JSON
  last_run_at: string | null;
  last_run_status: "success" | "error" | null;
  last_run_result: string | null; // JSON
  created_at: string;
  updated_at: string;
}

export interface QueryAlert {
  id: string;
  scheduled_query_id: string;
  severity: "warning" | "critical";
  condition_triggered: string;
  actual_value: string;
  threshold: string;
  created_at: string;
}

export interface QueryExecutionHistory {
  id: string;
  scheduled_query_id: string;
  executed_at: string;
  status: "success" | "error";
  result_summary: string | null; // JSON
  execution_time_ms: number | null;
  row_count: number | null;
  created_at: string;
}

// ==================== SQL Query History ====================

// ==================== Query Bookmarks ====================

export interface QueryBookmark {
  id: string;
  datasource_id: string;
  title: string;
  sql: string;
  description: string | null;
  sort_order: number;
  created_at: string;
}

// ==================== Query Skills ====================

export interface CoreTableEntry {
  table: string;
  purpose: string;
}

export interface QuerySkill {
  id: string;
  datasource_id: string;
  domain: string;
  name: string;
  trigger_keywords: string; // JSON array of strings
  business_context: string;
  core_tables: string; // JSON array of CoreTableEntry objects
  join_path: string;
  query_steps: string;
  example_sql: string;
  caveats: string;
  common_issues: string;
  enabled: number; // 0 or 1
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ==================== SQL Query History ====================

export interface SqlQueryHistory {
  id: string;
  datasource_id: string;
  datasource_name: string;
  conversation_id: string | null;
  question: string | null;
  sql: string;
  executed_at: string;
  execution_time_ms: number | null;
  row_count: number | null;
  status: "success" | "error";
  error_message: string | null;
  parent_query_id?: string | null;    // for self-correction chain
  correction_round?: number;           // 0 = original, 1+ = correction attempt
  intent_type?: string | null;         // 'new_query' | 'refine' | 'drill_down' | 'compare' | 'explain' | 'correction'
  created_at: string;
}
