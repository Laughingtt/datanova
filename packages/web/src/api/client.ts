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
  annotation: string;
  status: "draft" | "confirmed";
  domain_type: "enum" | "range" | null;
  domain_values: string | null;
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
  submit: (convId: string, msgId: string, data: { rating: string; issue_type?: string; issue_detail?: string }) =>
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
  sql_expression: string;
  filters: string;
  dimensions: string;
  default_granularity: string | null;
  unit: string | null;
  category: string | null;
  aliases: string;
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
    request<{ tables: any[] }>(`/api/datasources/${dsId}/ai-suggest-semantic`, { method: "POST" }),
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
