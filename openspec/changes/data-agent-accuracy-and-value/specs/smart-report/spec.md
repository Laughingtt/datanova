## ADDED Requirements

### Requirement: Report generation from natural language
The Agent SHALL support generating structured analysis reports when a user requests one (e.g., "帮我生成一份5月销售月报", "写一份Q1运营分析报告"). The Agent SHALL automatically orchestrate multiple queries to populate a report template. The report SHALL contain sections: (1) Executive Summary, (2) Key Metrics Overview, (3) Dimensional Analysis, (4) Trend Analysis, (5) Anomalies & Insights, (6) Recommendations.

#### Scenario: Monthly sales report generated
- **WHEN** a user asks "帮我生成一份5月销售月报"
- **THEN** the Agent SHALL: (1) identify relevant metrics from the semantic layer (sales, orders, etc.), (2) execute queries for overall metrics, dimensional breakdown, month-over-month and year-over-year comparisons, (3) compile results into a structured report with the 6 sections

#### Scenario: Report without semantic layer
- **WHEN** a user requests a report but no semantic layer is configured
- **THEN** the Agent SHALL infer relevant tables and metrics from the schema and generate a report based on available data, with a note: "未配置语义层，部分指标准确性可能需要人工确认"

### Requirement: Report rendering and display
The frontend SHALL render reports in a dedicated `ReportView` component with: (1) a report header with title and date, (2) each section rendered as a collapsible card, (3) embedded tables and charts for each section's data, (4) the Agent's natural language analysis text, (5) an export button for downloading the report.

#### Scenario: Report rendered with sections
- **WHEN** the Agent generates a report
- **THEN** the frontend SHALL render it in the chat as a report card with collapsible sections, each containing data tables/charts and analysis text

#### Scenario: Report section expanded/collapsed
- **WHEN** a user clicks a section header in the report
- **THEN** the section SHALL expand to show the full content or collapse to show only the section title and key metric

### Requirement: Report export
The frontend SHALL provide export functionality for generated reports. The export SHALL include: (1) all sections with analysis text, (2) embedded data tables (as formatted text), (3) the SQL queries used to generate each section's data. Export formats SHALL include Markdown (default) and HTML. The export SHALL be generated client-side.

#### Scenario: Export report as Markdown
- **WHEN** a user clicks "Export" and selects "Markdown" format
- **THEN** the frontend SHALL generate a Markdown file containing the full report and download it

#### Scenario: Export report as HTML
- **WHEN** a user clicks "Export" and selects "HTML" format
- **THEN** the frontend SHALL generate an HTML file with styled content and download it

### Requirement: Report template customization
The frontend SHALL allow users to customize report templates. A template SHALL define: (1) report title format, (2) sections to include/exclude, (3) metrics to include, (4) dimensions for analysis, (5) comparison periods. Templates SHALL be stored in the `app_config` table as JSON. Users SHALL be able to save, load, and delete templates.

#### Scenario: User creates a custom template
- **WHEN** a user configures a report template with custom sections and metrics and clicks "Save Template"
- **THEN** the system SHALL save the template to `app_config` and make it available for future report generation

#### Scenario: User generates report from template
- **WHEN** a user selects a saved template and clicks "Generate Report"
- **THEN** the Agent SHALL use the template's configuration to generate a report matching the template structure
