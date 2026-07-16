interface ResolveOptions {
  metric: {
    sql: string;
    name: string;
    metric_type: string;
    default_sort: string | null;
    business_context: string;
    calculation_logic: string;
    applicable_scenarios: string;
    data_quality_notes: string;
  };
  dimensions: Array<{
    name: string;
    sql_expression: string;
    data_type: string;
    grain: string | null;
    date_column: string | null;
    values?: string | null;
  }>;
  model: {
    base_table: string;
    joins: string;
  } | null;
}

interface ResolveResult {
  sql: string;
  metric_type: string;
  available_dimensions: Array<{
    name: string;
    grain: string | null;
    enum_values?: string | null;
  }>;
  notes: string;
}

function getMetricTypeNotes(metricType: string): string {
  switch (metricType) {
    case 'atomic':
      return '基础聚合指标，可直接修改 WHERE 条件和 GROUP BY 维度';
    case 'derived':
      return '衍生指标，含比率/差值计算，修改时注意分子分母的同步';
    case 'compound':
      return '复合指标，含窗口函数/CTE，修改时注意 PARTITION BY 和 ORDER BY 子句';
    default:
      return '基础聚合指标，可直接修改 WHERE 条件和 GROUP BY 维度';
  }
}

export function resolveSemanticSql(options: ResolveOptions): ResolveResult {
  const { metric, dimensions } = options;

  const notesParts: string[] = [getMetricTypeNotes(metric.metric_type)];

  // Collect available dimensions with grain info and enum values
  const availableDimensions = dimensions.map(d => {
    let enumStr: string | null = null;
    if (d.values) {
      try {
        const parsed = JSON.parse(d.values);
        if (Array.isArray(parsed)) {
          if (parsed.length > 0 && typeof parsed[0] === "object" && parsed[0].key !== undefined) {
            enumStr = parsed.map((item: any) => `${item.key}=${item.value}`).join(', ');
          } else {
            enumStr = parsed.map((v: any) => String(v)).join(', ');
          }
        }
      } catch { /* skip */ }
    }
    return { name: d.name, grain: d.grain, enum_values: enumStr };
  });

  // Check if any dimension has grain info
  const timeDimensions = dimensions.filter(d => d.grain);
  if (timeDimensions.length > 0) {
    const grainOptions = ['day', 'week', 'month', 'quarter', 'year'];
    notesParts.push(`可调整时间粒度: ${grainOptions.join('/')}`);
  }

  return {
    sql: metric.sql,
    metric_type: metric.metric_type,
    available_dimensions: availableDimensions,
    notes: notesParts.join('。'),
  };
}
