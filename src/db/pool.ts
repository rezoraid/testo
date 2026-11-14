import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

export const dbEnabled = Boolean(config.databaseUrl);

export const pool = dbEnabled
  ? new Pool({
      connectionString: config.databaseUrl,
      ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
      max: 15,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    })
  : null;

pool?.on('error', (err: Error) => {
  console.error('[pg] unexpected error on idle client', err.message);
});

export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<pg.QueryResult<T>> {
  if (!pool) throw new Error('Database is not configured');
  return pool.query<T>(text, params);
}

export async function closePool(): Promise<void> {
  await pool?.end();
}
