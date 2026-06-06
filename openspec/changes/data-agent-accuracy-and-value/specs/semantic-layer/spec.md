## ADDED Requirements

### Requirement: Semantic metrics storage
The system SHALL store semantic metrics definitions in a `semantic_metrics` SQLite table with fields: `id` (TEXT PK), `datasource_id` (TEXT FK), `name` (TEXT, internal identifier e.g. "gmv"), `display_name` (TEXT, e.g. "商品交易总额"), `description` (TEXT, business meaning), `sql_expression` (TEXT, e.g. "SUM(orders.amount)"), `filters` (TEXT, JSON array of filter conditions e.g. `[{"column":"orders.status","operator":"=","value":"completed"}]`), `dimensions` (TEXT, JSON array of dimension names e.g. `["city","month","category"]`), `default_granularity` (TEXT, e.g. "month"), `unit` (TEXT, e.g. "元"), `category` (TEXT, e.g. "财务指标"), `aliases` (TEXT, JSON array e.g. `["成交额","交易额","GMV","revenue"]`), `status` (TEXT, "draft" or "published", default "published"), `created_at`, `updated_at`. The combination of `datasource_id` + `name` SHALL be unique.

#### Scenario: Create a semantic metric
- **WHEN** a user creates a metric with name "gmv", display_name "商品交易总额", sql_expression "SUM(orders.amount)", filters `[{"column":"orders.status","operator":"=","value":"completed"}]`
- **THEN** the system SHALL store the metric in `semantic_metrics` with status "published" and return the created metric

#### Scenario: Duplicate metric name rejected
- **WHEN** a user creates a metric with name "gmv" for a datasource that already has a metric named "gmv"
- **THEN** the system SHALL return a 409 error "Metric 'gmv' already exists for this datasource"

### Requirement: Semantic dimensions storage
The system SHALL store semantic dimension definitions in a `semantic_dimensions` SQLite table with fields: `id` (TEXT PK), `datasource_id` (TEXT FK), `name` (TEXT, internal identifier e.g. "city"), `display_name` (TEXT, e.g. "城市"), `sql_expression` (TEXT, e.g. "customers.city"), `data_type` (TEXT, "string"/"number"/"date"), `hierarchy` (TEXT, JSON object defining drill-down levels e.g. `{"levels":["region","province","city"],"labels":["大区","省","城市"]}`), `values` (TEXT, JSON array of common values e.g. `["上海","北京","深圳"]`), `created_at`, `updated_at`. The combination of `datasource_id` + `name` SHALL be unique.

#### Scenario: Create a dimension with hierarchy
- **WHEN** a user creates a dimension "city" with hierarchy `{"levels":["region","province","city"],"labels":["大区","省","城市"]}`
- **THEN** the system SHALL store the dimension and enable drill-down/up along the hierarchy levels

### Requirement: Semantic models storage
The system SHALL store semantic model definitions in a `semantic_models` SQLite table with fields: `id` (TEXT PK), `datasource_id` (TEXT FK), `name` (TEXT, e.g. "订单分析模型"), `description` (TEXT), `base_table` (TEXT, e.g. "orders"), `joins` (TEXT, JSON array e.g. `[{"table":"customers","on":"orders.customer_id = customers.id","type":"left"}]`), `metrics` (TEXT, JSON array of metric names), `dimensions` (TEXT, JSON array of dimension names), `created_at`, `updated_at`.

#### Scenario: Create a semantic model
- **WHEN** a user creates a model "订单分析模型" with base_table "orders", joins `[{"table":"customers","on":"orders.customer_id = customers.id","type":"left"}]`, metrics `["gmv","order_count"]`, dimensions `["city","month","category"]`
- **THEN** the system SHALL store the model and it SHALL be available for SQL generation

### Requirement: Semantic layer CRUD REST API
The system SHALL provide REST API endpoints for managing semantic layer entities:
- `GET /api/datasources/:dsId/metrics` — list all metrics
- `POST /api/datasources/:dsId/metrics` — create metric
- `PUT /api/datasources/:dsId/metrics/:id` — update metric
- `DELETE /api/datasources/:dsId/metrics/:id` — delete metric
- `GET /api/datasources/:dsId/dimensions` — list all dimensions
- `POST /api/datasources/:dsId/dimensions` — create dimension
- `PUT /api/datasources/:dsId/dimensions/:id` — update dimension
- `DELETE /api/datasources/:dsId/dimensions/:id` — delete dimension
- `GET /api/datasources/:dsId/models` — list all models
- `POST /api/datasources/:dsId/models` — create model
- `PUT /api/datasources/:dsId/models/:id` — update model
- `DELETE /api/datasources/:dsId/models/:id` — delete model

#### Scenario: List metrics via API
- **WHEN** a user sends `GET /api/datasources/ds1/metrics`
- **THEN** the system SHALL return all metrics for datasource "ds1" as a JSON array

#### Scenario: Create metric via API
- **WHEN** a user sends `POST /api/datasources/ds1/metrics` with a valid metric definition
- **THEN** the system SHALL create the metric and return it with status 201

### Requirement: Agent semantic layer lookup
The Agent SHALL have a `lookup_semantic_layer` tool that searches for matching metrics/dimensions given a user's natural language question. The tool SHALL: (1) search metric `aliases` and `display_name` for keyword matches, (2) search dimension `display_name` and `values` for keyword matches, (3) return matching metrics with their SQL expressions, filters, and available dimensions. If a metric match is found, the Agent SHALL use the semantic layer to generate SQL deterministically rather than relying on NL→SQL.

#### Scenario: Metric matched via alias
- **WHEN** a user asks "上个月GMV多少" and metric "gmv" has alias "GMV"
- **THEN** the `lookup_semantic_layer` tool SHALL return metric "gmv" with SQL expression "SUM(orders.amount)" and filters `[{"column":"orders.status","operator":"=","value":"completed"}]`

#### Scenario: Metric matched via display_name
- **WHEN** a user asks "华东区销售额" and metric "gmv" has display_name "商品交易总额" and alias "销售额"
- **THEN** the `lookup_semantic_layer` tool SHALL return metric "gmv"

#### Scenario: No metric match falls back to NL→SQL
- **WHEN** a user asks "上个月新注册用户数" and no metric matches
- **THEN** the `lookup_semantic_layer` tool SHALL return empty results, and the Agent SHALL fall back to NL→SQL generation

### Requirement: Deterministic SQL generation from semantic layer
When a metric is matched via the semantic layer, the Agent SHALL generate SQL by combining the metric's SQL expression, filters, and the semantic model's JOIN definitions. This SQL SHALL be marked as `source: "semantic_layer"` to indicate it is deterministically generated and SHALL skip probe execution. The generated SQL SHALL include: (1) the metric's sql_expression in SELECT, (2) dimension sql_expressions in GROUP BY, (3) the model's base_table and JOINs in FROM, (4) the metric's fixed filters in WHERE, (5) user-specified filters in WHERE.

#### Scenario: Semantic layer SQL generation
- **WHEN** a user asks "各城市销售额" and metric "gmv" matches with model "订单分析模型"
- **THEN** the Agent SHALL generate: `SELECT customers.city AS city, SUM(orders.amount) AS gmv FROM orders LEFT JOIN customers ON orders.customer_id = customers.id WHERE orders.status = 'completed' GROUP BY customers.city`

#### Scenario: Semantic layer SQL with time filter
- **WHEN** a user asks "上个月销售额" and metric "gmv" matches
- **THEN** the Agent SHALL append time filter: `... WHERE orders.status = 'completed' AND DATE_TRUNC('month', orders.created_at) = DATE_TRUNC('month', DATE_SUB(CURRENT_DATE, INTERVAL 1 MONTH))`

### Requirement: AI-assisted semantic layer discovery
The system SHALL provide an `ai_suggest_semantic_layer` tool and REST endpoint `POST /api/datasources/:dsId/ai-suggest-semantic` that analyzes the schema and sample data to recommend metric, dimension, and model definitions. The tool SHALL: (1) identify fact tables vs dimension tables, (2) infer metrics from numeric columns in fact tables, (3) infer dimensions from categorical columns, (4) infer JOIN relationships from foreign keys, (5) return structured recommendations. All recommendations SHALL be saved with `status: "draft"` and require user confirmation.

#### Scenario: AI suggests metrics from fact table
- **WHEN** the user triggers AI semantic layer suggestion for datasource "ds1"
- **THEN** the system SHALL analyze the schema, identify "orders" as a fact table, and suggest metrics like: `{name: "gmv", display_name: "销售额", sql_expression: "SUM(orders.amount)", filters: [...]}`

#### Scenario: AI suggests dimensions
- **WHEN** the user triggers AI semantic layer suggestion
- **THEN** the system SHALL suggest dimensions like: `{name: "city", display_name: "城市", sql_expression: "customers.city", values: ["上海","北京","深圳"]}`

### Requirement: Semantic layer management UI
The frontend SHALL provide a Metrics Management page (accessible from sidebar navigation with view `"metrics"`) where users can: (1) browse metrics grouped by category, (2) create/edit/delete metrics, dimensions, and models, (3) trigger AI semantic layer suggestions, (4) review and confirm draft metrics, (5) test a metric by executing its generated SQL and previewing results, (6) view which conversations have used a metric.

#### Scenario: User creates a metric via UI
- **WHEN** a user fills in the metric form (name, display_name, description, sql_expression, filters, dimensions, aliases) and clicks "Save"
- **THEN** the system SHALL call `POST /api/datasources/:dsId/metrics` and add the metric to the list

#### Scenario: User triggers AI suggestion
- **WHEN** a user clicks "AI Recommend Metrics" on the Metrics Management page
- **THEN** the system SHALL call `POST /api/datasources/:dsId/ai-suggest-semantic`, show a loading indicator, and display the recommended metrics/dimensions/models as drafts for review

#### Scenario: User tests a metric
- **WHEN** a user clicks "Test" on a metric card
- **THEN** the system SHALL call `POST /api/datasources/:dsId/metrics/:id/test`, which SHALL execute the metric's SQL with LIMIT 10, and display the results in a preview table

#### Scenario: User confirms draft metric
- **WHEN** a user clicks "Confirm" on a draft metric
- **THEN** the system SHALL call `PUT /api/datasources/:dsId/metrics/:id` with `{status: "published"}` and update the metric status in the UI

### Requirement: Metric status lifecycle
Metrics SHALL have a status lifecycle: `draft` → `published` → `deprecated`. Only `published` metrics SHALL be used by the Agent for SQL generation. `draft` metrics SHALL be visible in the management UI but not in Agent lookups. `deprecated` metrics SHALL be excluded from both Agent lookups and the default management UI view (accessible via a "Show deprecated" toggle).

#### Scenario: Draft metric not found by Agent
- **WHEN** the Agent calls `lookup_semantic_layer` and the only matching metric has `status: "draft"`
- **THEN** the tool SHALL return empty results (draft metrics are excluded from lookups)

#### Scenario: User deprecates a metric
- **WHEN** a user clicks "Deprecate" on a published metric
- **THEN** the system SHALL update the metric status to "deprecated" and it SHALL no longer appear in Agent lookups
