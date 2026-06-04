import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { executeSql } from "../../mysql/executor.js";
import { listDatasources } from "../../store.js";

const ExecuteSqlParams = Type.Object({
  datasource_id: Type.String({ description: "The ID of the datasource to execute the SQL query against. If you don't know the ID, use any string and the tool will return a list of available datasources." }),
  sql: Type.String({ description: "The SELECT SQL query to execute. Only SELECT, SHOW, DESCRIBE, and EXPLAIN statements are allowed." }),
});

type ExecuteSqlParams = Static<typeof ExecuteSqlParams>;

export function createExecuteSqlTool(): AgentTool<typeof ExecuteSqlParams, { rowCount: number; executionTime: number }> {
  return {
    name: "execute_sql",
    description: "Execute a SELECT SQL query against a datasource. Use this to query data after discovering the schema. Only SELECT, SHOW, DESCRIBE, and EXPLAIN statements are permitted. If the datasource_id is unknown or invalid, the tool will return a list of all available datasources with their IDs.",
    label: "Execute SQL",
    parameters: ExecuteSqlParams,
    execute: async (_toolCallId: string, params: any) => {
      const typedParams = params as ExecuteSqlParams;
      try {
        // Check if the datasource_id is valid
        const allDatasources = listDatasources();
        const enabledDatasources = allDatasources.filter(ds => ds.enabled);
        const validDs = enabledDatasources.find(ds => ds.id === typedParams.datasource_id);

        if (!validDs) {
          if (enabledDatasources.length === 0) {
            return {
              content: [{ type: "text" as const, text: "No datasources are currently configured. Please configure a MySQL datasource first in the Datasources page, then try again." }],
              details: { rowCount: 0, executionTime: 0 },
            };
          }

          const dsList = enabledDatasources.map(ds =>
            `  - Name: "${ds.name}" | ID: ${ds.id} | Host: ${ds.host}:${ds.port}/${ds.database}`
          ).join("\n");

          return {
            content: [{ type: "text" as const, text: `The datasource_id "${typedParams.datasource_id}" is not valid. Please use one of the following available datasources:\n\n${dsList}\n\nCall execute_sql again with a valid datasource_id from the list above.` }],
            details: { rowCount: 0, executionTime: 0 },
          };
        }

        const result = await executeSql(
          typedParams.datasource_id,
          typedParams.sql
        );

        // Format results for the agent
        const columns = result.columns ?? [];
        const rows = result.rows ?? [];
        const maxRows = 20; // Limit rows shown to agent to avoid token overflow

        let output = `Query returned ${rows.length} rows in ${result.executionTime}ms\n\n`;

        if (columns.length > 0 && rows.length > 0) {
          // Table format
          const colWidths = columns.map((col: string) => {
            const maxDataLen = rows.slice(0, maxRows).reduce((max: number, row: Record<string, unknown>) => {
              const val = String(row[col] ?? "NULL");
              return Math.max(max, val.length);
            }, col.length);
            return Math.min(maxDataLen, 50);
          });

          // Header
          output += "| " + columns.map((col: string, i: number) => col.padEnd(colWidths[i])).join(" | ") + " |\n";
          output += "| " + colWidths.map((w: number) => "-".repeat(w)).join(" | ") + " |\n";

          // Rows
          for (const row of rows.slice(0, maxRows)) {
            output += "| " + columns.map((col: string, i: number) => {
              const val = row[col] === null ? "NULL" : String(row[col]);
              return val.slice(0, 50).padEnd(colWidths[i]);
            }).join(" | ") + " |\n";
          }

          if (rows.length > maxRows) {
            output += `\n... and ${rows.length - maxRows} more rows`;
          }
        }

        return {
          content: [{ type: "text" as const, text: output }],
          details: {
            rowCount: rows.length,
            executionTime: result.executionTime,
          },
        };
      } catch (err) {
        const error = err as Error;
        return {
          content: [{ type: "text" as const, text: `Error executing SQL: ${error.message}` }],
          details: { rowCount: 0, executionTime: 0 },
          isError: true,
        };
      }
    },
  };
}