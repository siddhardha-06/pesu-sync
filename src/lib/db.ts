import { Pool, type PoolClient, type QueryResultRow } from 'pg';

// One pool per server process (survives Next.js hot reloads in dev).
declare global {
  // eslint-disable-next-line no-var
  var __pesuPgPool: Pool | undefined;
}

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing environment variable ${name} (see .env.example)`);
  return value;
}

export function getPool(): Pool {
  if (!globalThis.__pesuPgPool) {
    globalThis.__pesuPgPool = new Pool({
      host: env('POSTGRES_HOST', 'localhost'),
      port: Number(env('POSTGRES_PORT', '5432')),
      database: env('POSTGRES_DB'),
      user: env('POSTGRES_USER'),
      password: env('POSTGRES_PASSWORD'),
      max: 10,
    });
  }
  return globalThis.__pesuPgPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

type Isolation = 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';

/**
 * Runs `fn` inside BEGIN ... COMMIT on a single connection and rolls back on any error.
 * `actorId` is exposed to triggers through the transaction-local setting `app.user_id`
 * so the audit trail records who made each change.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
  options: { actorId?: number; isolation?: Isolation } = {},
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query(options.isolation ? `BEGIN ISOLATION LEVEL ${options.isolation}` : 'BEGIN');
    if (options.actorId) {
      await client.query(`SELECT set_config('app.user_id', $1, true)`, [String(options.actorId)]);
    }
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (globalThis.__pesuPgPool) {
    await globalThis.__pesuPgPool.end();
    globalThis.__pesuPgPool = undefined;
  }
}
