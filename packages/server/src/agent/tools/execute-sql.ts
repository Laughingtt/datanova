import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { executeSql } from "../../mysql/executor.js";
import { listDatasources, createSqlQueryHistory } from "../../store.js";
import { validateSqlAgainstSchema, checkLargeTableWithoutWhere } from "../../mysql/validator.js";
import { normalizeSql } from "./sql-normalize.js";

const ExecuteSqlParams = Type.Object({
  datasource_id: Type.String({ description: "The ID of the datasource to execute the SQL query against. If you don't know the ID, use any string and the tool will return a list of available datasources." }),
  sql: Type.String({ description: "The SELECT SQL query to execute. Only SELECT, SHOW, DESCRIBE, and EXPLAIN statements are allowed." }),
  question: Type.Optional(Type.String({ description: "The user's original question that prompted this SQL query. Used for recording query history." })),
  skip_probe: Type.Optional(Type.Boolean({ description: "If true, skip probe execution. Set to true for semantic layer queries marked with /* source: semantic_layer */." })),
  conversation_id: Type.Optional(Type.String({ description: "The current conversation ID for linking query history to the conversation." })),
});

type ExecuteSqlParams = Static<typeof ExecuteSqlParams>;

export function createExecuteSqlTool(): AgentTool<typeof ExecuteSqlParams, { rowCount: number; executionTime: number; validationWarnings?: string[] }> {
  return {
    name: "execute_sql",
    description: "Execute a SELECT SQL query against a datasource. Use this to query data after discovering the schema. Only SELECT, SHOW, DESCRIBE, and EXPLAIN statements are permitted. If the datasource_id is unknown or invalid, the tool will return a list of all available datasources with their IDs.",
    label: "Execute SQL",
    parameters: ExecuteSqlParams,
    execute: async (_toolCallId: string, params: any) => {
      const typedParams = params as ExecuteSqlParams;
      // Normalize SQL — fix keyword粘连 (e.g. "revenueFROM" → "revenue FROM")
      const sql = normalizeSql(typedParams.sql);
      const allDatasources = listDatasources();
      const enabledDatasources = allDatasources.filter(ds => ds.enabled);
      try {
        // Check if the datasource_id is valid
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

        // P1-C7: Validate SQL against schema before execution
        const validation = validateSqlAgainstSchema(sql, typedParams.datasource_id);
        if (!validation.passed) {
          return {
            content: [{ type: "text" as const, text: `SQL validation failed:\n${validation.errors.join("\n")}\n\nPlease correct the SQL and try again.` }],
            details: { rowCount: 0, executionTime: 0, validationWarnings: validation.errors },
            isError: true,
          };
        }

        // P1-C6: Check for large table without WHERE (async warning)
        let largeTableWarning: string | null = null;
        if (!typedParams.skip_probe) {
          largeTableWarning = await checkLargeTableWithoutWhere(typedParams.datasource_id, sql);
        }

        const result = await executeSql(
          typedParams.datasource_id,
          sql
        );

        // Format results for the agent
        const columns = result.columns ?? [];
        const rows = result.rows ?? [];
        const maxRows = 20; // Limit rows shown to agent to avoid token overflow

        let output = `Query returned ${rows.length} rows in ${result.executionTime}ms\n\n`;

        if (largeTableWarning) {
          output += `⚠️ Warning: ${largeTableWarning}\n\n`;
        }

        // Include column validation warnings in output
        if (validation.warnings.length > 0) {
          output += `⚠️ Column Validation Warnings:\n${validation.warnings.map(w => `  - ${w}`).join("\n")}\n\nPlease verify the column names are correct.\n\n`;
        }

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

        // Check for 0-row result and add diagnostic hint
        if (rows.length === 0 && columns.length > 0) {
          output += `\n\n⚠️ 查询返回0行结果。可能原因：\n`;
          output += `1. WHERE条件过于严格，尝试放宽或移除部分条件\n`;
          output += `2. 日期范围可能不在数据范围内，尝试扩大时间范围\n`;
          output += `3. JOIN条件可能不匹配，检查关联字段\n`;
          output += `4. 表名或表的选择可能有误\n`;
          output += `请修正SQL后重新执行。`;
        }

        // Record successful query in history
        let sqlQueryHistoryId: string | null = null;
        try {
          const historyRecord = createSqlQueryHistory({
            datasource_id: typedParams.datasource_id,
            datasource_name: validDs.name,
            conversation_id: typedParams.conversation_id ?? null,
            question: typedParams.question ?? null,
            sql: sql,
            executed_at: new Date().toISOString(),
            execution_time_ms: result.executionTime,
            row_count: rows.length,
            status: "success",
            error_message: null,
            parent_query_id: null,
            correction_round: 0,
            intent_type: null,
          });
          sqlQueryHistoryId = historyRecord.id;
        } catch (_) { /* Don't fail if history recording fails */ }

        return {
          content: [{ type: "text" as const, text: output }],
          details: {
            rowCount: rows.length,
            executionTime: result.executionTime,
            validationWarnings: [...(largeTableWarning ? [largeTableWarning] : []), ...validation.warnings],
            columns: columns,
            rows: rows,
            sql: sql,
            sqlQueryHistoryId,
          },
        };
      } catch (err) {
        const error = err as Error;

        // Record failed query in history
        try {
          const ds = enabledDatasources.find(d => d.id === typedParams.datasource_id);
          createSqlQueryHistory({
            datasource_id: typedParams.datasource_id,
            datasource_name: ds?.name ?? typedParams.datasource_id,
            conversation_id: typedParams.conversation_id ?? null,
            question: typedParams.question ?? null,
            sql: sql,
            executed_at: new Date().toISOString(),
            execution_time_ms: 0,
            row_count: 0,
            status: "error",
            error_message: error.message,
            parent_query_id: null,
            correction_round: 0,
            intent_type: null,
          });
        } catch (_) { /* Don't fail if history recording fails */ }

        return {
          content: [{ type: "text" as const, text: `SQL执行错误: ${error.message}\n\n请分析错误原因并修正SQL：\n1. 如果是语法错误，检查SQL语法\n2. 如果是表/列不存在，先调用discover_schema确认schema\n3. 如果是函数不存在，检查函数名拼写\n4. 修正后重新调用execute_sql执行` }],
          details: { rowCount: 0, executionTime: 0 },
          isError: true,
        };
      }
    },
  };
}
