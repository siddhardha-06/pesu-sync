/**
 * Applies every SQL file in db/schema in file-name order (01_, 02_, ...).
 * Each file runs inside its own transaction, so a failing script leaves
 * the database exactly as it was before that file.
 *
 * Usage: npm run db:setup
 */
import './load-env';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { closePool, getPool } from '../src/lib/db';

async function main() {
  const dir = path.join(process.cwd(), 'db', 'schema');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const client = await getPool().connect();
  try {
    for (const file of files) {
      const sql = readFileSync(path.join(dir, file), 'utf8');
      process.stdout.write(`-> ${file} ... `);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('COMMIT');
        console.log('ok');
      } catch (error) {
        await client.query('ROLLBACK');
        console.log('FAILED');
        throw error;
      }
    }
    const { rows } = await client.query<{ table_name: string; table_type: string }>(
      `SELECT table_name, table_type
         FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_type, table_name`,
    );
    console.log(`\nSchema ready: ${rows.length} tables/views`);
    for (const r of rows) console.log(`   ${r.table_type.padEnd(10)} ${r.table_name}`);
  } finally {
    client.release();
    await closePool();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
