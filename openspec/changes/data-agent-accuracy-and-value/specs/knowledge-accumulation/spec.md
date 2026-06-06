## ADDED Requirements

### Requirement: Query examples storage
The system SHALL store successful query examples in a `query_examples` SQLite table with fields: `id` (TEXT PK), `datasource_id` (TEXT FK), `conversation_id` (TEXT), `question` (TEXT, natural language question), `sql` (TEXT, corresponding SQL), `tables_used` (TEXT, JSON array of table names), `difficulty` (TEXT, "simple"/"medium"/"complex"), `success_count` (INTEGER, default 1), `is_verified` (INTEGER, default 0), `created_at`, `updated_at`.

#### Scenario: Successful query auto-saved
- **WHEN** a SQL query executes successfully and returns non-empty results
- **THEN** the system SHALL automatically save the question-SQL pair to `query_examples` with `is_verified: 0`

#### Scenario: Duplicate question updates success count
- **WHEN** a question-SQL pair already exists in `query_examples` and the same SQL is executed successfully again
- **THEN** the system SHALL increment `success_count` by 1 and update `updated_at`

### Requirement: Few-shot example injection into prompt
When the Agent processes a new user question, the `discover_schema` tool or a dedicated `lookup_examples` tool SHALL search for similar past queries in `query_examples`. The search SHALL use keyword matching: (1) extract table names and key terms from the user question, (2) match against `question` and `tables_used` fields, (3) return the top 3 most relevant examples ordered by `success_count` DESC, preferring `is_verified: 1` examples. The matched examples SHALL be injected into the Agent's context as Few-Shot examples in the system prompt or tool result.

#### Scenario: Relevant examples found
- **WHEN** a user asks "华东区各城市上月销售额" and there are verified examples about "销售额" queries on the `orders` table
- **THEN** the system SHALL return up to 3 relevant examples with their question-SQL pairs to the Agent as Few-Shot context

#### Scenario: No relevant examples found
- **WHEN** a user asks a question with no matching examples in `query_examples`
- **THEN** the system SHALL return an empty list and the Agent SHALL generate SQL without Few-Shot context

#### Scenario: Verified examples preferred
- **WHEN** there are both verified and unverified examples matching a query
- **THEN** the system SHALL return verified examples first, then unverified ones, up to the limit of 3

### Requirement: User feedback on query results
The frontend SHALL display feedback buttons (👍 Accurate / 👎 Inaccurate) below each SQL query result in the chat. When a user clicks 👍, the frontend SHALL send `POST /api/conversations/:convId/messages/:msgId/feedback` with `{rating: "positive"}`. When a user clicks 👎, the frontend SHALL show a feedback form asking the user to select the issue type: "Wrong table", "Wrong column", "Wrong filter", "Wrong value", or "Other" with an optional text input. The feedback SHALL be stored in a `query_feedback` SQLite table with fields: `id`, `message_id`, `conversation_id`, `rating` ("positive"/"negative"), `issue_type` (TEXT, nullable), `issue_detail` (TEXT, nullable), `created_at`.

#### Scenario: Positive feedback submitted
- **WHEN** a user clicks 👍 on a query result
- **THEN** the system SHALL save the feedback with `rating: "positive"` and mark the corresponding `query_example` as `is_verified: 1`

#### Scenario: Negative feedback with issue type
- **WHEN** a user clicks 👎 and selects "Wrong filter" as the issue type
- **THEN** the system SHALL save the feedback with `rating: "negative"`, `issue_type: "Wrong filter"`, and mark the corresponding `query_example` for review (decrement success_count or flag for removal)

#### Scenario: Negative feedback triggers Agent correction
- **WHEN** a user clicks 👎 and provides feedback "应该是completed状态的订单，不是all"
- **THEN** the system SHALL save the feedback AND send a follow-up message to the Agent: "用户反馈查询结果不准确：应该是completed状态的订单，不是all。请修正SQL重新查询。"

### Requirement: Feedback-driven knowledge management
The system SHALL use feedback data to manage the Few-Shot knowledge base: (1) positive feedback SHALL mark the query example as `is_verified: 1`, (2) 3 or more negative feedbacks on the same question-SQL pair SHALL mark it as `is_verified: 0` and reduce its retrieval priority, (3) the system SHALL periodically (on startup and every 24 hours) identify high-frequency failure patterns (same issue_type) and log them for review.

#### Scenario: Positive feedback verifies example
- **WHEN** a query example has `is_verified: 0` and receives positive feedback
- **THEN** the system SHALL update `is_verified` to 1 for that example

#### Scenario: Repeated negative feedback flags example
- **WHEN** a query example receives 3 negative feedbacks
- **THEN** the system SHALL set `is_verified: 0` and add a `flagged: true` attribute, removing it from Few-Shot retrieval

### Requirement: Few-Shot management UI
The frontend SHALL provide a "Query Examples" section within the Metrics Management page where users can: (1) browse all saved query examples grouped by datasource and difficulty, (2) manually add/edit/delete examples, (3) mark examples as verified or unverified, (4) view feedback statistics per example, (5) see flagged examples for review.

#### Scenario: User verifies a query example
- **WHEN** a user clicks "Verify" on an unverified query example
- **THEN** the system SHALL call `PUT /api/datasources/:dsId/query-examples/:id` with `{is_verified: true}` and update the example's status

#### Scenario: User deletes a flagged example
- **WHEN** a user clicks "Delete" on a flagged query example
- **THEN** the system SHALL call `DELETE /api/datasources/:dsId/query-examples/:id` and remove it from the knowledge base
