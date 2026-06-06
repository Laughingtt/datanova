## ADDED Requirements

### Requirement: Attribution analysis Agent capability
The Agent SHALL support attribution analysis when a user asks "why" questions about data changes (e.g., "为什么销售额下降了？", "什么原因导致GMV增长？"). The Agent SHALL: (1) confirm the fact (verify the change is real), (2) perform multi-dimensional decomposition (break down by available dimensions), (3) identify the largest contributing factor, (4) cross-reference dimensions to pinpoint the root cause, (5) generate a natural language attribution conclusion.

#### Scenario: Basic attribution analysis
- **WHEN** a user asks "为什么华东区销售额下降了？"
- **THEN** the Agent SHALL: (1) verify the decline with a time comparison query, (2) break down by city dimension, (3) identify the city with the largest decline, (4) break down by category within that city, (5) generate conclusion: "华东区销售额下降12%，主要受南京线下服装渠道拖累（-35%）"

#### Scenario: Attribution with insufficient data
- **WHEN** a user asks "为什么X下降了" but the data does not show a statistically significant decline
- **THEN** the Agent SHALL respond: "数据显示X的变化在正常波动范围内（变化幅度X%），可能不需要特别的归因分析。是否需要我进一步分析？"

### Requirement: Dimension-aware decomposition
The Agent SHALL use the semantic layer's dimension hierarchy definitions to perform structured decomposition. For each available dimension in the relevant semantic model, the Agent SHALL execute a comparison query (current period vs. previous period) grouped by that dimension, then identify the dimension values with the largest absolute contribution to the change.

#### Scenario: Multi-dimension decomposition with semantic layer
- **WHEN** the semantic model "订单分析模型" has dimensions [city, category, channel] and the user asks for attribution
- **THEN** the Agent SHALL execute 3 comparison queries (by city, by category, by channel) and identify the top contributing value in each dimension

#### Scenario: Decomposition without semantic layer
- **WHEN** no semantic layer is configured and the user asks for attribution
- **THEN** the Agent SHALL infer relevant dimensions from the schema (categorical columns in related tables) and perform decomposition

### Requirement: Attribution analysis result display
The frontend SHALL render attribution analysis results in a structured format: (1) a **Fact Summary** section showing the confirmed change with a comparison visualization, (2) a **Dimension Decomposition** section showing contribution breakdown by dimension with a waterfall or contribution chart, (3) a **Root Cause** section highlighting the cross-referenced finding, (4) an **Action Suggestion** section with the Agent's recommended next steps.

#### Scenario: Attribution result rendered
- **WHEN** the Agent completes an attribution analysis
- **THEN** the frontend SHALL render the result with sections: 事实确认 → 维度拆解 → 根因定位 → 行动建议

#### Scenario: Contribution chart displayed
- **WHEN** the dimension decomposition has numerical contribution data
- **THEN** the frontend SHALL render a horizontal bar chart showing each dimension value's contribution to the change (positive in green, negative in red)

### Requirement: Attribution analysis triggered by follow-up
The Agent SHALL automatically recognize attribution-related follow-up questions such as "为什么", "什么原因", "怎么解释" after a data query result. The Agent SHALL classify these as `explain` intent and initiate attribution analysis using the previous query's context (table, metric, time range).

#### Scenario: Attribution triggered by follow-up
- **WHEN** a user sees "华东区5月销售额1,234万，同比-12%" and then asks "为什么下降这么多？"
- **THEN** the Agent SHALL classify this as `explain` intent and initiate attribution analysis for 华东区销售额 decline
