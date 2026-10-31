/**
 * Re-indexes PostgreSQL rows into Qdrant (idempotent: points are upserted by SQL id).
 *
 *   npm run vector:sync            # upsert everything
 *   npm run vector:sync -- --reset # drop + recreate the collections first
 */
import './load-env';
import { closePool, query } from '../src/lib/db';
import { EMBEDDING_MODEL, cosine, embeddingProvider } from '../src/lib/embeddings';
import {
  COLLECTIONS,
  collectionStats,
  dropCollections,
  ensureCollections,
  getVector,
  syncVectors,
  type CollectionKey,
} from '../src/lib/vector';

async function main() {
  console.log(`Embedding provider: ${embeddingProvider()} (${embeddingProvider() === 'local' ? EMBEDDING_MODEL : 'feature hashing'})`);
  if (process.argv.includes('--reset')) {
    console.log('Dropping collections ...');
    await dropCollections();
  }
  await ensureCollections();

  for (const key of Object.keys(COLLECTIONS) as CollectionKey[]) {
    const started = Date.now();
    const count = await syncVectors(key);
    console.log(`  ${COLLECTIONS[key].padEnd(18)} ${String(count).padStart(4)} points  (${Date.now() - started} ms)`);
  }
  console.log('\nQdrant collections:', await collectionStats());

  // Back-fill the semantic fit of pending join requests created without one (e.g. seed data)
  const pending = await query<{ request_id: number; user_id: number; team_id: number }>(
    `SELECT request_id, user_id, team_id FROM join_requests WHERE status = 'PENDING' AND match_score IS NULL`,
  );
  for (const r of pending) {
    const [profile, team] = await Promise.all([getVector('profiles', r.user_id), getVector('teams', r.team_id)]);
    if (profile && team) {
      await query('UPDATE join_requests SET match_score = $2 WHERE request_id = $1', [r.request_id, cosine(profile, team).toFixed(4)]);
    }
  }
  if (pending.length) console.log(`Scored ${pending.length} pending join request(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closePool());
