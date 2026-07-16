import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { listMetrics, listDimensions, listModels, listDatasources } from "../../store.js";
import { resolveSemanticSql } from "../semantic-sql-builder.js";
import { tokenize } from "./tokenizer.js";

const LookupSemanticLayerParams = Type.Object({
  datasource_id: Type.String({ description: "The datasource ID" }),
  query: Type.String({ description: "The search query (e.g. '销售额', 'GMV', '城市')" }),
});

type LookupSemanticLayerParams = Static<typeof LookupSemanticLayerParams>;

export function createLookupSemanticLayerTool(): AgentTool<typeof LookupSemanticLayerParams, { matched: boolean }> {
  return {
    name: "lookup_semantic_layer",
    description: `Search for pre-defined metrics and dimensions matching the user's question. Returns matching metrics with full SQL and metadata.

When a metric is found:
- atomic: simple aggregation, can modify WHERE/GROUP BY freely
- derived: contains arithmetic (ratios, differences), be careful to keep numerator/denominator in sync when modifying
- compound: contains window functions/CTE, be careful with PARTITION BY and ORDER BY clauses

If available dimensions have grain info, you can adjust time granularity (day/week/month/quarter/year).
Execute the returned SQL directly, or modify it based on the user's needs. Use skip_probe=true for semantic layer queries.
If no match, fall back to discover_schema + execute_sql.`,
    label: "Lookup Semantic Layer",
    parameters: LookupSemanticLayerParams,
    execute: async (_toolCallId: string, params: any) => {
      const typedParams = params as LookupSemanticLayerParams;
      try {
        const allDatasources = listDatasources();
        const enabledDatasources = allDatasources.filter(ds => ds.enabled);
        const validDs = enabledDatasources.find(ds => ds.id === typedParams.datasource_id);

        if (!validDs) {
          const dsList = enabledDatasources.map(ds =>
            `  - Name: "${ds.name}" | ID: ${ds.id}`
          ).join("\n");
          return {
            content: [{ type: "text" as const, text: `Invalid datasource_id. Available:\n\n${dsList}` }],
            details: { matched: false },
          };
        }

        const queryLower = typedParams.query.toLowerCase();
        const keywords = tokenize(typedParams.query);

        const metrics = listMetrics(typedParams.datasource_id).filter(m => m.status === "published");
        const dimensions = listDimensions(typedParams.datasource_id).filter(d => d.status === "published");
        const models = listModels(typedParams.datasource_id);

        // Search metrics
        const matchedMetrics = metrics.filter(m => {
          const nameMatch = m.name.toLowerCase().includes(queryLower) ||
            m.display_name.toLowerCase().includes(queryLower);
          const aliasMatch = (() => {
            try { return JSON.parse(m.aliases).some((a: string) => a.toLowerCase().includes(queryLower)); }
            catch { return false; }
          })();
          const keywordMatch = keywords.some(kw =>
            m.name.toLowerCase().includes(kw) ||
            m.display_name.toLowerCase().includes(kw) ||
            (() => { try { return JSON.parse(m.aliases).some((a: string) => a.toLowerCase().includes(kw)); } catch { return false; } })()
          );
          return nameMatch || aliasMatch || keywordMatch;
        });

        // Search dimensions
        const matchedDimensions = dimensions.filter(d => {
          const nameMatch = d.name.toLowerCase().includes(queryLower) ||
            d.display_name.toLowerCase().includes(queryLower);
          const valueMatch = (() => {
            try {
              if (!d.values) return false;
              const parsed = JSON.parse(d.values!);
              if (Array.isArray(parsed)) {
                if (parsed.length > 0 && typeof parsed[0] === "object" && parsed[0].key !== undefined) {
                  // Key-value format: [{key, value}]
                  return parsed.some((item: any) =>
                String(item.key).toLowerCase().includes(queryLower) ||
                String(item.value).toLowerCase().includes(queryLower)
              );
                }
                // Simple array format: ["north", "south"]
                return parsed.some((v: any) => String(v).toLowerCase().includes(queryLower));
              }
              return false;
            } catch { return false; }
          })();
          const keywordMatch = keywords.some(kw =>
            d.name.toLowerCase().includes(kw) ||
            d.display_name.toLowerCase().includes(kw)
          );
          return nameMatch || valueMatch || keywordMatch;
        });

        if (matchedMetrics.length === 0 && matchedDimensions.length === 0) {
          return {
            content: [{ type: "text" as const, text: "未找到匹配的语义层指标。请使用 discover_schema 工具发现数据库结构，然后用 execute_sql 执行查询。" }],
            details: { matched: false },
          };
        }

        // Build results using resolveSemanticSql
        const resultParts: string[] = [];

        for (const m of matchedMetrics) {
          const mDims = (() => { try { return JSON.parse(m.dimensions) as string[]; } catch { return []; } })();
          const relevantDims = matchedDimensions.filter(d => mDims.includes(d.name));

          const matchingModel = models.find(mod => {
            try { return JSON.parse(mod.metrics).includes(m.name); } catch { return false; }
          });

          const resolved = resolveSemanticSql({
            metric: {
              sql: m.sql,
              name: m.name,
              metric_type: m.metric_type,
              default_sort: m.default_sort,
              business_context: m.business_context,
              calculation_logic: m.calculation_logic,
              applicable_scenarios: m.applicable_scenarios,
              data_quality_notes: m.data_quality_notes,
            },
            dimensions: relevantDims.map(d => ({
              name: d.name,
              sql_expression: d.sql_expression,
              data_type: d.data_type,
              grain: d.grain,
              date_column: d.date_column,
              values: d.values,
            })),
            model: matchingModel ? { base_table: matchingModel.base_table, joins: matchingModel.joins } : null,
          });

          let metricText = `匹配到指标: ${m.display_name} (${m.name}, ${resolved.metric_type})\n`;
          metricText += `SQL: ${resolved.sql}\n`;
          if (m.business_context) metricText += `业务描述: ${m.business_context}\n`;
          if (m.calculation_logic) metricText += `计算逻辑: ${m.calculation_logic}\n`;
          if (m.applicable_scenarios) metricText += `适用场景: ${m.applicable_scenarios}\n`;
          if (m.data_quality_notes) metricText += `数据质量: ${m.data_quality_notes}\n`;
          if (resolved.available_dimensions.length > 0) {
            const dimStr = resolved.available_dimensions.map(d => {
              let s = d.grain ? `${d.name}(粒度:${d.grain})` : d.name;
              if (d.enum_values) s += `[枚举:${d.enum_values}]`;
              return s;
            }).join(', ');
            metricText += `可用维度: [${dimStr}]\n`;
          }
          metricText += `提示: ${resolved.notes}`;

          resultParts.push(metricText);
        }

        // Also list unmatched dimensions that were found
        for (const d of matchedDimensions) {
          let dimText = `匹配到维度: ${d.display_name} (${d.name}, ${d.data_type}${d.grain ? ', 粒度:' + d.grain : ''})`;
          // Include enum values for the Agent
          if (d.values) {
            try {
              const parsed = JSON.parse(d.values!);
              if (Array.isArray(parsed)) {
                if (parsed.length > 0 && typeof parsed[0] === "object" && parsed[0].key !== undefined) {
                  // Key-value format: 1=男, 0=女
                  const pairs = parsed.map((item: any) => `${item.key}=${item.value}`).join(', ');
                  dimText += `, 枚举值: ${pairs}`;
                } else {
                  // Simple array format: north, south
                  const vals = parsed.map((v: any) => String(v)).join(', ');
                  dimText += `, 可选值: ${vals}`;
                }
              }
            } catch { /* skip invalid JSON */ }
          }
          resultParts.push(dimText);
        }

        const outputText = resultParts.join('\n\n') +
          '\n\n请根据用户需求决定：直接执行该 SQL，或修改维度/时间/筛选后执行。使用 skip_probe=true 标记语义层查询。';

        return {
          content: [{ type: "text" as const, text: outputText }],
          details: { matched: true },
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error looking up semantic layer: ${(err as Error).message}` }],
          details: { matched: false },
          isError: true,
        };
      }
    },
  };
}
