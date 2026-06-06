import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { listMetrics, listDimensions, listModels, listDatasources } from "../../store.js";
import { buildSemanticSql } from "../semantic-sql-builder.js";

const LookupSemanticLayerParams = Type.Object({
  datasource_id: Type.String({ description: "The datasource ID" }),
  query: Type.String({ description: "The search query (e.g. '销售额', 'GMV', '城市')" }),
});

type LookupSemanticLayerParams = Static<typeof LookupSemanticLayerParams>;

export function createLookupSemanticLayerTool(): AgentTool<typeof LookupSemanticLayerParams, { matched: boolean }> {
  return {
    name: "lookup_semantic_layer",
    description: "Search for pre-defined metrics and dimensions matching the user's question. Returns matching metrics with SQL expressions, filters, and available dimensions. If a metric is found, use the generated_sql to execute directly for deterministic accuracy.",
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
        // P2-C3: Split by whitespace AND Chinese characters for better matching
        const keywords = queryLower.split(/\s+|(?=[一-鿿])/).filter(w => w.length > 1);

        const metrics = listMetrics(typedParams.datasource_id).filter(m => m.status === "published");
        const dimensions = listDimensions(typedParams.datasource_id);
        const models = listModels(typedParams.datasource_id);

        // Search metrics: name, display_name, aliases with scoring
        const matchedMetrics = metrics.filter(m => {
          const nameMatch = m.name.toLowerCase().includes(queryLower) ||
            m.display_name.toLowerCase().includes(queryLower);
          const aliasMatch = (() => {
            try {
              return JSON.parse(m.aliases).some((a: string) => a.toLowerCase().includes(queryLower));
            } catch { return false; }
          })();
          const keywordMatch = keywords.some(kw =>
            m.name.toLowerCase().includes(kw) ||
            m.display_name.toLowerCase().includes(kw) ||
            (() => { try { return JSON.parse(m.aliases).some((a: string) => a.toLowerCase().includes(kw)); } catch { return false; } })()
          );
          return nameMatch || aliasMatch || keywordMatch;
        });

        // Search dimensions: name, display_name, values
        const matchedDimensions = dimensions.filter(d => {
          const nameMatch = d.name.toLowerCase().includes(queryLower) ||
            d.display_name.toLowerCase().includes(queryLower);
          const valueMatch = (() => {
            try { return d.values ? JSON.parse(d.values!).some((v: string) => v.toLowerCase().includes(queryLower)) : false; }
            catch { return false; }
          })();
          const keywordMatch = keywords.some(kw =>
            d.name.toLowerCase().includes(kw) ||
            d.display_name.toLowerCase().includes(kw)
          );
          return nameMatch || valueMatch || keywordMatch;
        });

        if (matchedMetrics.length === 0 && matchedDimensions.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No matching metrics or dimensions found in the semantic layer. Fall back to discover_schema and generate SQL from scratch." }],
            details: { matched: false },
          };
        }

        // Find relevant models and build deterministic SQL
        const resultMetrics = matchedMetrics.map(m => {
          const mDims = JSON.parse(m.dimensions) as string[];
          const relevantDims = matchedDimensions.filter(d => mDims.includes(d.name));

          // P2-C0: Build deterministic SQL using buildSemanticSql
          let generatedSql: string | null = null;
          const matchingModel = models.find(mod => {
            try { return JSON.parse(mod.metrics).includes(m.name); } catch { return false; }
          });

          if (matchingModel) {
            generatedSql = buildSemanticSql({
              metric: { sql_expression: m.sql_expression, name: m.name, filters: m.filters },
              dimensions: relevantDims.map(d => ({ sql_expression: d.sql_expression, name: d.name })),
              model: { base_table: matchingModel.base_table, joins: matchingModel.joins },
            });
          }

          return {
            name: m.name,
            display_name: m.display_name,
            description: m.description,
            sql_expression: m.sql_expression,
            filters: JSON.parse(m.filters),
            dimensions: mDims,
            unit: m.unit,
            aliases: JSON.parse(m.aliases),
            generated_sql: generatedSql,
          };
        });

        const resultDimensions = matchedDimensions.map(d => ({
          name: d.name,
          display_name: d.display_name,
          sql_expression: d.sql_expression,
          data_type: d.data_type,
          hierarchy: d.hierarchy ? JSON.parse(d.hierarchy!) : null,
          values: d.values ? JSON.parse(d.values!) : null,
        }));

        const matchedModels = models.filter(mod => {
          try { return JSON.parse(mod.metrics).some((mn: string) => matchedMetrics.some(m => m.name === mn)); }
          catch { return false; }
        }).map(mod => ({
          name: mod.name,
          description: mod.description,
          base_table: mod.base_table,
          joins: JSON.parse(mod.joins),
        }));

        const outputText = `Semantic layer matches found!\n\nMetrics: ${JSON.stringify(resultMetrics, null, 2)}\n\nDimensions: ${JSON.stringify(resultDimensions, null, 2)}\n\nModels: ${JSON.stringify(matchedModels, null, 2)}\n\n${resultMetrics.some(m => m.generated_sql) ? "IMPORTANT: If a metric has generated_sql, execute it directly — it's deterministically built from the semantic layer and guaranteed to be correct. Use skip_probe=true for semantic layer queries." : ""}`;

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