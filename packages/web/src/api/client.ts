// Use relative path so requests go through Vite proxy in dev mode.
// In production, set VITE_API_URL to the actual backend URL.
const API_BASE = import.meta.env.VITE_API_URL || "";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error || `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

// ==================== Datasources ====================

export interface Datasource {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  user: string;
  hasPassword: boolean;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateDatasourceInput {
  name: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  enabled?: boolean;
}

export interface UpdateDatasourceInput {
  name?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  enabled?: boolean;
}

export interface ConnectionTestResult {
  success: boolean;
  error?: string;
}

export const datasourcesApi = {
  list: () => request<Datasource[]>("/api/datasources"),
  get: (id: string) => request<Datasource>(`/api/datasources/${id}`),
  create: (input: CreateDatasourceInput) =>
    request<Datasource>("/api/datasources", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: UpdateDatasourceInput) =>
    request<Datasource>(`/api/datasources/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/api/datasources/${id}`, { method: "DELETE" }),
  test: (id: string) =>
    request<ConnectionTestResult>(`/api/datasources/${id}/test`, { method: "POST" }),
};

// ==================== Schemas ====================

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

export interface SchemaAnnotation {
  id: string;
  datasource_id: string;
  table_name: string;
  field_name: string | null;
  column_type: string | null;
  annotation: string;
  status: "draft" | "confirmed";
  domain_type: "enum" | "range" | null;
  domain_values: string | null;
  sample_data: string | null;
  created_at: string;
  updated_at: string;
}

export interface TableQueryExample {
  id: string;
  datasource_id: string;
  table_name: string;
  question: string;
  sql: string;
  is_verified: number;
  created_at: string;
  updated_at: string;
}

export interface SchemaResponse {
  schema: SchemaInfo;
  annotations: SchemaAnnotation[];
}

export const schemasApi = {
  get: (datasourceId: string) =>
    request<SchemaResponse>(`/api/schemas/${datasourceId}`),
  upsertAnnotation: (datasourceId: string, data: {
    table_name: string;
    field_name?: string;
    annotation: string;
  }) =>
    request<SchemaAnnotation>(`/api/schemas/${datasourceId}/annotations`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteAnnotation: (datasourceId: string, annotationId: string) =>
    request<{ success: boolean }>(`/api/schemas/${datasourceId}/annotations/${annotationId}`, {
      method: "DELETE",
    }),
  aiAnnotate: (dsId: string, tableNames: string[]) =>
    request<{ tables: unknown[] }>(`/api/schemas/${dsId}/ai-annotate`, {
      method: "POST",
      body: JSON.stringify({ table_names: tableNames }),
    }),
  confirmAnnotation: (dsId: string, annotationId: string) =>
    request<SchemaAnnotation>(`/api/schemas/${dsId}/annotations/${annotationId}/confirm`, { method: "PUT" }),
  schemaPromptPreview: (dsId: string) =>
    request<{ preview: string }>(`/api/schemas/${dsId}/schema-prompt-preview`),
};

// ==================== Skills ====================

export interface SkillInfo {
  name: string;
  path: string;
}

export interface SkillDetail {
  name: string;
  content: string;
}

export const skillsApi = {
  list: () => request<SkillInfo[]>("/api/skills"),
  get: (name: string) => request<SkillDetail>(`/api/skills/${name}`),
  save: (name: string, content: string) =>
    request<SkillDetail>(`/api/skills/${name}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),
  delete: (name: string) =>
    request<{ success: boolean }>(`/api/skills/${name}`, { method: "DELETE" }),
};

// ==================== Conversations ====================

export interface Conversation {
  id: string;
  title: string | null;
  datasource_id: string | null;
  created_at: string;
  updated_at: string;
}

export const conversationsApi = {
  list: (datasourceId?: string) => {
    const params = datasourceId ? `?datasourceId=${datasourceId}` : "";
    return request<Conversation[]>(`/api/conversations${params}`);
  },
  create: (data: { title?: string; datasourceId?: string }) =>
    request<Conversation>("/api/conversations", { method: "POST", body: JSON.stringify(data) }),
  updateTitle: (id: string, title: string) =>
    request<Conversation>(`/api/conversations/${id}/title`, {
      method: "PUT",
      body: JSON.stringify({ title }),
    }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/api/conversations/${id}`, { method: "DELETE" }),
};

// ==================== Query Examples ====================

export const queryExamplesApi = {
  list: (dsId: string, tableName?: string) => {
    const params = tableName ? `?tableName=${encodeURIComponent(tableName)}` : "";
    return request<TableQueryExample[]>(`/api/schemas/${dsId}/table-query-examples${params}`);
  },
  create: (dsId: string, data: { table_name: string; question: string; sql: string }) =>
    request<TableQueryExample>(`/api/schemas/${dsId}/table-query-examples`, { method: "POST", body: JSON.stringify(data) }),
  update: (dsId: string, id: string, data: Partial<Pick<TableQueryExample, "question" | "sql" | "is_verified" | "table_name">>) =>
    request<TableQueryExample>(`/api/schemas/${dsId}/table-query-examples/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (dsId: string, id: string) =>
    request<{ success: boolean }>(`/api/schemas/${dsId}/table-query-examples/${id}`, { method: "DELETE" }),
};

// ==================== Feedback ====================

export const feedbackApi = {
  submit: (convId: string, msgId: string, data: {
    rating: string;
    issue_type?: string;
    issue_detail?: string;
    feedback_category?: string;
    sql_query_history_id?: string;
  }) =>
    request<any>(`/api/conversations/${convId}/messages/${msgId}/feedback`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// ==================== Health ====================

export const healthApi = {
  check: () => request<{ status: string; version: string }>("/api/health"),
};

// ==================== Semantic Layer ====================

export interface SemanticMetric {
  id: string;
  datasource_id: string;
  name: string;
  display_name: string;
  description: string;
  sql: string;
  dimensions: string;
  default_granularity: string | null;
  unit: string | null;
  category: string | null;
  aliases: string;
  metric_type: "atomic" | "derived" | "compound";
  business_context: string;
  calculation_logic: string;
  applicable_scenarios: string;
  data_quality_notes: string;
  default_sort: string | null;
  status: "draft" | "published" | "deprecated";
  version: number;
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
  hierarchy: string | null;
  values: string | null;
  status: "draft" | "published" | "deprecated";
  grain: "day" | "week" | "month" | "quarter" | "year" | null;
  date_column: string | null;
  description: string;
  is_enum_dict: boolean;
  created_at: string;
  updated_at: string;
}

export interface SemanticModel {
  id: string;
  datasource_id: string;
  name: string;
  description: string | null;
  base_table: string;
  joins: string;
  metrics: string;
  dimensions: string;
  status: "draft" | "published" | "deprecated";
  created_at: string;
  updated_at: string;
}

export const semanticApi = {
  listMetrics: (dsId: string) =>
    request<SemanticMetric[]>(`/api/datasources/${dsId}/metrics`),
  createMetric: (dsId: string, data: any) =>
    request<SemanticMetric>(`/api/datasources/${dsId}/metrics`, { method: "POST", body: JSON.stringify(data) }),
  updateMetric: (dsId: string, id: string, data: any) =>
    request<SemanticMetric>(`/api/datasources/${dsId}/metrics/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteMetric: (dsId: string, id: string) =>
    request<{ success: boolean }>(`/api/datasources/${dsId}/metrics/${id}`, { method: "DELETE" }),
  testMetric: (dsId: string, id: string) =>
    request<any>(`/api/datasources/${dsId}/metrics/${id}/test`, { method: "POST" }),

  listDimensions: (dsId: string) =>
    request<SemanticDimension[]>(`/api/datasources/${dsId}/dimensions`),
  createDimension: (dsId: string, data: any) =>
    request<SemanticDimension>(`/api/datasources/${dsId}/dimensions`, { method: "POST", body: JSON.stringify(data) }),
  updateDimension: (dsId: string, id: string, data: any) =>
    request<SemanticDimension>(`/api/datasources/${dsId}/dimensions/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteDimension: (dsId: string, id: string) =>
    request<{ success: boolean }>(`/api/datasources/${dsId}/dimensions/${id}`, { method: "DELETE" }),

  listModels: (dsId: string) =>
    request<SemanticModel[]>(`/api/datasources/${dsId}/models`),
  createModel: (dsId: string, data: any) =>
    request<SemanticModel>(`/api/datasources/${dsId}/models`, { method: "POST", body: JSON.stringify(data) }),
  updateModel: (dsId: string, id: string, data: any) =>
    request<SemanticModel>(`/api/datasources/${dsId}/models/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteModel: (dsId: string, id: string) =>
    request<{ success: boolean }>(`/api/datasources/${dsId}/models/${id}`, { method: "DELETE" }),

  aiSuggestSemantic: (dsId: string) =>
    request<{ created: any }>(`/api/datasources/${dsId}/ai-suggest-semantic`, { method: "POST", body: JSON.stringify({ tableNames: undefined }) }),
  aiSuggestSemanticForTables: (dsId: string, tableNames?: string[]) =>
    request<{ created: any }>(`/api/datasources/${dsId}/ai-suggest-semantic`, { method: "POST", body: JSON.stringify({ tableNames }) }),
  aiSuggestDimensions: (dsId: string, tableNames?: string[]) =>
    request<{ created: any }>(`/api/datasources/${dsId}/ai-suggest-dimensions`, { method: "POST", body: JSON.stringify({ tableNames }) }),
  bulkImportMetrics: (dsId: string, content: string, contentType: "sql" | "description" | "document") =>
    request<{ created: any }>(`/api/datasources/${dsId}/bulk-import-metrics`, { method: "POST", body: JSON.stringify({ content, contentType }) }),
  aiPreviewSemantic: (dsId: string, tableNames?: string[]) =>
    request<{ suggestions: { metrics?: any[]; dimensions?: any[]; models?: any[] } }>(`/api/datasources/${dsId}/ai-preview-semantic`, { method: "POST", body: JSON.stringify({ tableNames }) }),
  aiPreviewDimensions: (dsId: string, tableNames?: string[]) =>
    request<{ suggestions: { dimensions?: any[] } }>(`/api/datasources/${dsId}/ai-preview-dimensions`, { method: "POST", body: JSON.stringify({ tableNames }) }),
  batchCreateFromSuggestions: (dsId: string, suggestions: { metrics?: any[]; dimensions?: any[]; models?: any[] }) =>
    request<{ created: { metrics: any[]; dimensions: any[]; models: any[] } }>(`/api/datasources/${dsId}/batch-create-suggestions`, { method: "POST", body: JSON.stringify(suggestions) }),
};

// ==================== Models ====================

export interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number;
}

export interface ProviderModels {
  provider: string;
  models: ModelInfo[];
}

export const modelsApi = {
  list: () => request<ProviderModels[]>("/api/models"),
};

// ==================== Scheduled Queries ====================

export interface ScheduledQuery {
  id: string;
  datasource_id: string;
  name: string;
  description: string | null;
  sql: string;
  cron_expression: string;
  timezone: string;
  enabled: number;
  alert_conditions: string | null;
  last_run_at: string | null;
  last_run_status: "success" | "error" | null;
  last_run_result: string | null;
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

export const scheduledApi = {
  list: (dsId: string) => request<ScheduledQuery[]>(`/api/datasources/${dsId}/scheduled-queries`),
  create: (dsId: string, data: Partial<Omit<ScheduledQuery, "id" | "created_at" | "updated_at" | "last_run_at" | "last_run_status" | "last_run_result">>) =>
    request<ScheduledQuery>(`/api/datasources/${dsId}/scheduled-queries`, { method: "POST", body: JSON.stringify(data) }),
  update: (dsId: string, id: string, data: Partial<ScheduledQuery>) =>
    request<ScheduledQuery>(`/api/datasources/${dsId}/scheduled-queries/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (dsId: string, id: string) =>
    request<{ success: boolean }>(`/api/datasources/${dsId}/scheduled-queries/${id}`, { method: "DELETE" }),
  execute: (dsId: string, id: string) =>
    request<ScheduledQuery>(`/api/datasources/${dsId}/scheduled-queries/${id}/execute`, { method: "POST" }),
  generateSql: (dsId: string, prompt: string) =>
    request<{ sql: string }>(`/api/datasources/${dsId}/scheduled-queries/generate-sql`, { method: "POST", body: JSON.stringify({ prompt }) }),
  history: (dsId: string, id: string) =>
    request<any[]>(`/api/datasources/${dsId}/scheduled-queries/${id}/history`),
  listAlerts: (dsId: string, since?: string) => {
    const params = since ? `?since=${encodeURIComponent(since)}` : "";
    return request<QueryAlert[]>(`/api/datasources/${dsId}/query-alerts${params}`);
  },
};

// ==================== Data Dictionary ====================

export interface DictionarySearchResult {
  metrics: any[];
  dimensions: any[];
  tables: any[];
  columns: any[];
}

export interface TableDetail {
  table: any;
  annotations: any[];
  relatedMetrics: any[];
}

export interface RecentChanges {
  annotations: any[];
  metrics: any[];
  dimensions: any[];
}

export const dictionaryApi = {
  search: (dsId: string, query: string) =>
    request<DictionarySearchResult>(`/api/datasources/${dsId}/dictionary/search?q=${encodeURIComponent(query)}`),
  tableDetail: (dsId: string, tableName: string) =>
    request<TableDetail>(`/api/datasources/${dsId}/dictionary/tables/${tableName}`),
  recentChanges: (dsId: string) =>
    request<RecentChanges>(`/api/datasources/${dsId}/dictionary/recent-changes`),
};

// ==================== Enum Dictionary ====================

export interface EnumDictEntry {
  source: "dimension" | "annotation";
  id: string;
  name: string;
  display_name: string;
  table_name?: string;
  field_name?: string;
  data_type?: string;
  values: Array<{ key: string; value: string }>;
}

export const enumDictApi = {
  list: (dsId: string) =>
    request<EnumDictEntry[]>(`/api/datasources/${dsId}/dictionary/enums`),
  update: (dsId: string, source: "dimension" | "annotation", id: string, values: Array<{ key: string; value: string }>) =>
    request<any>(`/api/datasources/${dsId}/dictionary/enums/${source}/${id}`, {
      method: "PUT",
      body: JSON.stringify({ values }),
    }),
};

// ==================== Schema Browse ====================

export interface BrowseTable {
  name: string;
  comment?: string;
  columns: Array<{ name: string; type: string; comment?: string; isPrimaryKey: boolean }>;
  foreignKeys: Array<{ name: string; columnName: string; referencedTable: string; referencedColumn: string }>;
}

export interface SchemaBrowseResponse {
  tables: BrowseTable[];
  relationships: Array<{ fromTable: string; fromColumn: string; toTable: string; toColumn: string }>;
  modelNames: string[];
}

export const schemaBrowseApi = {
  tables: (dsId: string) =>
    request<SchemaBrowseResponse>(`/api/schemas/${dsId}/browse`),
};

// ==================== SQL Query History ====================

// ==================== Analysis (Self-Service SQL) ====================

export interface AnalysisResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTime: number;
}

export const analysisApi = {
  executeSql: (dsId: string, sql: string) =>
    request<AnalysisResult>(`/api/datasources/${dsId}/execute-sql`, {
      method: "POST",
      body: JSON.stringify({ sql }),
    }),
};

export interface SqlQueryHistoryItem {
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
  created_at: string;
}

export const queryHistoryApi = {
  list: (dsId: string, limit?: number) => {
    const params = limit ? `?limit=${limit}` : "";
    return request<SqlQueryHistoryItem[]>(`/api/datasources/${dsId}/query-history${params}`);
  },
  listAll: (limit?: number) => {
    const params = limit ? `?limit=${limit}` : "";
    return request<SqlQueryHistoryItem[]>(`/api/query-history${params}`);
  },
};

// ==================== Insights ====================

export interface InsightsStatsResponse {
  totalQueries: number;
  successRate: number;
  avgExecutionTimeMs: number;
  topTable: { name: string; count: number } | null;
  dailyTrend: Array<{ date: string; count: number }>;
}

export interface TopQueryItem {
  sql: string;
  question: string | null;
  execution_count: number;
  last_executed_at: string;
}

export const insightsApi = {
  stats: (dsId: string) =>
    request<InsightsStatsResponse>(`/api/datasources/${dsId}/insights/stats`),
  topQueries: (dsId: string, limit?: number) => {
    const params = limit ? `?limit=${limit}` : "";
    return request<TopQueryItem[]>(`/api/datasources/${dsId}/insights/top-queries${params}`);
  },
  execute: (dsId: string, sql: string) =>
    request<AnalysisResult>(`/api/datasources/${dsId}/insights/execute`, {
      method: "POST",
      body: JSON.stringify({ sql }),
    }),
};

// ==================== Bookmarks ====================

export interface Bookmark {
  id: string;
  datasource_id: string;
  title: string;
  sql: string;
  description: string | null;
  sort_order: number;
  created_at: string;
}

export const bookmarksApi = {
  list: (dsId: string) =>
    request<Bookmark[]>(`/api/datasources/${dsId}/bookmarks`),
  create: (dsId: string, data: { title: string; sql: string; description?: string }) =>
    request<Bookmark>(`/api/datasources/${dsId}/bookmarks`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  delete: (dsId: string, id: string) =>
    request<{ success: boolean }>(`/api/datasources/${dsId}/bookmarks/${id}`, {
      method: "DELETE",
    }),
  execute: (dsId: string, id: string) =>
    request<AnalysisResult>(`/api/datasources/${dsId}/bookmarks/${id}/execute`, {
      method: "POST",
    }),
};

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
  trigger_keywords: string; // JSON array
  business_context: string;
  core_tables: string; // JSON array of CoreTableEntry
  join_path: string;
  query_steps: string;
  example_sql: string;
  caveats: string;
  common_issues: string;
  enabled: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface QuerySkillDraft {
  domain: string;
  name: string;
  trigger_keywords?: string[];
  business_context?: string;
  core_tables?: CoreTableEntry[];
  join_path?: string;
  query_steps?: string;
  example_sql?: string;
  caveats?: string;
  common_issues?: string;
}

export const querySkillApi = {
  list: (dsId: string, domain?: string) =>
    request<QuerySkill[]>(`/api/datasources/${dsId}/query-skills${domain ? `?domain=${encodeURIComponent(domain)}` : ""}`),
  get: (dsId: string, id: string) =>
    request<QuerySkill>(`/api/datasources/${dsId}/query-skills/${id}`),
  domains: (dsId: string) =>
    request<string[]>(`/api/datasources/${dsId}/query-skills/domains`),
  create: (dsId: string, data: QuerySkillDraft & { enabled?: number; sort_order?: number }) =>
    request<QuerySkill>(`/api/datasources/${dsId}/query-skills`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (dsId: string, id: string, data: Partial<QuerySkillDraft> & { enabled?: number; sort_order?: number }) =>
    request<QuerySkill>(`/api/datasources/${dsId}/query-skills/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (dsId: string, id: string) =>
    request<{ success: boolean }>(`/api/datasources/${dsId}/query-skills/${id}`, {
      method: "DELETE",
    }),
  toggle: (dsId: string, id: string) =>
    request<QuerySkill>(`/api/datasources/${dsId}/query-skills/${id}/toggle`, {
      method: "PUT",
    }),
  preview: (dsId: string) =>
    request<{ skills: Array<{ skillId: string; skillDir: string; skillName: string; skillSummary: string; skillFullContent: string }> }>(`/api/datasources/${dsId}/query-skills/preview`),
  generate: (dsId: string, data: { domain: string; scenario: string }) =>
    request<{ skill: QuerySkillDraft }>(`/api/datasources/${dsId}/query-skills/generate`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  generateBatch: (dsId: string, data: { domain: string }) =>
    request<{ skills: QuerySkillDraft[] }>(`/api/datasources/${dsId}/query-skills/generate-batch`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};
