## ADDED Requirements

### Requirement: Intent classification for user messages
The Agent SHALL classify each user message into one of the following intent types: `new_query` (independent new question), `refine` (modify previous query conditions such as time range or filters), `drill_down` (drill into finer granularity), `roll_up` (roll up to coarser granularity), `compare` (compare periods, groups, or metrics), `explain` (explain results or attribution analysis), `chat` (non-data conversation). The classification SHALL be performed by the Agent via system prompt instructions, not by a separate classifier model. The classified intent SHALL be included in the Agent's internal reasoning but SHALL NOT be shown to the user.

#### Scenario: New query classified
- **WHEN** a user sends "华东区上个月销售额多少"
- **THEN** the Agent SHALL classify this as `new_query` and generate SQL independently

#### Scenario: Follow-up refine classified
- **WHEN** a user sends "和去年同期比呢" after a query about "华东区销售额"
- **THEN** the Agent SHALL classify this as `compare`, inherit the previous query's subject (华东区销售额), and add year-over-year comparison

#### Scenario: Drill-down classified
- **WHEN** a user sends "主要贡献来自哪个城市" after a query about "华东区销售额"
- **THEN** the Agent SHALL classify this as `drill_down`, inherit the previous query's subject and time range, and add city-level breakdown

#### Scenario: Chat message classified
- **WHEN** a user sends "你好"
- **THEN** the Agent SHALL classify this as `chat` and respond conversationally without calling any tools

### Requirement: Previous SQL context injection for follow-ups
When the Agent classifies a user message as `refine`, `drill_down`, `roll_up`, or `compare`, the Agent SHALL include the previous query's SQL and result summary as context for generating the new SQL. The system prompt SHALL instruct the Agent to modify the previous SQL rather than generate from scratch. The previous SQL SHALL be obtained from the Agent's conversation history.

#### Scenario: Refine with previous SQL
- **WHEN** a user asks "换成6月的数据" after a query that generated `SELECT SUM(amount) FROM orders WHERE DATE_TRUNC('month', created_at) = '2025-05-01' AND status = 'completed'`
- **THEN** the Agent SHALL modify the SQL to change the date filter to '2025-06-01' rather than generating a completely new query

#### Scenario: Compare with previous SQL
- **WHEN** a user asks "和去年同期比呢" after a query about current month sales
- **THEN** the Agent SHALL construct a comparison query that includes both current period and same period last year, based on the previous SQL structure

### Requirement: Dimension hierarchy-aware drill-down and roll-up
When the Agent classifies a user message as `drill_down` or `roll_up`, the Agent SHALL use the semantic layer's dimension hierarchy definitions to determine the appropriate granularity change. If the semantic layer is not configured for the relevant dimension, the Agent SHALL infer the hierarchy from common patterns (e.g., region → province → city, year → quarter → month).

#### Scenario: Drill-down with semantic layer hierarchy
- **WHEN** a user asks "按城市看" after viewing data by "大区" and the dimension "region" has hierarchy `{"levels":["region","province","city"]}`
- **THEN** the Agent SHALL drill down to the "city" level using the dimension's SQL expression

#### Scenario: Drill-down without semantic layer
- **WHEN** a user asks "按城市看" after viewing data by region and no semantic layer hierarchy is defined
- **THEN** the Agent SHALL infer the drill-down to city level from the schema and generate appropriate SQL

### Requirement: Multi-turn conversation context display
The frontend SHALL display a subtle indicator when the Agent is responding to a follow-up question (not a new query). The indicator SHALL show the referenced context, e.g., "追问：基于上轮查询「华东区5月销售额」". This context SHALL be extracted from the Agent's response metadata.

#### Scenario: Follow-up indicator displayed
- **WHEN** the Agent classifies a user message as `refine` and responds based on the previous query
- **THEN** the frontend SHALL display a tag "追问" with a brief description of the referenced context above the Agent's response

### Requirement: Conversation context reset
The frontend SHALL provide a "New Topic" button in the chat input area. When clicked, the frontend SHALL send a `reset_context` message to the Agent via WebSocket, which SHALL instruct the Agent to treat subsequent messages as `new_query` regardless of conversation history. The Agent SHALL also receive an updated system prompt that does not include previous SQL context.

#### Scenario: User resets conversation context
- **WHEN** a user clicks "New Topic" after a series of follow-up queries
- **THEN** the system SHALL send a `reset_context` WebSocket message, and subsequent user messages SHALL be classified as `new_query` without inheriting previous query context
