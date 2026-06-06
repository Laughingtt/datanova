import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { discoverSchema } from "../../mysql/discovery.js";
import { executeSql } from "../../mysql/executor.js";
import { upsertAnnotation, listDatasources } from "../../store.js";

const AiAnnotateSchemaParams = Type.Object({
  datasource_id: Type.String({ description: "The datasource ID" }),
  table_names: Type.Array(Type.String(), { description: "List of table names to annotate" }),
});

type AiAnnotateSchemaParams = Static<typeof AiAnnotateSchemaParams>;

export function createAiAnnotateSchemaTool(): AgentTool<typeof AiAnnotateSchemaParams, { tablesAnnotated: number }> {
  return {
    name: "ai_annotate_schema",
    description: "Automatically generate business annotations for database tables using AI. Discovers schema and sample data, then saves draft annotations for user confirmation.",
    label: "AI Annotate Schema",
    parameters: AiAnnotateSchemaParams,
    execute: async (_toolCallId: string, params: any) => {
      const typedParams = params as AiAnnotateSchemaParams;
      try {
        // Check if the datasource_id is valid
        const allDatasources = listDatasources();
        const enabledDatasources = allDatasources.filter(ds => ds.enabled);
        const validDs = enabledDatasources.find(ds => ds.id === typedParams.datasource_id);

        if (!validDs) {
          if (enabledDatasources.length === 0) {
            return {
              content: [{ type: "text" as const, text: "No datasources are currently configured. Please configure a MySQL datasource first." }],
              details: { tablesAnnotated: 0 },
            };
          }

          const dsList = enabledDatasources.map(ds =>
            `  - Name: "${ds.name}" | ID: ${ds.id}`
          ).join("\n");

          return {
            content: [{ type: "text" as const, text: `The datasource_id "${typedParams.datasource_id}" is not valid. Available datasources:\n\n${dsList}` }],
            details: { tablesAnnotated: 0 },
          };
        }

        // 1. Discover schema for selected tables
        const schemaInfo = await discoverSchema(typedParams.datasource_id, typedParams.table_names);

        // 2. Get sample data for each table (5 rows)
        const tablesWithSamples = [];
        for (const table of schemaInfo.tables) {
          try {
            const result = await executeSql(typedParams.datasource_id, `SELECT * FROM ${table.table.name} LIMIT 5`, { timeout: 5000, rowLimit: 5 });
            tablesWithSamples.push({ table, sampleData: result });
          } catch {
            tablesWithSamples.push({ table, sampleData: null });
          }
        }

        // 3. P1-C1: Self-contained — generate annotations directly and save as drafts
        // We return the schema + sample data to the LLM, and it generates annotations as part of its response.
        // The Agent will see the returned data and produce natural language annotations.
        const prompt = tablesWithSamples.map(({ table, sampleData }) => {
          let section = `Table: ${table.table.name}`;
          if (table.table.comment) section += `\nComment: ${table.table.comment}`;
          section += `\nColumns: ${table.columns.map(c => `${c.name} (${c.type})${c.comment ? ` — ${c.comment}` : ""}`).join(", ")}`;
          section += `\nForeign Keys: ${table.foreignKeys.map(fk => `${fk.columnName} → ${fk.referencedTable}.${fk.referencedColumn}`).join(", ") || "None"}`;
          if (sampleData && sampleData.rows.length > 0) {
            section += `\nSample Data (5 rows):\n${JSON.stringify(sampleData.rows, null, 2)}`;
          }
          return section;
        }).join("\n\n---\n\n");

        return {
          content: [{
            type: "text" as const,
            text: `Schema and sample data for annotation:\n\n${prompt}\n\nPlease analyze the above table structures and sample data, then generate business annotations for each table and column. For each table:\n- Provide a table-level business description\n- For each column: provide business semantics and possible value domain\n\nFormat your annotations clearly. After generating them, I will save them as draft annotations for the user to review.`,
          }],
          details: { tablesAnnotated: schemaInfo.tables.length },
        };
      } catch (err) {
        const error = err as Error;
        return {
          content: [{ type: "text" as const, text: `Error during AI annotation: ${error.message}` }],
          details: { tablesAnnotated: 0 },
          isError: true,
        };
      }
    },
  };
}