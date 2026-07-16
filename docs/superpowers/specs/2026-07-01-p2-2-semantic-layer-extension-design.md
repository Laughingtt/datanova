# P2-2 语义层扩展设计文档

> **版本**: v1.0 | **日期**: 2026-07-01 | **基于**: optimization-specs.md v2.0

---

## 概述

扩展语义层指标系统，支持三种指标类型（原子/衍生/复合），指标存储完整可执行 SQL，增加丰富的元数据字段，维度增加时间粒度层级和状态管理，保存时强制 EXPLAIN 验证。

### 核心设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 指标 SQL 存储方式 | 完整可执行 SQL | 拼装 SQL 容易出错，完整 SQL 匹配即用，可靠且灵活 |
| 指标类型定位 | 纯元数据标签 | 不影响 SQL 生成逻辑，仅帮助 agent 理解指标语义 |
| SQL 修改责任 | Agent 自行修改 | 工具只返回匹配结果，agent 根据用户需求自行调整维度/时间/筛选 |
| buildSemanticSql() | 删除，替换为 resolveSemanticSql() | 拼装器不再需要，新函数只做匹配+返回 |
| 时间粒度实现 | 维度新增 grain + date_column | 不复用 hierarchy，语义清晰，buildSemanticSql 不参与粒度转换 |
| EXPLAIN 验证 | 保存时强制验证 | 防止无效 SQL 进入语义层，提升数据质量 |
| 维度 status | 新增 draft/published/deprecated | 与指标/模型对齐，agent 只检索 published 维度 |
| 数据迁移 | 不迁移，清空旧数据 | 均为测试数据，直接新增列即可 |

---

## 第一节：数据模型变更

### semantic_metrics 表变更

| 变更 | 字段 | 类型 | 说明 |
|------|------|------|------|
| **重命名** | `sql_expression` → `sql` | TEXT NOT NULL | 存完整可执行 SQL |
| **新增** | `metric_type` | TEXT NOT NULL DEFAULT 'atomic' | `'atomic' \| 'derived' \| 'compound'` |
| **新增** | `business_context` | TEXT NOT NULL DEFAULT '' | 业务描述 |
| **新增** | `calculation_logic` | TEXT NOT NULL DEFAULT '' | 计算逻辑说明 |
| **新增** | `applicable_scenarios` | TEXT NOT NULL DEFAULT '' | 适用场景 |
| **新增** | `data_quality_notes` | TEXT NOT NULL DEFAULT '' | 数据质量提示 |
| **新增** | `default_sort` | TEXT DEFAULT NULL | 默认排序，如 `'revenue DESC'` |
| **保留** | 其余字段不变 | — | name, display_name, description, dimensions, aliases, status, version 等 |
| **废弃** | `filters` | — | 完整 SQL 已包含 WHERE 条件，filters 字段冗余，不再使用 |

**metric_type 语义定义：**

| 类型 | 含义 | SQL 特征 | 示例 |
|------|------|----------|------|
| atomic | 原子指标，单表聚合 | SELECT + 聚合函数 + GROUP BY | `SELECT SUM(amount) AS revenue FROM orders GROUP BY region` |
| derived | 衍生指标，含算术运算 | SELECT + 聚合函数间的运算 | `SELECT SUM(amount)/COUNT(order_id) AS avg_order_value FROM orders` |
| compound | 复合指标，含窗口函数/CTE | SELECT + OVER / WITH ... AS | `SELECT month, SUM(amount) OVER(ORDER BY month ROWS UNBOUNDED PRECEDING) AS cumulative_revenue FROM (...)` |

### semantic_dimensions 表变更

| 变更 | 字段 | 类型 | 说明 |
|------|------|------|------|
| **新增** | `status` | TEXT NOT NULL DEFAULT 'draft' | `'draft' \| 'published' \| 'deprecated'`，与 metrics/models 对齐 |
| **新增** | `grain` | TEXT DEFAULT NULL | `'day' \| 'week' \| 'month' \| 'quarter' \| 'year'`，仅 date 类型维度适用 |
| **新增** | `date_column` | TEXT DEFAULT NULL | 时间列引用，如 `'orders.created_at'`，配合 grain 使用 |
| **新增** | `description` | TEXT NOT NULL DEFAULT '' | 维度描述（当前缺失） |

### semantic_models 表变更

字段不变，语义变化：

- `base_table` + `joins` → 告诉 agent 数据从哪些表来，供修改 SQL 时参考
- `metrics` + `dimensions` → 声明哪些指标/维度与该模型相关，供 agent 理解关联关系
- `dimensions` 字段保留 → 声明哪些维度适用于该指标，供 agent 知道可以调整哪些维度
- `filters` 字段废弃 → 完整 SQL 已包含 WHERE 条件，无需单独存储
- 不再被 `resolveSemanticSql()` 用于拼装

### TypeScript 类型变更

```typescript
interface SemanticMetric {
  // ... 保留现有字段 ...
  sql: string;                          // 原 sql_expression 重命名
  metric_type: 'atomic' | 'derived' | 'compound';
  business_context: string;
  calculation_logic: string;
  applicable_scenarios: string;
  data_quality_notes: string;
  default_sort: string | null;
}

interface SemanticDimension {
  // ... 保留现有字段 ...
  status: 'draft' | 'published' | 'deprecated';
  grain: 'day' | 'week' | 'month' | 'quarter' | 'year' | null;
  date_column: string | null;
  description: string;
}
```

---

## 第二节：resolveSemanticSql() 替代 buildSemanticSql()

### 核心变化

`buildSemanticSql()` 是拼装器：从 metric.sql_expression（聚合表达式）+ dimensions + model 碎片组装 SQL。

`resolveSemanticSql()` 是解析器+返回器：匹配到指标后，直接返回完整 SQL，附带维度信息供 agent 参考。不做任何 SQL 修改或拼装。

### 函数签名

```typescript
export function resolveSemanticSql(options: {
  metric: {
    sql: string;
    name: string;
    metric_type: string;
    default_sort: string | null;
  };
  dimensions: Array<{
    name: string;
    sql_expression: string;
    data_type: string;
    grain: string | null;
    date_column: string | null;
  }>;
  model: {
    base_table: string;
    joins: string;
  } | null;
}): {
  sql: string;
  metric_type: string;
  available_dimensions: Array<{
    name: string;
    grain: string | null;
  }>;
  notes: string;
}
```

### 行为逻辑

1. 匹配到 metric → `sql` 字段即为完整 SQL，直接返回
2. 根据 metric_type 生成 notes：
   - atomic: "基础聚合指标，可直接修改 WHERE 条件和 GROUP BY 维度"
   - derived: "衍生指标，含比率/差值计算，修改时注意分子分母的同步"
   - compound: "复合指标，含窗口函数/CTE，修改时注意 PARTITION BY 和 ORDER BY 子句"
3. 如果维度有 grain 信息 → 在 notes 中提示 agent 可调整时间粒度
4. 返回 sql + available_dimensions + notes
5. 不做任何 SQL 拼装、修改、追加

### lookup_semantic_layer 工具变更

工具只做检索+返回，不做 SQL 加工：

```
匹配 metric → 返回匹配结果
  ↓
工具输出：
  "匹配到指标: revenue (atomic)
   SQL: SELECT SUM(amount) AS revenue FROM orders
   业务描述: 订单总金额，包含已支付和待支付订单
   计算逻辑: 对 orders.amount 列求和，不扣除退款
   适用场景: 月度经营分析、销售报表
   数据质量: amount 列可能含 NULL，建议使用 COALESCE
   可用维度: [order_month(grain:month), region]
   提示: 基础聚合指标，可直接修改 WHERE 条件和 GROUP BY 维度
   可调整时间粒度: day/week/month/quarter/year"
  ↓
Agent 自行决定：
  - 直接执行该 SQL
  - 修改维度/时间/筛选后执行
  - 不使用该 SQL，走 discover_schema + execute_sql

未匹配时：
  返回 { matched: false } + 提示 agent 使用 discover_schema + execute_sql
  （与当前行为一致）
```

### 旧 buildSemanticSql() 处理

- 删除 `buildSemanticSql()` 函数
- 所有调用点改为 `resolveSemanticSql()`
- 测试端点（`POST /:id/test`）改为直接执行 `metric.sql`（加 LIMIT）

---

## 第三节：EXPLAIN 强制验证

### 保存时验证流程

```
用户点击保存（创建或更新 metric）
  ↓
1. 前端发送 POST/PUT 请求
  ↓
2. 后端接收 → 解析 metric.sql
  ↓
3. 执行 EXPLAIN {metric.sql}
   ├─ 成功 → SQL 语法和表/列引用有效 → 继续保存
   └─ 失败 → 返回 400 + 具体错误信息
  ↓
4. 保存到 SQLite
```

### 验证规则

| 场景 | 行为 |
|------|------|
| EXPLAIN 成功 | 正常保存 |
| EXPLAIN 语法错误 | 返回 400，附带 MySQL 错误信息 |
| EXPLAIN 表不存在 | 返回 400，提示表名无效 |
| EXPLAIN 列不存在 | 返回 400，提示列名无效 |
| datasource 连接失败 | 返回 503，提示数据源不可用，**允许保存为 draft** |
| SQL 含 LIMIT | EXPLAIN 时保留 LIMIT，不影响验证 |
| SQL 含窗口函数 | EXPLAIN 正常支持窗口函数验证 |
| SQL 含 CTE | EXPLAIN 正常支持 CTE 验证 |

### 特殊处理

- **draft 状态指标**：也走 EXPLAIN 验证，但连接失败时允许保存
- **更新时不改 sql 字段**：跳过 EXPLAIN 验证
- **批量创建**（AI 建议）：逐条 EXPLAIN 验证，失败的跳过并记录，不阻塞其他指标创建
- **维度验证**：维度的 `sql_expression` 是单列表达式，需包装为 `EXPLAIN SELECT {sql_expression} FROM {base_table}` 验证，需关联 model 的 base_table

### 测试端点改造

```
POST /:id/test:
  1. 获取 metric → 直接执行 metric.sql + LIMIT 10
  2. 不再自行拼装 SQL
  3. 返回执行结果
```

测试端点和 agent 使用同一条 SQL，消除当前不一致。

---

## 第四节：前端表单变更

### MetricForm 变更

| 变更 | 说明 |
|------|------|
| **新增 metric_type 选择** | 单选：原子指标 / 衍生指标 / 复合指标，默认 atomic |
| **sql_expression 改为 sql** | 字段重命名，提示语改为"完整 SQL 语句"，TableColumnPicker 保留但增加"直接编辑 SQL"模式 |
| **新增 business_context** | textarea，业务描述 |
| **新增 calculation_logic** | textarea，计算逻辑说明 |
| **新增 applicable_scenarios** | textarea，适用场景 |
| **新增 data_quality_notes** | textarea，数据质量提示 |
| **新增 default_sort** | 文本输入，如 `revenue DESC` |
| **保存时验证反馈** | 保存失败时展示 EXPLAIN 错误信息 |
| **metric_type 条件显示** | 选择 derived/compound 时，calculation_logic 字段高亮提示填写 |

### DimensionForm 变更

| 变更 | 说明 |
|------|------|
| **新增 status** | draft / published / deprecated，与 MetricForm 一致 |
| **新增 description** | textarea，维度描述 |
| **新增 grain** | 下拉选择：日/周/月/季/年，仅 data_type 为 date 时显示 |
| **新增 date_column** | 文本输入，配合 grain 使用，仅 data_type 为 date 时显示 |

### MetricsPage 变更

| 变更 | 说明 |
|------|------|
| **列表增加 metric_type 标签** | 用不同颜色标签区分 atomic/derived/compound |
| **维度列表增加 status 过滤** | 与指标列表对齐 |
| **维度列表显示 grain** | 时间维度在列表中显示粒度信息 |

### AI 建议弹窗变更

AI 建议结果中增加新字段的预览，用户可在创建前看到 metric_type、business_context 等信息。

---

## 第五节：AI 建议提示词扩展

### 扩展后 AI 返回的指标字段

| 字段 | 说明 | 示例 |
|------|------|------|
| `sql` | 完整 SQL（替代原 sql_expression） | `SELECT SUM(amount) AS revenue FROM orders` |
| `metric_type` | 指标类型 | `atomic` / `derived` / `compound` |
| `business_context` | 业务描述 | `"订单总金额，包含已支付和待支付订单"` |
| `calculation_logic` | 计算逻辑 | `"对 orders.amount 列求和，不扣除退款"` |
| `applicable_scenarios` | 适用场景 | `"月度经营分析、销售报表"` |
| `data_quality_notes` | 数据质量提示 | `"amount 列可能含 NULL，建议使用 COALESCE"` |
| `default_sort` | 默认排序 | `"revenue DESC"` |

### AI 生成 metric_type 策略

提示词中指导 AI 根据指标特征自动判断：

- **atomic**：单表聚合（SUM/COUNT/AVG/MAX/MIN），如 `SELECT SUM(amount) AS revenue FROM orders`
- **derived**：含算术运算的比率/差值指标，如 `SELECT SUM(amount)/COUNT(order_id) AS avg_order_value FROM orders`
- **compound**：含窗口函数/CTE 的复杂指标，如 `SELECT month, SUM(amount) OVER(ORDER BY month ROWS UNBOUNDED PRECEDING) AS cumulative_revenue FROM (...)`

### 扩展后 AI 返回的维度字段

| 字段 | 说明 | 示例 |
|------|------|------|
| `description` | 维度描述 | `"订单创建时间的月份维度"` |
| `grain` | 时间粒度 | `month` |
| `date_column` | 时间列 | `orders.created_at` |

### 提示词关键调整点

1. 明确要求返回**完整可执行 SQL**，不再返回聚合表达式
2. 增加 metric_type 判断规则和示例
3. 要求 AI 为每个指标生成 business_context 和 calculation_logic
4. 对于 date 类型维度，要求 AI 推断 grain 和 date_column
5. 所有新字段非必填，AI 不确定时可留空字符串

---

## 第六节：Agent 提示词注入

### lookup_semantic_layer 工具返回内容

匹配到指标时，工具返回完整信息供 agent 决策：

```
匹配到指标: revenue (atomic)
SQL: SELECT SUM(amount) AS revenue FROM orders
业务描述: 订单总金额，包含已支付和待支付订单
计算逻辑: 对 orders.amount 列求和，不扣除退款
适用场景: 月度经营分析、销售报表
数据质量: amount 列可能含 NULL，建议使用 COALESCE
可用维度: [order_month(grain:month), region]
提示: 基础聚合指标，可直接修改 WHERE 条件和 GROUP BY 维度
可调整时间粒度: day/week/month/quarter/year
```

### 工具描述更新

`lookup_semantic_layer` 工具的 `description` 字段增加使用指导：

- 匹配到指标后，可直接执行其 SQL，也可根据用户需求修改维度/时间/筛选
- 根据 metric_type 采取不同策略：
  - atomic：可直接追加 WHERE/GROUP BY，简单修改
  - derived：修改时注意分子分母同步，避免计算错误
  - compound：修改时注意窗口函数的 PARTITION BY 和 ORDER BY，避免破坏计算逻辑
- 可用维度中的 grain 信息提示可切换时间粒度
- 如果匹配到的 SQL 不符合用户需求，回退到 `discover_schema` + `execute_sql`

### 系统提示词补充

在系统提示词中增加语义层使用指引：

> 当 lookup_semantic_layer 工具匹配到指标时，优先使用其返回的 SQL。如需调整：
> - 切换时间粒度：替换日期格式化函数（如 DATE_FORMAT 的格式参数）
> - 添加筛选条件：在 WHERE 子句中追加条件
> - 切换维度：修改 GROUP BY 和 SELECT 中的维度列
> - 对于 compound 类型指标，谨慎修改窗口函数相关子句

---

## 第七节：数据迁移与兼容性

### 迁移策略

均为测试数据，不迁移，直接清空旧数据。在 `initTables()` 中：

1. 新增列：sql, metric_type, business_context, calculation_logic, applicable_scenarios, data_quality_notes, default_sort
2. 新增维度列：status, grain, date_column, description
3. 旧 `sql_expression` 列保留（SQLite 不支持 DROP COLUMN），不再被代码读取
4. 清空 semantic_metrics、semantic_dimensions、semantic_models 表数据

### API 兼容性

| 调用方 | 影响 | 处理 |
|------|------|------|
| 前端 MetricForm | `sql_expression` → `sql` | 前端同步修改字段名 |
| 前端 API client | 请求/响应字段名变更 | 同步更新类型定义 |
| `lookup_semantic_layer` 工具 | 不再调用 `buildSemanticSql()` | 改为直接读取 `metric.sql` |
| `POST /:id/test` 端点 | 不再自行拼装 SQL | 直接执行 `metric.sql` + LIMIT |
| `ai-suggest-semantic` 路由 | 返回字段名变更 | 提示词 + 解析逻辑同步更新 |
| `ai_suggest_semantic_layer` 工具 | 返回字段名变更 | 同上 |
| `buildSemanticSql()` | 删除 | 所有调用点改为直接读 `metric.sql` |

### 向后兼容

- `sql_expression` 列保留但不再被任何代码读取
- 前端 API 类型定义一次性更新，不做版本兼容
- 不做 API 版本控制，前后端同步发布

---

## 影响文件清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `packages/server/src/store.ts` | 修改 | 新增列、CRUD 函数更新、清空旧数据 |
| `packages/server/src/types.ts` | 修改 | SemanticMetric/SemanticDimension 接口更新 |
| `packages/server/src/agent/semantic-sql-builder.ts` | 重写 | buildSemanticSql → resolveSemanticSql |
| `packages/server/src/agent/tools/lookup-semantic-layer.ts` | 修改 | 使用 resolveSemanticSql，返回更丰富信息 |
| `packages/server/src/agent/tools/ai-suggest-semantic.ts` | 修改 | 返回字段名变更 |
| `packages/server/src/agent/prompt-builder.ts` | 修改 | 系统提示词增加语义层使用指引 |
| `packages/server/src/routes/semantic.ts` | 修改 | EXPLAIN 验证、test 端点改造、AI 提示词扩展 |
| `packages/server/src/mysql/executor.ts` | 修改 | 新增 EXPLAIN 验证函数 |
| `packages/web/src/components/Metrics/MetricForm.tsx` | 修改 | 新增字段、sql 重命名、验证反馈 |
| `packages/web/src/components/Metrics/DimensionForm.tsx` | 修改 | 新增 status/description/grain/date_column |
| `packages/web/src/components/Metrics/MetricsPage.tsx` | 修改 | metric_type 标签、维度 status 过滤 |
| `packages/web/src/api/client.ts` | 修改 | 字段名变更 |
