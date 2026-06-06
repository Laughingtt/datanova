import { getPool } from "./pool.js";
import type { RowDataPacket } from "mysql2/promise";

export interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

export interface SchemaCache {
  tables: Set<string>;
  columns: Map<string, Set<string>>; // tableName -> Set<columnName>
}

// Map of datasource_id -> SchemaCache (populated by discover_schema tool)
const schemaCaches = new Map<string, SchemaCache>();

export function setSchemaCache(datasourceId: string, tables: string[], columnsByTable: Map<string, string[]>): void {
  const cache: SchemaCache = {
    tables: new Set(tables),
    columns: new Map(),
  };
  for (const [table, cols] of columnsByTable) {
    cache.columns.set(table, new Set(cols));
  }
  schemaCaches.set(datasourceId, cache);
}

export function getSchemaCache(datasourceId: string): SchemaCache | undefined {
  return schemaCaches.get(datasourceId);
}

/**
 * Validate that a SQL query is safe to execute (read-only).
 */
export function isSelectQuery(sql: string): boolean {
  const normalized = sql.trim().toUpperCase();
  const safePrefixes = ["SELECT", "SHOW", "DESCRIBE", "DESC", "EXPLAIN"];
  for (const prefix of safePrefixes) {
    if (normalized.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Levenshtein distance for typo suggestions.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

/**
 * Extract table names from a SQL query (simple regex-based).
 */
function extractTableNames(sql: string): string[] {
  const tables: string[] = [];
  const fromRegex = /(?:FROM|JOIN)\s+`?(\w+)`?/gi;
  let match;
  while ((match = fromRegex.exec(sql)) !== null) {
    tables.push(match[1]);
  }
  return [...new Set(tables)];
}

/**
 * Validate SQL against schema cache.
 */
export function validateSqlAgainstSchema(
  sql: string,
  datasourceId: string
): ValidationResult {
  const result: ValidationResult = { passed: true, errors: [], warnings: [] };

  // 1. Read-only check
  if (!isSelectQuery(sql)) {
    result.passed = false;
    result.errors.push(`Only SELECT, SHOW, DESCRIBE, EXPLAIN queries are allowed.`);
    return result;
  }

  const cache = getSchemaCache(datasourceId);
  if (!cache) {
    // No schema cached yet — skip validation
    return result;
  }

  // 2. Table name validation
  const tablesInSql = extractTableNames(sql);
  for (const table of tablesInSql) {
    if (!cache.tables.has(table)) {
      // Find closest match
      let suggestion = "";
      let minDist = Infinity;
      for (const t of cache.tables) {
        const d = levenshtein(table.toLowerCase(), t.toLowerCase());
        if (d < minDist && d <= 2) {
          minDist = d;
          suggestion = t;
        }
      }
      const msg = suggestion
        ? `Table '${table}' does not exist. Did you mean '${suggestion}'?`
        : `Table '${table}' does not exist in the schema.`;
      result.passed = false;
      result.errors.push(msg);
    }
  }

  return result;
}

/**
 * Check if a table is large (>100K rows) and the SQL lacks a WHERE clause.
 */
export async function checkLargeTableWithoutWhere(
  datasourceId: string,
  sql: string
): Promise<string | null> {
  const tablesInSql = extractTableNames(sql);
  const hasWhere = /\bWHERE\b/i.test(sql);
  if (hasWhere || tablesInSql.length === 0) return null;

  const pool = getPool(datasourceId);
  if (!pool) return null;

  const conn = await pool.getConnection();
  try {
    for (const table of tablesInSql) {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT TABLE_ROWS as row_count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = ? AND TABLE_SCHEMA = DATABASE()`,
        [table]
      );
      const rowCount = rows[0]?.row_count ?? 0;
      if (rowCount > 100000) {
        return `Table '${table}' has ~${rowCount.toLocaleString()} rows. Query without WHERE clause may be slow. Consider adding filtering conditions.`;
      }
    }
  } finally {
    conn.release();
  }
  return null;
}