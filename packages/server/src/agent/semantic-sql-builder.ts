/**
 * buildSemanticSql — Deterministically build SQL from semantic layer data.
 * This is the most important function for accuracy:
 * when a metric is found in the semantic layer, we generate SQL
 * deterministically rather than relying on NL→SQL.
 */
export function buildSemanticSql(options: {
  metric: { sql_expression: string; name: string; filters: string };
  dimensions: Array<{ sql_expression: string; name: string }>;
  model: { base_table: string; joins: string };
  userFilters?: Array<{ column: string; operator: string; value: string }>;
}): string {
  const { metric, dimensions, model, userFilters } = options;

  // 1. Build SELECT: metric expression + dimension expressions
  const selectParts = [`${metric.sql_expression} AS ${metric.name}`];
  for (const dim of dimensions) {
    selectParts.push(`${dim.sql_expression} AS ${dim.name}`);
  }

  // 2. Build FROM + JOINs
  let fromClause = model.base_table;
  try {
    const joins = JSON.parse(model.joins) as Array<{ table: string; on: string; type: string }>;
    for (const j of joins) {
      fromClause += ` ${j.type.toUpperCase()} JOIN ${j.table} ON ${j.on}`;
    }
  } catch { /* no joins or invalid JSON */ }

  // 3. Build WHERE: metric fixed filters + user filters
  const whereParts: string[] = [];
  try {
    const metricFilters = JSON.parse(metric.filters) as Array<{ column: string; operator: string; value: string }>;
    for (const f of metricFilters) {
      whereParts.push(`${f.column} ${f.operator} ${typeof f.value === "string" ? `'${f.value}'` : f.value}`);
    }
  } catch { /* no metric filters */ }

  if (userFilters) {
    for (const f of userFilters) {
      whereParts.push(`${f.column} ${f.operator} ${typeof f.value === "string" ? `'${f.value}'` : f.value}`);
    }
  }

  // 4. Build GROUP BY: dimension expressions
  const groupByParts = dimensions.map(d => d.sql_expression);

  // Assemble
  let sql = `/* source: semantic_layer */ SELECT ${selectParts.join(", ")} FROM ${fromClause}`;
  if (whereParts.length > 0) {
    sql += ` WHERE ${whereParts.join(" AND ")}`;
  }
  if (groupByParts.length > 0) {
    sql += ` GROUP BY ${groupByParts.join(", ")}`;
  }

  return sql;
}