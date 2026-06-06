## ADDED Requirements

### Requirement: Global search across data dictionary
The frontend SHALL provide a data dictionary page (accessible from sidebar with view `"dictionary"`) with a search interface that searches across: (1) semantic metrics (name, display_name, aliases, description), (2) semantic dimensions (name, display_name, values), (3) database tables (name, comment, business description annotation), (4) database columns (name, comment, business description annotation, value domain). The search SHALL be performed via a REST endpoint `GET /api/datasources/:dsId/dictionary/search?q=<query>` that returns grouped results by type (metrics, dimensions, tables, columns).

#### Scenario: Search for "销售额"
- **WHEN** a user types "销售额" in the data dictionary search
- **THEN** the system SHALL return: (1) metric "gmv" with display_name "商品交易总额" and aliases ["成交额","交易额","GMV","revenue","销售额"], (2) table "orders" with annotation "订单事实表", (3) column "orders.amount" with annotation "订单金额（单位：元），不含运费"

#### Scenario: Search for "GMV"
- **WHEN** a user types "GMV" in the data dictionary search
- **THEN** the system SHALL return: (1) metric "gmv" with alias "GMV", (2) a cross-reference note: "GMV → 同「商品交易总额」，见指标定义"

#### Scenario: No results found
- **WHEN** a user searches for a term with no matches
- **THEN** the system SHALL return empty results with a suggestion: "未找到匹配结果。试试搜索表名、字段名或业务术语。"

### Requirement: Data dictionary entry detail view
The frontend SHALL provide a detail view for each data dictionary entry type:
- **Metric**: display_name, description, sql_expression, filters, available dimensions, aliases, status, usage count (how many times used in queries)
- **Dimension**: display_name, sql_expression, data_type, hierarchy, common values, related metrics
- **Table**: business description, column list with annotations, foreign keys, common query examples, related metrics and dimensions
- **Column**: business description, value domain (enum values or range), data type, nullable, default value, related foreign keys

#### Scenario: View metric detail
- **WHEN** a user clicks on metric "gmv" in search results
- **THEN** the frontend SHALL show a detail panel with: 展示名: 商品交易总额, 业务含义: 所有已完成订单的金额总和, 计算逻辑: SUM(orders.amount), 过滤条件: orders.status = 'completed', 可分析维度: 城市/月份/品类, 别名: 成交额,交易额,GMV,revenue, 状态: 已发布, 使用次数: 42

#### Scenario: View table detail
- **WHEN** a user clicks on table "orders" in search results
- **THEN** the frontend SHALL show a detail panel with: business description, all columns with annotations, foreign keys, common query examples, and a list of metrics that use this table

### Requirement: Data dictionary cross-references
The data dictionary SHALL maintain and display cross-references between entries: (1) metrics ↔ dimensions (which dimensions are available for a metric, which metrics use a dimension), (2) metrics ↔ tables (which tables a metric queries from, which metrics are defined on a table), (3) columns ↔ foreign keys (related tables and columns), (4) synonyms/aliases (terms that map to the same entity). Cross-references SHALL be clickable to navigate to the referenced entry.

#### Scenario: Navigate from metric to table
- **WHEN** a user views metric "gmv" and clicks the link to table "orders"
- **THEN** the frontend SHALL navigate to the table detail view for "orders"

#### Scenario: View synonyms
- **WHEN** a user views metric "gmv"
- **THEN** the detail view SHALL show a "同义词" section listing: 成交额, 交易额, GMV, revenue, 销售额 — each clickable to confirm they all refer to the same metric

### Requirement: Data dictionary browsing by category
The frontend SHALL support browsing the data dictionary by category: (1) Metrics grouped by `category` field, (2) Dimensions grouped by `data_type`, (3) Tables listed alphabetically, (4) Recent changes (annotations updated in the last 7 days). The browsing view SHALL show counts per category and expand/collapse functionality.

#### Scenario: Browse metrics by category
- **WHEN** a user navigates to the data dictionary and selects "Metrics" tab
- **THEN** the frontend SHALL show metrics grouped by category: 财务指标 (5), 运营指标 (8), 用户指标 (3), with expand/collapse per group

#### Scenario: Browse recent changes
- **WHEN** a user clicks "Recent Changes" in the data dictionary
- **THEN** the frontend SHALL show annotations, metrics, and dimensions that were created or updated in the last 7 days

### Requirement: Data dictionary REST API
The system SHALL provide REST API endpoints:
- `GET /api/datasources/:dsId/dictionary/search?q=<query>` — search
- `GET /api/datasources/:dsId/dictionary/metrics` — list all metrics (reuses semantic layer API)
- `GET /api/datasources/:dsId/dictionary/dimensions` — list all dimensions
- `GET /api/datasources/:dsId/dictionary/tables` — list all tables with annotations and column details
- `GET /api/datasources/:dsId/dictionary/tables/:tableName` — table detail with columns, FKs, examples
- `GET /api/datasources/:dsId/dictionary/recent-changes` — entries updated in last 7 days

#### Scenario: Search API returns grouped results
- **WHEN** `GET /api/datasources/ds1/dictionary/search?q=销售额` is called
- **THEN** the system SHALL return JSON with `metrics: [...]`, `dimensions: [...]`, `tables: [...]`, `columns: [...]` arrays

#### Scenario: Table detail API
- **WHEN** `GET /api/datasources/ds1/dictionary/tables/orders` is called
- **THEN** the system SHALL return table info with all columns (including annotations and value domains), foreign keys, common query examples, and related metrics
