import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { discoverSchema } from "../../mysql/discovery.js";
import { listDatasources } from "../../store.js";

const AiSuggestSemanticParams = Type.Object({
  datasource_id: Type.String({ description: "The datasource ID" }),
});

type AiSuggestSemanticParams = Static<typeof AiSuggestSemanticParams>;

export function createAiSuggestSemanticTool(): AgentTool<typeof AiSuggestSemanticParams, { tableCount: number }> {
  return {
    name: "ai_suggest_semantic_layer",
    description: "Analyze the database schema to recommend metric, dimension, and model definitions for the semantic layer. Returns the schema analysis for you to generate recommendations.",
    label: "AI Suggest Semantic Layer",
    parameters: AiSuggestSemanticParams,
    execute: async (_toolCallId: string, params: any) => {
      const typedParams = params as AiSuggestSemanticParams;
      try {
        const allDatasources = listDatasources();
        const enabledDatasources = allDatasources.filter(ds => ds.enabled);
        const validDs = enabledDatasources.find(ds => ds.id === typedParams.datasource_id);

        if (!validDs) {
          return {
            content: [{ type: "text" as const, text: "Invalid datasource_id." }],
            details: { tableCount: 0 },
          };
        }

        // P2-C2: Self-contained — return schema for LLM to analyze
        const schemaInfo = await discoverSchema(typedParams.datasource_id);

        const tablesSummary = schemaInfo.tables.map(t => ({
          name: t.table.name,
          comment: t.table.comment,
          columns: t.columns.map(c => `${c.name} (${c.type})${c.comment ? ` — ${c.comment}` : ""}`),
          foreignKeys: t.foreignKeys.map(fk => `${fk.columnName} → ${fk.referencedTable}.${fk.referencedColumn}`),
        }));

        const outputText = `Database schema for semantic layer recommendation:\n\n${JSON.stringify(tablesSummary, null, 2)}\n\nPlease analyze the above tables and recommend:\n1. Which are fact tables vs dimension tables\n2. Metrics to define (with name, display_name, sql_expression, filters, dimensions, unit, category, aliases)\n3. Dimensions to define (with name, display_name, sql_expression, data_type, hierarchy, values)\n4. A logical model connecting them (with name, base_table, joins, metrics, dimensions)\n\nAfter generating recommendations, save them using the createMetric, createDimension, and createModel API endpoints with status='draft'.`;

        return {
          content: [{ type: "text" as const, text: outputText }],
          details: { tableCount: schemaInfo.tables.length },
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error suggesting semantic layer: ${(err as Error).message}` }],
          details: { tableCount: 0 },
          isError: true,
        };
      }
    },
  };
}