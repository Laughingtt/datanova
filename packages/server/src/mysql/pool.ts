import * as mysql from "mysql2/promise";
import { getDatasource } from "../store.js";
import { decrypt } from "../crypto.js";
import type { DatasourceConnection } from "../types.js";

const pools = new Map<string, mysql.Pool>();

export function getDatasourceConnection(id: string): DatasourceConnection | null {
  const ds = getDatasource(id);
  if (!ds) return null;

  return {
    id: ds.id,
    host: ds.host,
    port: ds.port,
    database: ds.database,
    user: ds.user,
    password: decrypt(ds.password),
  };
}

export function getPool(datasourceId: string): mysql.Pool | null {
  const conn = getDatasourceConnection(datasourceId);
  if (!conn) return null;

  if (pools.has(datasourceId)) {
    return pools.get(datasourceId)!;
  }

  const pool = mysql.createPool({
    host: conn.host,
    port: conn.port,
    database: conn.database,
    user: conn.user,
    password: conn.password,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  pools.set(datasourceId, pool);
  return pool;
}

export async function testConnection(datasourceId: string): Promise<{ success: boolean; error?: string }> {
  const pool = getPool(datasourceId);
  if (!pool) {
    return { success: false, error: "Datasource not found" };
  }

  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    return { success: true };
  } catch (err) {
    const error = err as Error;
    return { success: false, error: error.message };
  }
}

export async function testRawConnection(
  input: Omit<DatasourceConnection, "id">
): Promise<{ success: boolean; error?: string }> {
  let conn: mysql.Connection | null = null;
  try {
    conn = await mysql.createConnection({
      host: input.host,
      port: input.port,
      database: input.database,
      user: input.user,
      password: input.password,
    });
    await conn.ping();
    await conn.end();
    return { success: true };
  } catch (err) {
    if (conn) {
      try {
        await conn.end();
      } catch {
        // Ignore close errors
      }
    }
    const error = err as Error;
    return { success: false, error: error.message };
  }
}

export async function closePool(datasourceId: string): Promise<void> {
  const pool = pools.get(datasourceId);
  if (pool) {
    await pool.end();
    pools.delete(datasourceId);
  }
}

export async function closeAllPools(): Promise<void> {
  for (const [id, pool] of pools) {
    await pool.end();
    pools.delete(id);
  }
}
