# 类型定义与数据模型

> 本文档列举项目中所有 TypeScript 类型定义及其对应的 SQLite 表结构。

---

## 一、完整类型定义

所有类型定义位于 `packages/server/src/types.ts`。

### 1.1 数据源

```typescript
interface Datasource {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;     // AES-256-GCM 加密
  enabled: boolean;
  created_at: string;
  updated_at: string;
}
```

对应 SQLite 表 `datasources`：
```sql
CREATE TABLE datasources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  database TEXT NOT NULL,
  user TEXT NOT NULL,
  password TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  created_at TEXT, updated_at TEXT
);
```

### 1.2 Schema 注解

```typescript
interface SchemaAnnotation {
  id: string;
  datasource_id: string;
  table_name: string;
  field_name: string | null;     // null = 表级注解
  annotation: string;
  status: "draft" | "confirmed";
  domain_type: "enum" | "range" | null;
  domain_values: string | null;  // JSON
  created_at: string;
  updated_at: string;
}
```

对应 SQLite 表 `schema_annotations`：
```sql
CREATE TABLE schema_annotations (
  id TEXT PRIMARY KEY,
  datasource_id TEXT NOT NULL,
  table_name TEXT NOT NULL,
  field_name TEXT,
  annotation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('draft','confirmed')),
  domain_type TEXT CHECK(domain_type IS NULL OR domain_type IN ('enum','range')),
  domain_values TEXT,
  FOREIGN KEY (datasource_id) REFERENCES datasources(id) ON DELETE CASCADE,
  UNIQUE(datasource_id, table_name, field_name)
);
```

### 1.3 语义指标

```typescript
interface SemanticMetric {
  id: string;
  datasource_id: string;
  name: string;                   // 代码标识
  display_name: string;           // 显示名称
  description: string;
  sql_expression: string;         // SQL 片段，如 SUM(amount)
  filters: string;                // JSON 数组
  dimensions: string;             // JSON 数组
  default_granularity: string | null;
  unit: string | null;            // 单位，如"元"
  category: string | null;
  aliases: string;                // JSON 数组，如 ["销售额","GMV"]
  status: "draft" | "published" | "deprecated";
  version: number;
  created_at: string;
  updated_at: string;
}
```

### 1.4 语义维度

```typescript
interface SemanticDimension {
  id: string;
  datasource_id: string;
  name: string;
  display_name: string;
  sql_expression: string;
  data_type: "string" | "number" | "date";
  hierarchy: string | null;       // JSON（层级定义）
  values: string | null;          // JSON（枚举值列表）
  created_at: string;
  updated_at: string;
}
```

### 1.5 语义模型

```typescript
interface SemanticModel {
  id: string;
  datasource_id: string;
  name: string;
  description: string | null;
  base_table: string;             // 主表
  joins: string;                  // JSON 数组 [{table, on, type}]
  metrics: string;                // JSON 数组 [指标名]
  dimensions: string;             // JSON 数组 [维度名]
  created_at: string;
  updated_at: string;
}
```

### 1.6 查询示例

```typescript
interface QueryExample {
  id: string;
  datasource_id: string;
  conversation_id: string | null;
  question: string;
  sql: string;
  tables_used: string;            // JSON 数组
  difficulty: "simple" | "medium" | "complex";
  success_count: number;
  is_verified: number;
  created_at: string;
  updated_at: string;
}

interface TableQueryExample {
  id: string;
  datasource_id: string;
  table_name: string;
  question: string;
  sql: string;
  is_verified: number;
  created_at: string;
  updated_at: string;
}
```

### 1.7 查询反馈

```typescript
interface QueryFeedback {
  id: string;
  message_id: string;
  conversation_id: string;
  rating: "positive" | "negative";
  issue_type: string | null;
  issue_detail: string | null;
  created_at: string;
}
```

### 1.8 对话与消息

```typescript
interface Conversation {
  id: string;
  title: string | null;
  datasource_id: string | null;
  created_at: string;
  updated_at: string;
}

interface StoredMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  steps: string | null;           // JSON-serialized AgentStep[]
  created_at: string;
}
```

### 1.9 定时查询

```typescript
interface ScheduledQuery {
  id: string;
  datasource_id: string;
  name: string;
  description: string | null;
  sql: string;
  cron_expression: string;
  timezone: string;
  enabled: number;
  alert_conditions: string | null;   // JSON
  last_run_at: string | null;
  last_run_status: "success" | "error" | null;
  last_run_result: string | null;
  created_at: string;
  updated_at: string;
}

interface QueryAlert {
  id: string;
  scheduled_query_id: string;
  severity: "warning" | "critical";
  condition_triggered: string;
  actual_value: string;
  threshold: string;
  created_at: string;
}

interface QueryExecutionHistory {
  id: string;
  scheduled_query_id: string;
  executed_at: string;
  status: "success" | "error";
  result_summary: string | null;
  execution_time_ms: number | null;
  row_count: number | null;
  created_at: string;
}
```

### 1.10 MySQL 查询相关

```typescript
interface SchemaInfo {
  tables: TableSchema[];
}

interface TableSchema {
  table: TableInfo;
  columns: ColumnInfo[];
  foreignKeys: ForeignKeyInfo[];
}

interface TableInfo {
  name: string;
  comment?: string;
}

interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string;
  comment?: string;
  isPrimaryKey: boolean;
}

interface ForeignKeyInfo {
  name: string;
  columnName: string;
  referencedTable: string;
  referencedColumn: string;
}

interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTime: number;
}

interface DatasourceConnection {
  id: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;        // 已解密
}
```

---

## 二、SQLite 完整表结构

| 表名 | 主键 | 用途 | 外键 |
|---|---|---|---|
| `datasources` | id | 数据源连接配置 | — |
| `schema_annotations` | id | 表/字段业务注解 | datasources(id) CASCADE |
| `table_query_examples` | id | 手动维护的查询示例 | datasources(id) CASCADE |
| `query_examples` | id | 自动保存的历史查询 | datasources(id) CASCADE |
| `query_feedback` | id | 用户反馈（👍👎） | — |
| `conversations` | id | 对话列表 | datasources(id) SET NULL |
| `messages` | id | 对话消息 | conversations(id) CASCADE |
| `semantic_metrics` | id | 语义指标 | datasources(id) CASCADE |
| `semantic_dimensions` | id | 语义维度 | datasources(id) CASCADE |
| `semantic_models` | id | 语义模型 | datasources(id) CASCADE |
| `scheduled_queries` | id | 定时查询 | datasources(id) CASCADE |
| `query_alerts` | id | 查询告警 | scheduled_queries(id) CASCADE |
| `query_execution_history` | id | 执行历史 | scheduled_queries(id) CASCADE |
| `app_config` | key | 应用配置（KV） | — |

---

## 三、加密模块

`packages/server/src/crypto.ts` 使用 AES-256-GCM 加密数据源密码：

- **密钥来源**：环境变量 `DATANOVA_ENCRYPTION_KEY`（32 字节）
- **加密格式**：`iv:tag:ciphertext`（hex 编码）
- **IV 长度**：12 字节（96 位）
- **Tag 长度**：16 字节（128 位）

```typescript
// 加密
encrypt("明文密码") → "a1b2c3...:d4e5f6...:789abc..."

// 解密
decrypt("a1b2c3...:d4e5f6...:789abc...") → "明文密码"
```

---

## 四、连接池管理

`packages/server/src/mysql/pool.ts` 管理 MySQL 连接池：

- 每个数据源一个连接池（`Map<datasourceId, Pool>`）
- 连接数上限：10
- 从 SQLite 读取数据源配置，解密密码后再创建连接
- 支持连接测试（`testConnection`）和关闭（`closePool`）
