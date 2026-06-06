## ADDED Requirements

### Requirement: Scheduled query storage
The system SHALL store scheduled query definitions in a `scheduled_queries` SQLite table with fields: `id` (TEXT PK), `datasource_id` (TEXT FK), `name` (TEXT), `description` (TEXT, nullable), `sql` (TEXT), `cron_expression` (TEXT, e.g. "0 9 * * 1" for every Monday 9am), `timezone` (TEXT, default "Asia/Shanghai"), `enabled` (INTEGER, default 1), `last_run_at` (TEXT, nullable), `last_run_status` (TEXT, nullable, "success"/"error"), `last_run_result` (TEXT, nullable, JSON of query result summary), `created_at`, `updated_at`.

#### Scenario: Create a scheduled query
- **WHEN** a user creates a scheduled query with name "每周销售摘要", sql "SELECT ...", cron "0 9 * * 1"
- **THEN** the system SHALL store it and register a cron job to execute it every Monday at 9am

#### Scenario: Duplicate name rejected
- **WHEN** a user creates a scheduled query with a name that already exists for this datasource
- **THEN** the system SHALL return a 409 error

### Requirement: Scheduled query execution
The system SHALL execute scheduled queries using `node-cron`. When a cron trigger fires, the system SHALL: (1) execute the SQL against the configured datasource, (2) store the execution result summary in `last_run_result` (JSON with `rowCount`, `executionTime`, `columns`, first 5 rows), (3) update `last_run_at` and `last_run_status`, (4) check alert conditions if configured.

#### Scenario: Scheduled query executes successfully
- **WHEN** the cron trigger fires for "每周销售摘要"
- **THEN** the system SHALL execute the SQL, store the result summary, update `last_run_at` and set `last_run_status: "success"`

#### Scenario: Scheduled query execution fails
- **WHEN** the SQL execution fails (e.g., syntax error, connection timeout)
- **THEN** the system SHALL update `last_run_status: "error"` and store the error message in `last_run_result`

#### Scenario: Server restart restores cron jobs
- **WHEN** the server starts up
- **THEN** the system SHALL load all enabled scheduled queries from SQLite and register their cron jobs

### Requirement: Alert conditions for scheduled queries
Each scheduled query SHALL support optional alert conditions stored as a JSON field `alert_conditions` in the `scheduled_queries` table. Alert conditions SHALL define: (1) `metric_column` (which column to monitor), (2) `condition` ("above"/"below"/"change_above"/"change_below"), (3) `threshold` (numeric value or percentage for change conditions). When an alert condition is triggered, the system SHALL store an alert record in a `query_alerts` table.

#### Scenario: Alert on value threshold
- **WHEN** a scheduled query monitors `total_sales` with condition "below" threshold 1000000 and the result is 800000
- **THEN** the system SHALL create an alert record in `query_alerts` with severity "warning"

#### Scenario: Alert on change threshold
- **WHEN** a scheduled query monitors `total_sales` with condition "change_below" threshold -10% and the value dropped 15% from last run
- **THEN** the system SHALL create an alert record in `query_alerts` with severity "critical"

### Requirement: Alert notification display
The frontend SHALL display alert notifications in the chat interface. When a new alert is generated, it SHALL appear as a system message in the active conversation (or a dedicated "Alerts" conversation). Each alert SHALL show: (1) the scheduled query name, (2) the alert condition that was triggered, (3) the actual value vs. threshold, (4) a "View Details" link that shows the full query result.

#### Scenario: Alert displayed in chat
- **WHEN** a scheduled query triggers an alert
- **THEN** the frontend SHALL display a system message with ⚠️ icon showing: "告警：每周销售摘要 - 销售额低于阈值 (80万 < 100万)"

### Requirement: Scheduled query management UI
The frontend SHALL provide a "Scheduled Queries" page (accessible from sidebar with view `"scheduled"`) where users can: (1) list all scheduled queries with their status and last run info, (2) create/edit/delete scheduled queries, (3) enable/disable queries, (4) view execution history, (5) configure alert conditions, (6) manually trigger a query execution.

#### Scenario: User creates a scheduled query via UI
- **WHEN** a user fills in the form (name, SQL, cron expression, alert conditions) and clicks "Save"
- **THEN** the system SHALL call `POST /api/datasources/:dsId/scheduled-queries` and register the cron job

#### Scenario: User manually triggers execution
- **WHEN** a user clicks "Run Now" on a scheduled query
- **THEN** the system SHALL execute the SQL immediately and show the result in a preview panel

#### Scenario: User views execution history
- **WHEN** a user clicks "History" on a scheduled query
- **THEN** the system SHALL show a list of past executions with timestamps, status, and result summaries

### Requirement: Scheduled query CRUD REST API
The system SHALL provide REST API endpoints:
- `GET /api/datasources/:dsId/scheduled-queries` — list
- `POST /api/datasources/:dsId/scheduled-queries` — create
- `PUT /api/datasources/:dsId/scheduled-queries/:id` — update
- `DELETE /api/datasources/:dsId/scheduled-queries/:id` — delete
- `POST /api/datasources/:dsId/scheduled-queries/:id/execute` — manual trigger
- `GET /api/datasources/:dsId/scheduled-queries/:id/history` — execution history
- `GET /api/datasources/:dsId/query-alerts` — list recent alerts

#### Scenario: Create via API
- **WHEN** a user sends `POST /api/datasources/ds1/scheduled-queries` with valid body
- **THEN** the system SHALL create the scheduled query, register the cron job, and return the created record with status 201

#### Scenario: Delete via API
- **WHEN** a user sends `DELETE /api/datasources/ds1/scheduled-queries/q1`
- **THEN** the system SHALL delete the record, unregister the cron job, and return status 204
