/**
 * Vector-database tests: embedding model, cosine similarity semantics and
 * Qdrant filtered kNN search.
 *
 *   npm run test:db      (needs Qdrant running; the last test needs seed + vector:sync)
 */
import '../scripts/load-env';
import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { closePool, queryOne } from '../src/lib/db';
import { EMBEDDING_DIM, cosine, embed, embedMany } from '../src/lib/embeddings';
import { COLLECTIONS, qdrant, searchByText } from '../src/lib/vector';

after(() => closePool());

describe('embeddings', () => {
  test(`produces ${EMBEDDING_DIM}-dimensional unit vectors`, async () => {
    const v = await embed('PostgreSQL and REST APIs');
    assert.equal(v.length, EMBEDDING_DIM);
    assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-3, 'vector should be L2-normalised');
  });

  test('matches by meaning, not keywords (synopsis example)', async () => {
    const [queryVec, backend, artist] = await embedMany([
      'looking for a backend dev comfortable with databases',
      'Skills: SQL, API design, Node.js',
      'Skills: watercolour painting, sketching and calligraphy',
    ]);
    const relevant = cosine(queryVec, backend);
    const irrelevant = cosine(queryVec, artist);
    assert.ok(relevant > irrelevant + 0.1, `expected ${relevant.toFixed(3)} >> ${irrelevant.toFixed(3)}`);
  });
});

describe('qdrant', () => {
  test('upsert + filtered cosine kNN on a temporary collection', async () => {
    const name = `test_tmp_${Date.now()}`;
    const client = qdrant();
    await client.createCollection(name, { vectors: { size: EMBEDDING_DIM, distance: 'Cosine' } });
    try {
      const texts = ['machine learning for healthcare imaging', 'IoT soil sensors for farming', 'deep learning on chest x-rays'];
      const vectors = await embedMany(texts);
      await client.upsert(name, {
        wait: true,
        points: [
          { id: 1, vector: vectors[0], payload: { status: 'APPROVED' } },
          { id: 2, vector: vectors[1], payload: { status: 'APPROVED' } },
          { id: 3, vector: vectors[2], payload: { status: 'REJECTED' } },
        ],
      });
      const q = await embed('AI that reads medical scans');
      const all = await client.query(name, { query: q, limit: 3 });
      assert.notEqual(all.points[0].id, 2, 'farming should not be the best match for medical scans');

      const approvedOnly = await client.query(name, {
        query: q,
        limit: 3,
        filter: { must: [{ key: 'status', match: { value: 'APPROVED' } }] },
      });
      assert.ok(approvedOnly.points.every((p) => p.id !== 3), 'payload filter must exclude REJECTED points');
      assert.equal(approvedOnly.points[0].id, 1);
    } finally {
      await client.deleteCollection(name);
    }
  });

  test('seeded data: the backend/database student ranks near the top for the synopsis query', async (t) => {
    const info = await qdrant().getCollection(COLLECTIONS.profiles).catch(() => null);
    if (!info || !info.points_count) return t.skip('run npm run setup first');
    const aarav = await queryOne<{ user_id: number }>(`SELECT user_id FROM users WHERE srn = 'PES1UG23CS101'`);
    if (!aarav) return t.skip('seed data not loaded');
    const hits = await searchByText('profiles', 'looking for a backend dev comfortable with databases', { limit: 3 });
    assert.ok(
      hits.some((h) => h.id === aarav.user_id),
      `expected Aarav (backend/PostgreSQL) in the top 3, got ${JSON.stringify(hits)}`,
    );
  });
});
