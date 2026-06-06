import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "./pool.js";
import type { SchemaInfo, TableSchema, TableInfo, ColumnInfo, ForeignKeyInfo, SchemaAnnotation, TableQueryExample } from "../types.js";

interface TableRow extends RowDataPacket {
  TABLE_NAME: string;
  TABLE_COMMENT: string | null;
}

interface ColumnRow extends RowDataPacket {
  COLUMN_NAME: string;
  COLUMN_TYPE: string;
  IS_NULLABLE: "YES" | "NO";
  COLUMN_DEFAULT: string | null;
  COLUMN_COMMENT: string | null;
  COLUMN_KEY: string;
}

interface ForeignKeyRow extends RowDataPacket {
  CONSTRAINT_NAME: string;
  COLUMN_NAME: string;
  REFERENCED_TABLE_NAME: string;
  REFERENCED_COLUMN_NAME: string;
}

export async function discoverSchema(
  datasourceId: string,
  tableNames?: string[]
): Promise<SchemaInfo> {
  const pool = getPool(datasourceId);
  if (!pool) {
    throw new Error(`Datasource ${datasourceId} not found or pool unavailable`);
  }

  const conn = await pool.getConnection();

  try {
    // Get database name
    const [dbRows] = await conn.query<RowDataPacket[]>("SELECT DATABASE() as db");
    const database = dbRows[0]?.db;

    if (!database) {
      throw new Error("Could not determine database name");
    }

    // Query tables
    let tableQuery = `
      SELECT TABLE_NAME, TABLE_COMMENT
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = ?
    `;
    const tableParams: (string | string[])[] = [database];

    if (tableNames && tableNames.length > 0) {
      tableQuery += ` AND TABLE_NAME IN (?)`;
      tableParams.push(tableNames);
    }

    tableQuery += " ORDER BY TABLE_NAME";

    const [tables] = await conn.query<TableRow[]>(tableQuery, tableParams);

    const result: SchemaInfo = {
      tables: [],
    };

    for (const table of tables) {
      // Query columns for this table
      const [columns] = await conn.query<ColumnRow[]>(
        `
        SELECT
          COLUMN_NAME,
          COLUMN_TYPE,
          IS_NULLABLE,
          COLUMN_DEFAULT,
          COLUMN_COMMENT,
          COLUMN_KEY
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
        `,
        [database, table.TABLE_NAME]
      );

      // Query foreign keys
      const [foreignKeys] = await conn.query<ForeignKeyRow[]>(
        `
        SELECT
          CONSTRAINT_NAME,
          COLUMN_NAME,
          REFERENCED_TABLE_NAME,
          REFERENCED_COLUMN_NAME
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME = ?
          AND REFERENCED_TABLE_NAME IS NOT NULL
        `,
        [database, table.TABLE_NAME]
      );

      const tableSchema: TableSchema = {
        table: {
          name: table.TABLE_NAME,
          comment: table.TABLE_COMMENT || undefined,
        },
        columns: columns.map((col): ColumnInfo => ({
          name: col.COLUMN_NAME,
          type: col.COLUMN_TYPE,
          nullable: col.IS_NULLABLE === "YES",
          defaultValue: col.COLUMN_DEFAULT ?? undefined,
          comment: col.COLUMN_COMMENT || undefined,
          isPrimaryKey: col.COLUMN_KEY === "PRI",
        })),
        foreignKeys: foreignKeys.map((fk): ForeignKeyInfo => ({
          name: fk.CONSTRAINT_NAME,
          columnName: fk.COLUMN_NAME,
          referencedTable: fk.REFERENCED_TABLE_NAME,
          referencedColumn: fk.REFERENCED_COLUMN_NAME,
        })),
      };

      result.tables.push(tableSchema);
    }

    return result;
  } finally {
    conn.release();
  }
}

export interface ValueDomain {
  columnName: string;
  tableName: string;
  domainType: "enum" | "range";
  domainValues: string; // JSON string
  annotation: string; // human-readable description for annotation field
}

export async function discoverValueDomains(
  datasourceId: string,
  tableSchema: TableSchema
): Promise<ValueDomain[]> {
  const pool = getPool(datasourceId);
  if (!pool) return [];

  const conn = await pool.getConnection();
  const domains: ValueDomain[] = [];

  try {
    for (const col of tableSchema.columns) {
      const typeUpper = col.type.toUpperCase();

      // Enum domain: VARCHAR/CHAR/ENUM/TEXT columns
      if (typeUpper.startsWith("VARCHAR") || typeUpper.startsWith("CHAR") || typeUpper.startsWith("ENUM") || typeUpper.startsWith("TEXT")) {
        try {
          await conn.query(`SET SESSION max_execution_time = 5000`);
          const [rows] = await conn.query<RowDataPacket[]>(
            `SELECT COUNT(DISTINCT ${conn.escapeId(col.name)}) as cnt FROM ${conn.escapeId(tableSchema.table.name)}`
          );
          const distinctCount = rows[0]?.cnt ?? 0;

          if (distinctCount <= 50) {
            const [valRows] = await conn.query<RowDataPacket[]>(
              `SELECT DISTINCT ${conn.escapeId(col.name)} as val FROM ${conn.escapeId(tableSchema.table.name)} ORDER BY val LIMIT 20`
            );
            const values = valRows.map(r => String(r.val)).filter(v => v !== "null" && v !== "");
            if (values.length > 0) {
              domains.push({
                columnName: col.name,
                tableName: tableSchema.table.name,
                domainType: "enum",
                domainValues: JSON.stringify(values),
                annotation: `可选值: ${values.join(", ")}`,
              });
            }
          }
        } catch {
          // Timeout or error — skip this column
        }
      }

      // Range domain: numeric columns
      if (typeUpper.startsWith("INT") || typeUpper.startsWith("DECIMAL") || typeUpper.startsWith("FLOAT") || typeUpper.startsWith("DOUBLE") || typeUpper.startsWith("BIGINT") || typeUpper.startsWith("TINYINT") || typeUpper.startsWith("SMALLINT") || typeUpper.startsWith("MEDIUMINT")) {
        try {
          const [rows] = await conn.query<RowDataPacket[]>(
            `SELECT MIN(${conn.escapeId(col.name)}) as min_val, MAX(${conn.escapeId(col.name)}) as max_val, AVG(${conn.escapeId(col.name)}) as avg_val FROM ${conn.escapeId(tableSchema.table.name)}`
          );
          const minVal = rows[0]?.min_val;
          const maxVal = rows[0]?.max_val;
          const avgVal = rows[0]?.avg_val;
          if (minVal !== null && maxVal !== null) {
            domains.push({
              columnName: col.name,
              tableName: tableSchema.table.name,
              domainType: "range",
              domainValues: JSON.stringify({ min: Number(minVal), max: Number(maxVal), avg: Math.round(Number(avgVal) * 100) / 100 }),
              annotation: `范围: ${minVal}~${maxVal} (均值: ${Math.round(Number(avgVal) * 100) / 100})`,
            });
          }
        } catch {
          // Skip on error
        }
      }
    }
  } finally {
    conn.release();
  }

  return domains;
}

export function formatSchemaForPrompt(
  schema: SchemaInfo,
  annotations: SchemaAnnotation[],
  queryExamples?: TableQueryExample[]
): string {
  const lines: string[] = [];

  // Build annotation map from typed annotations (P1-C4: build internally)
  const annotationMap = new Map<string, string>();
  const domainMap = new Map<string, { domainType: string; domainValues: string }>();

  for (const a of annotations) {
    if (a.status !== "confirmed") continue; // Only include confirmed annotations
    const key = a.field_name ? `${a.table_name}.${a.field_name}` : a.table_name;
    annotationMap.set(key, a.annotation);
    if (a.domain_type && a.domain_values) {
      domainMap.set(key, { domainType: a.domain_type, domainValues: a.domain_values });
    }
  }

  // Build query examples map
  const queryExamplesMap = new Map<string, Array<{ question: string; sql: string }>>();
  if (queryExamples) {
    for (const ex of queryExamples) {
      if (!queryExamplesMap.has(ex.table_name)) {
        queryExamplesMap.set(ex.table_name, []);
      }
      queryExamplesMap.get(ex.table_name)!.push({ question: ex.question, sql: ex.sql });
    }
  }

  lines.push("# Database Schema\n");

  for (const tableSchema of schema.tables) {
    const { table, columns, foreignKeys } = tableSchema;

    const tableKey = table.name;
    const tableAnnotation = annotationMap.get(tableKey);

    lines.push(`## Table: ${table.name}`);
    if (table.comment) {
      lines.push(`Comment: ${table.comment}`);
    }
    if (tableAnnotation) {
      lines.push(`Business Description: ${tableAnnotation}`);
    }
    lines.push("");

    lines.push("### Columns:");
    for (const col of columns) {
      const colKey = `${table.name}.${col.name}`;
      const colAnnotation = annotationMap.get(colKey);
      const colDomain = domainMap.get(colKey);

      const parts = [
        `  - ${col.name}`,
        `(${col.type})`,
        col.nullable ? "NULL" : "NOT NULL",
      ];

      if (col.isPrimaryKey) {
        parts.push("PRIMARY KEY");
      }

      if (col.defaultValue !== undefined) {
        parts.push(`DEFAULT ${col.defaultValue}`);
      }

      lines.push(parts.join(" "));

      if (col.comment) {
        lines.push(`    Comment: ${col.comment}`);
      }
      if (colAnnotation) {
        lines.push(`    Business Description: ${colAnnotation}`);
      }
      // Domain info
      if (colDomain?.domainType === "enum" && colDomain.domainValues) {
        try {
          const values = JSON.parse(colDomain.domainValues);
          lines.push(`    Values: [${values.join(", ")}]`);
        } catch { /* skip invalid JSON */ }
      } else if (colDomain?.domainType === "range" && colDomain.domainValues) {
        try {
          const { min, max, avg } = JSON.parse(colDomain.domainValues);
          lines.push(`    Range: ${min}~${max} (avg: ${avg})`);
        } catch { /* skip invalid JSON */ }
      }
    }

    if (foreignKeys.length > 0) {
      lines.push("");
      lines.push("### Foreign Keys:");
      for (const fk of foreignKeys) {
        lines.push(
          `  - ${fk.columnName} -> ${fk.referencedTable}.${fk.referencedColumn}`
        );
      }
    }

    // Query examples
    const examples = queryExamplesMap.get(table.name);
    if (examples && examples.length > 0) {
      lines.push("");
      lines.push("### Common Queries:");
      for (const ex of examples) {
        lines.push(`  - "${ex.question}" → ${ex.sql}`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}
