## ADDED Requirements

### Requirement: Structured result summary in Agent response
The Agent SHALL generate a structured natural language summary after every SQL query execution. The summary SHALL follow a consistent format: (1) **Key Finding**: the most important number or fact, (2) **Trend/Comparison**: comparison with previous period or across categories if applicable, (3) **Anomaly**: any notable outliers, unexpected values, or significant changes. The Agent SHALL be instructed via system prompt to always produce this structured summary.

#### Scenario: Summary with key finding and trend
- **WHEN** the Agent executes a query returning "华东区5月销售额1,234万元"
- **THEN** the Agent response SHALL include a structured summary like: "**关键发现**: 华东区5月销售额1,234万元。**趋势**: 同比增长15.3%。**异常**: 南京出现5%下滑。"

#### Scenario: Summary for simple lookup
- **WHEN** the Agent executes a query returning "订单 #12345 的状态为已发货"
- **THEN** the Agent response SHALL include a brief summary: "**结果**: 订单 #12345 当前状态为已发货。"

### Requirement: Result summary card component
The frontend SHALL render a `ResultSummaryCard` component above the table result for each SQL query. The component SHALL parse the Agent's structured summary text (identified by markdown bold markers `**关键发现**`, `**趋势**`, `**异常**`, `**结果**`) and render it as a styled card with icons: 🔑 for key finding, 📈 for trend, ⚠️ for anomaly. The card SHALL be collapsible.

#### Scenario: Summary card rendered with all sections
- **WHEN** an Agent response contains "**关键发现**: 销售额1,234万。**趋势**: 同比+15%。**异常**: 南京-5%。"
- **THEN** the frontend SHALL render a summary card with three rows: 🔑 销售额1,234万, 📈 同比+15%, ⚠️ 南京-5%

#### Scenario: Summary card collapsed
- **WHEN** a user clicks the collapse button on the summary card
- **THEN** the card SHALL collapse to show only the key finding row, with an expand button to show all rows

### Requirement: Trend annotation in table results
When the query result contains time-series data (identified by a date/timestamp column and numeric columns), the frontend SHALL automatically calculate period-over-period changes (if two time periods are present) and display them as inline annotations in the table. Positive changes SHALL be shown in green with ↑, negative changes in red with ↓.

#### Scenario: Month-over-month change displayed
- **WHEN** a query returns monthly data with columns `[month, revenue]` and values `[{month: "2025-04", revenue: 1000}, {month: "2025-05", revenue: 1200}]`
- **THEN** the frontend SHALL display an additional column "环比" with value "↑ 20%" in green for the 2025-05 row

### Requirement: Anomaly highlighting in table results
The frontend SHALL highlight cells in the table result that contain statistically anomalous values. A value SHALL be considered anomalous if it is more than 2 standard deviations from the column mean (for numeric columns). Anomalous cells SHALL be highlighted with a red background and a ⚠️ icon on hover showing "This value appears unusual compared to other values in this column".

#### Scenario: Anomalous value highlighted
- **WHEN** a query returns a numeric column with values [100, 105, 98, 102, 5000] and 5000 is >2σ from the mean
- **THEN** the frontend SHALL highlight the cell containing 5000 with a red background and ⚠️ icon

### Requirement: Result explanation on demand
The frontend SHALL provide a "Explain this result" button below each table result. When clicked, the frontend SHALL send a message to the Agent asking "请解释这个查询结果是怎么得出的：{sql_query}". The Agent SHALL respond with a step-by-step explanation of what the SQL does and how the result was derived.

#### Scenario: User requests explanation
- **WHEN** a user clicks "Explain this result" below a table showing query results
- **THEN** the frontend SHALL send a follow-up message to the Agent with the SQL query, and the Agent SHALL explain the query logic and result derivation
