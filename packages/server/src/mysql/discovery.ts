import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "./pool.js";
import type { SchemaInfo, TableSchema, TableInfo, ColumnInfo, ForeignKeyInfo } from "../types.js";

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

export function formatSchemaForPrompt(
  schema: SchemaInfo,
  annotationMap: Map<string, string>
): string {
  const lines: string[] = [];

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

    lines.push("");
  }

  return lines.join("\n");
}
