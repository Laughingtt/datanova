import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { getPool } from "./pool.js";
import type { QueryResult } from "../types.js";

const DEFAULT_TIMEOUT = 30000; // 30 seconds
const DEFAULT_ROW_LIMIT = 1000;

export async function executeSql(
  datasourceId: string,
  sql: string,
  options?: { timeout?: number; rowLimit?: number }
): Promise<QueryResult> {
  const pool = getPool(datasourceId);
  if (!pool) {
    throw new Error(`Datasource ${datasourceId} not found or pool unavailable`);
  }

  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
  const rowLimit = options?.rowLimit ?? DEFAULT_ROW_LIMIT;

  const startTime = Date.now();

  const conn = await pool.getConnection();

  try {
    // Set timeout
    await conn.query(`SET SESSION max_execution_time = ${timeout}`);

    // P1-C2: Smart LIMIT injection — strip trailing comments/semicolons first
    let cleanSql = sql.trim().replace(/;?\s*(--.*)?$/, '');
    if (!/\bLIMIT\s+\d+/i.test(cleanSql)) {
      cleanSql += ` LIMIT ${rowLimit}`;
    }

    const [rows] = await conn.query<RowDataPacket[] | ResultSetHeader>(cleanSql);

    const executionTime = Date.now() - startTime;

    // Handle SELECT queries
    if (Array.isArray(rows)) {
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

      return {
        columns,
        rows: rows as Record<string, unknown>[],
        rowCount: rows.length,
        executionTime,
      };
    }

    // Handle INSERT/UPDATE/DELETE
    const header = rows as ResultSetHeader;
    return {
      columns: ["affectedRows", "insertId"],
      rows: [
        {
          affectedRows: header.affectedRows,
          insertId: header.insertId,
        },
      ],
      rowCount: 1,
      executionTime,
    };
  } finally {
    conn.release();
  }
}

/**
 * Check if a SQL query is a SELECT query (safe to execute).
 * Returns true for SELECT, SHOW, DESCRIBE, EXPLAIN queries.
 */
export function isSelectQuery(sql: string): boolean {
  const normalized = sql.trim().toUpperCase();

  // Allow SELECT, SHOW, DESCRIBE, EXPLAIN
  const safePrefixes = ["SELECT", "SHOW", "DESCRIBE", "DESC", "EXPLAIN"];

  for (const prefix of safePrefixes) {
    if (normalized.startsWith(prefix)) {
      return true;
    }
  }

  return false;
}
