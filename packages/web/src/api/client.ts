const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

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

// ==================== Health ====================

export const healthApi = {
  check: () => request<{ status: string; version: string }>("/api/health"),
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
