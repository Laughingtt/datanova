import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { executeSql, isSelectQuery } from "../../mysql/executor.js";

const ExecuteSqlParams = Type.Object({
  datasource_id: Type.String({ description: "The ID of the datasource to execute the query against" }),
  sql: Type.String({ description: "The SQL query to execute. Only SELECT queries are allowed." }),
});

type ExecuteSqlParams = Static<typeof ExecuteSqlParams>;

export function createExecuteSqlTool(): AgentTool<typeof ExecuteSqlParams, { rowCount: number; executionTime: number }> {
  return {
    name: "execute_sql",
    description: "Execute a SELECT SQL query against a datasource. Only read-only queries (SELECT, SHOW, DESCRIBE, EXPLAIN) are permitted. Results are limited to 1000 rows with a 30-second timeout.",
    label: "Execute SQL",
    parameters: ExecuteSqlParams,
    execute: async (_toolCallId: string, params: any) => {
      const typedParams = params as ExecuteSqlParams;
      try {
        // Guard: only allow SELECT queries
        if (!isSelectQuery(typedParams.sql)) {
          return {
            content: [{
              type: "text" as const,
              text: "Error: Only SELECT queries are allowed. INSERT, UPDATE, DELETE, and DDL statements are not permitted.",
            }],
            details: { rowCount: 0, executionTime: 0 },
            isError: true,
          };
        }

        const result = await executeSql(typedParams.datasource_id, typedParams.sql);

        // Format result as text
        let text = `Query executed in ${result.executionTime}ms. ${result.rowCount} rows returned.\n\n`;

        if (result.columns.length > 0 && result.rows.length > 0) {
          // Format as a simple table
          const colWidths = result.columns.map((col) => {
            const maxDataWidth = Math.max(
              ...result.rows.slice(0, 10).map((row) =>
                String(row[col] ?? "NULL").length
              )
            );
            return Math.max(col.length, maxDataWidth, 4);
          });

          // Header
          const header = result.columns
            .map((col, i) => col.padEnd(colWidths[i]))
            .join(" | ");
          const separator = colWidths.map((w) => "-".repeat(w)).join("-+-");

          text += header + "\n";
          text += separator + "\n";

          // Rows (show up to 20 in text)
          const displayRows = result.rows.slice(0, 20);
          for (const row of displayRows) {
            const line = result.columns
              .map((col, i) => String(row[col] ?? "NULL").padEnd(colWidths[i]))
              .join(" | ");
            text += line + "\n";
          }

          if (result.rows.length > 20) {
            text += `... and ${result.rows.length - 20} more rows\n`;
          }
        }

        return {
          content: [{ type: "text" as const, text }],
          details: {
            rowCount: result.rowCount,
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
