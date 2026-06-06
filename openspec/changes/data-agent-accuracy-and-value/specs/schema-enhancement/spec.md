## ADDED Requirements

### Requirement: Column value domain discovery
The system SHALL automatically discover column value domains during schema discovery. For each column, the system SHALL sample `SELECT DISTINCT column FROM table LIMIT 20` to obtain enumeration values (for string columns with ≤50 distinct values) or `SELECT MIN(column), MAX(column), AVG(column) FROM table` for numeric range statistics. The discovered value domains SHALL be stored in the `column_annotations` table with a `domain_type` field (`enum` or `range`) and a `domain_values` field (JSON array for enum, JSON object `{min, max, avg}` for range).

#### Scenario: Enum column domain discovery
- **WHEN** `discover_schema` is called for a datasource
- **THEN** for each VARCHAR/CHAR/ENUM column with ≤50 distinct values, the system SHALL query `SELECT DISTINCT column FROM table LIMIT 20` and store the results as `domain_type: "enum"` with `domain_values: ["value1", "value2", ...]` in the annotation

#### Scenario: Numeric column domain discovery
- **WHEN** `discover_schema` is called for a datasource
- **THEN** for each INTEGER/DECIMAL/FLOAT/DOUBLE column, the system SHALL query `SELECT MIN(column), MAX(column), AVG(column) FROM table` and store the results as `domain_type: "range"` with `domain_values: {"min": 0, "max": 9999, "avg": 500}` in the annotation

#### Scenario: Large table value domain sampling
- **WHEN** a table has more than 100,000 rows
- **THEN** the system SHALL use `SELECT DISTINCT column FROM table LIMIT 20` with a 5-second timeout for enum discovery, and skip the column if the query times out

### Requirement: Enhanced schema prompt with value domains and relationships
The `formatSchemaForPrompt()` function SHALL include column value domains and inter-column relationships in the generated prompt text. For each column with a discovered domain, the prompt SHALL include `Values: [v1, v2, ...]` for enum domains or `Range: min~max (avg: X)` for range domains. For columns with known inter-column relationships (e.g., "amount does not include shipping"), the prompt SHALL include `Note: <relationship>`.

#### Scenario: Schema prompt includes enum values
- **WHEN** a column `status` has domain_type `enum` with values `["pending", "paid", "shipped", "completed", "cancelled"]`
- **THEN** the schema prompt SHALL render: `  - status (VARCHAR) NOT NULL Values: [pending, paid, shipped, completed, cancelled]`

#### Scenario: Schema prompt includes numeric range
- **WHEN** a column `amount` has domain_type `range` with values `{"min": 0, "max": 9999, "avg": 500}`
- **THEN** the schema prompt SHALL render: `  - amount (DECIMAL) NOT NULL Range: 0~9999 (avg: 500)`

### Requirement: Common query examples per table
The system SHALL support storing and displaying 2-3 common query examples per table in the schema prompt. Common query examples SHALL be stored in a new `table_query_examples` SQLite table with fields: `id`, `datasource_id`, `table_name`, `question` (natural language), `sql` (corresponding SQL), `is_verified` (boolean). The `formatSchemaForPrompt()` function SHALL include a `### Common Queries:` section for each table that has examples.

#### Scenario: Schema prompt includes common queries
- **WHEN** table `orders` has 2 verified common query examples
- **THEN** the schema prompt SHALL include a section after Foreign Keys:
  ```
  ### Common Queries:
    - "月度销售额" → SELECT DATE_TRUNC('month', created_at), SUM(amount) FROM orders WHERE status='completed' GROUP BY 1
    - "各状态订单数" → SELECT status, COUNT(*) FROM orders GROUP BY status
  ```

#### Scenario: Common query example CRUD via REST API
- **WHEN** a user sends `POST /api/datasources/:dsId/table-query-examples` with body `{table_name, question, sql}`
- **THEN** the system SHALL create a new query example record and return it with status 201

### Requirement: AI auto-annotation generation
The system SHALL provide an Agent tool `ai_annotate_schema` and a REST endpoint `POST /api/datasources/:dsId/ai-annotate` that automatically generates schema annotations using LLM. The tool SHALL accept a list of table names, retrieve DDL + sample data (5 rows) for each table, call the configured LLM with a structured prompt, and return generated annotations including: table description, column business semantics, inferred value domains, and inferred foreign keys. Generated annotations SHALL be saved with `status: "draft"` and MUST be confirmed by the user before being used in schema prompts.

#### Scenario: AI annotation via Agent tool
- **WHEN** the Agent calls `ai_annotate_schema` with `{datasource_id: "ds1", table_names: ["orders", "customers"]}`
- **THEN** the system SHALL: (1) retrieve DDL and 5 sample rows for each table, (2) call LLM with annotation prompt, (3) return structured JSON with table descriptions, column semantics, value domains, and inferred FKs, (4) save all annotations with `status: "draft"`

#### Scenario: AI annotation via REST API
- **WHEN** a user sends `POST /api/datasources/ds1/ai-annotate` with body `{table_names: ["orders"]}`
- **THEN** the system SHALL return the generated annotations as JSON and save them as draft

#### Scenario: Draft annotation confirmation
- **WHEN** a user sends `PUT /api/datasources/:dsId/annotations/:id/confirm`
- **THEN** the system SHALL update the annotation status from `"draft"` to `"confirmed"` and the annotation SHALL be included in subsequent schema prompts

#### Scenario: Draft annotations excluded from schema prompt
- **WHEN** an annotation has `status: "draft"`
- **THEN** the `formatSchemaForPrompt()` function SHALL NOT include this annotation in the generated prompt text

### Requirement: Schema annotation status tracking
The `schema_annotations` table SHALL be extended with a `status` field (`"draft"` or `"confirmed"`, default `"confirmed"` for manually created annotations) and a `domain_type` field (`"enum"` or `"range"` or null) and a `domain_values` field (JSON text or null). Only annotations with `status: "confirmed"` SHALL be used in schema prompts and Agent context.

#### Scenario: Manual annotation auto-confirmed
- **WHEN** a user creates an annotation manually via `PUT /api/datasources/:dsId/annotations`
- **THEN** the annotation SHALL be saved with `status: "confirmed"` by default

#### Scenario: AI annotation is draft
- **WHEN** an annotation is generated by `ai_annotate_schema`
- **THEN** the annotation SHALL be saved with `status: "draft"`

### Requirement: Incremental schema sync
The `discover_schema` function SHALL support incremental sync by tracking the last sync timestamp per datasource in the `app_config` table (key: `schema_sync_<datasource_id>`). When called with `incremental: true`, the system SHALL only discover tables whose `CREATE_TIME` or `UPDATE_TIME` in `INFORMATION_SCHEMA.TABLES` is after the last sync timestamp. Existing confirmed annotations SHALL be preserved and not overwritten.

#### Scenario: Full sync on first discovery
- **WHEN** `discover_schema` is called for a datasource with no prior sync record
- **THEN** the system SHALL perform a full schema discovery and record the sync timestamp

#### Scenario: Incremental sync preserves annotations
- **WHEN** `discover_schema` is called with `incremental: true` for a previously synced datasource
- **THEN** the system SHALL only query tables modified since the last sync, and SHALL NOT overwrite any existing confirmed annotations

### Requirement: Schema enhancement management UI
The frontend SHALL provide a Schema Enhancement page (accessible from the existing Schema page) where users can: (1) view AI-generated draft annotations and confirm/reject/edit them, (2) add/edit/delete common query examples per table, (3) view and edit column value domains, (4) trigger AI auto-annotation for selected tables, (5) view the enhanced schema prompt preview.

#### Scenario: User confirms AI-generated annotation
- **WHEN** a user clicks "Confirm" on a draft annotation in the Schema Enhancement page
- **THEN** the system SHALL call `PUT /api/datasources/:dsId/annotations/:id/confirm` and update the annotation status to "confirmed" in the UI

#### Scenario: User triggers AI annotation
- **WHEN** a user selects tables and clicks "AI Annotate" in the Schema Enhancement page
- **THEN** the system SHALL call `POST /api/datasources/:dsId/ai-annotate` with the selected table names, show a loading indicator, and display the generated draft annotations for review

#### Scenario: User adds common query example
- **WHEN** a user fills in the question and SQL fields and clicks "Save" in the Common Queries section
- **THEN** the system SHALL call `POST /api/datasources/:dsId/table-query-examples` and add the new example to the list

#### Scenario: User previews enhanced schema prompt
- **WHEN** a user clicks "Preview Prompt" in the Schema Enhancement page
- **THEN** the system SHALL call `GET /api/datasources/:dsId/schema-prompt-preview` and display the rendered schema prompt that the Agent would see
