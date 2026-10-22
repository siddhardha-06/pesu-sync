/**
 * Unit tests for src/lib (part of the coverage suite: npm run test:coverage).
 */
import '../../scripts/load-env';
import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { as, anon, json, mockServer, STUDENT } from '../support/route';
import { hashPassword, requireUser, verifyPassword } from '../../src/lib/auth';
import { getCampusEvents, plainText, refreshCampusEvents } from '../../src/lib/campus-events';
import { closePool, getPool, query, queryOne, withTransaction } from '../../src/lib/db';
import { cosine, embed, embedMany, embeddingProvider, hashEmbedding } from '../../src/lib/embeddings';
import {
  ApiError, dateStr, handler, idParam, int, intList, ok, oneOf, optionalInt, optionalText, readJson, text, toErrorResponse,
} from '../../src/lib/http';
import { signSession, verifySession } from '../../src/lib/jwt';
import { authenticateWithPesu, parseSemester, titleCaseName } from '../../src/lib/pesu-auth';
import {
  collectionStats, dropCollections, ensureVector, excludeIds, getVector, matchFilter, searchByText, syncVectors, syncVectorsSafe,
} from '../../src/lib/vector';

after(() => closePool());

const statusOf = async (e: unknown) => {
  const r = toErrorResponse(e);
  return { status: r.status, body: await r.json() };
};

describe('http: error mapping (database errors -> HTTP)', () => {
  test('ApiError keeps its status', async () => {
    assert.deepEqual(await statusOf(new ApiError(418, 'teapot')), { status: 418, body: { error: 'teapot' } });
  });
  test('trigger RAISE with a code word', async () => {
    const r = await statusOf({ code: 'P0001', message: 'TEAM_FULL: team is full' });
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'team is full');
    assert.equal(r.body.code, 'TEAM_FULL');
  });
  test('trigger RAISE with an unknown code word or none', async () => {
    assert.equal((await statusOf({ code: 'P0001', message: 'WHATEVER: x' })).status, 400);
    const plain = await statusOf({ code: 'P0001', message: 'no colon here' });
    assert.equal(plain.status, 400);
    assert.equal(plain.body.error, 'no colon here');
  });
  test('constraint violations', async () => {
    const dup = await statusOf({ code: '23505', constraint: 'uq_users_email', message: 'dup' });
    assert.deepEqual([dup.status, dup.body.error], [409, 'An account with this email already exists']);
    assert.equal((await statusOf({ code: '23505', constraint: 'unknown', message: 'dup' })).body.error, 'Duplicate value');
    assert.equal((await statusOf({ code: '23514', constraint: 'chk_teams_desc', message: 'x' })).status, 400);
    assert.equal((await statusOf({ code: '23514', message: 'raw check' })).body.error, 'raw check');
    assert.equal((await statusOf({ code: '23502', message: 'null' })).status, 400);
    assert.equal((await statusOf({ code: '23503', message: 'fk' })).body.error, 'Referenced record does not exist');
    assert.equal((await statusOf({ code: '23503', constraint: 'chk_teams_size', message: 'fk' })).body.error, 'A team must allow between 2 and 10 members');
    for (const code of ['22001', '22003', '22007', '22008', '22P02']) assert.equal((await statusOf({ code, message: 'bad' })).status, 400);
  });
  test('anything else is a 500', async () => {
    const original = console.error;
    console.error = () => {};
    try {
      assert.equal((await statusOf(new Error('boom'))).status, 500);
      assert.equal((await statusOf({ code: 'XX000', message: 'odd' })).status, 500);
    } finally {
      console.error = original;
    }
  });
  test('handler() turns thrown errors into responses', async () => {
    const h = handler(async () => {
      throw new ApiError(403, 'no');
    });
    assert.equal((await h(new Request('http://x'), {})).status, 403);
    assert.equal((await handler(async () => ok({ a: 1 }, 201))(new Request('http://x'), {})).status, 201);
  });
});

describe('http: input parsing', () => {
  const post = (body: string) => new Request('http://x', { method: 'POST', body });
  test('readJson', async () => {
    assert.deepEqual(await readJson(post('{"a":1}')), { a: 1 });
    await assert.rejects(readJson(post('[1]')), /JSON object/);
    await assert.rejects(readJson(post('not json')), /JSON object/);
  });
  test('text / optionalText', () => {
    assert.equal(text('  hi  ', 'f'), 'hi');
    assert.throws(() => text(5, 'f'), /required/);
    assert.throws(() => text('a', 'f', { min: 2 }), /at least 2/);
    assert.throws(() => text('', 'f'), /at least 1/);
    assert.throws(() => text('abc', 'f', { max: 2 }), /at most 2/);
    assert.equal(optionalText(undefined, 'f'), null);
    assert.equal(optionalText(null, 'f'), null);
    assert.equal(optionalText('   ', 'f'), null);
    assert.equal(optionalText('x', 'f'), 'x');
  });
  test('int / optionalInt / intList', () => {
    assert.equal(int('7', 'n'), 7);
    assert.equal(int(7, 'n', { min: 1, max: 9 }), 7);
    assert.throws(() => int('x', 'n'), /integer/);
    assert.throws(() => int(1.5, 'n'), /integer/);
    assert.throws(() => int(0, 'n', { min: 1 }), />= 1/);
    assert.throws(() => int(10, 'n', { max: 9 }), /<= 9/);
    assert.equal(optionalInt(undefined, 'n'), null);
    assert.equal(optionalInt('', 'n'), null);
    assert.equal(optionalInt(null, 'n'), null);
    assert.equal(optionalInt('3', 'n'), 3);
    assert.deepEqual(intList(undefined, 'l'), []);
    assert.deepEqual(intList(null, 'l'), []);
    assert.deepEqual(intList([1, '2'], 'l'), [1, 2]);
    assert.throws(() => intList('x', 'l'), /array/);
  });
  test('oneOf / dateStr / idParam', () => {
    assert.equal(oneOf('A', 'f', ['A', 'B'] as const), 'A');
    assert.throws(() => oneOf('C', 'f', ['A', 'B'] as const), /one of/);
    assert.throws(() => oneOf(1, 'f', ['A'] as const), /one of/);
    assert.equal(dateStr('2026-01-02', 'd'), '2026-01-02');
    assert.throws(() => dateStr('02/01/2026', 'd'), /YYYY-MM-DD/);
    assert.throws(() => dateStr(5, 'd'), /YYYY-MM-DD/);
    assert.equal(idParam('12'), 12);
    assert.throws(() => idParam('0'), /Invalid id/);
    assert.throws(() => idParam('abc'), /Invalid id/);
  });
});

describe('jwt + auth', () => {
  test('sessions round-trip; bad tokens are rejected', async () => {
    const token = await signSession({ id: 1, name: 'A', email: 'a@pes.edu', role: 'ADMIN' });
    assert.deepEqual(await verifySession(token), { id: 1, name: 'A', email: 'a@pes.edu', role: 'ADMIN' });
    assert.equal(await verifySession(undefined), null);
    assert.equal(await verifySession('garbage'), null);
  });
  test('a missing or short JWT_SECRET is refused', async () => {
    const saved = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'short';
    try {
      await assert.rejects(signSession({ id: 1, name: 'A', email: 'a', role: 'ADMIN' }), /JWT_SECRET/);
    } finally {
      process.env.JWT_SECRET = saved;
    }
  });
  test('bcrypt helpers', async () => {
    const h = await hashPassword('secret-123');
    assert.match(h, /^\$2[aby]\$/);
    assert.equal(await verifyPassword('secret-123', h), true);
    assert.equal(await verifyPassword('nope', h), false);
  });
  test('requireUser: anonymous, wrong role, deactivated account', async () => {
    anon();
    await assert.rejects(requireUser(), (e: ApiError) => e.status === 401);
    const me = await as(STUDENT);
    await assert.rejects(requireUser('ADMIN'), (e: ApiError) => e.status === 403);
    assert.equal((await requireUser('STUDENT')).id, me.user_id);
    await query('UPDATE users SET is_active = FALSE WHERE user_id = $1', [me.user_id]);
    try {
      await assert.rejects(requireUser(), (e: ApiError) => e.status === 401);
    } finally {
      await query('UPDATE users SET is_active = TRUE WHERE user_id = $1', [me.user_id]);
    }
  });
});

describe('db', () => {
  test('queryOne returns null, transactions support isolation + database roles', async () => {
    assert.equal(await queryOne('SELECT 1 WHERE FALSE'), null);
    const level = await withTransaction(async (c) => (await c.query('SHOW transaction_isolation')).rows[0].transaction_isolation, {
      isolation: 'SERIALIZABLE',
    });
    assert.equal(level, 'serializable');
    const role = await withTransaction(async (c) => (await c.query('SELECT current_user AS u')).rows[0].u, { dbRole: 'STUDENT' });
    assert.equal(role, 'pesu_student');
    await assert.rejects(withTransaction(async (c) => c.query('SELECT 1/0')), /division by zero/);
  });
  test('a missing setting is reported clearly and the pool can be recreated', async () => {
    await closePool();
    await closePool(); // no-op when already closed
    const saved = process.env.POSTGRES_DB;
    delete process.env.POSTGRES_DB;
    try {
      assert.throws(() => getPool(), /POSTGRES_DB/);
    } finally {
      process.env.POSTGRES_DB = saved;
    }
    assert.equal((await query('SELECT 1 AS one'))[0].one, 1);
  });
});

describe('embeddings', () => {
  test('hash provider, cosine edge cases and empty input', async () => {
    assert.deepEqual(await embedMany([]), []);
    const saved = process.env.EMBEDDING_PROVIDER;
    process.env.EMBEDDING_PROVIDER = 'hash';
    try {
      assert.equal(embeddingProvider(), 'hash');
      const [a, b] = await embedMany(['postgres sql', 'postgres sql']);
      assert.ok(Math.abs(cosine(a, b) - 1) < 1e-9);
    } finally {
      process.env.EMBEDDING_PROVIDER = saved;
    }
    assert.equal(embeddingProvider(), 'local');
    assert.equal(hashEmbedding('').length, 384);
    assert.equal(cosine([0, 0], [0, 0]), 0);
    assert.equal((await embed('hello')).length, 384);
  });
});

describe('pesu-auth helpers', () => {
  test('name and semester parsing', () => {
    assert.equal(titleCaseName('  P MANAS   SIDDHARDHA '), 'P Manas Siddhardha');
    assert.equal(parseSemester('Sem-5'), 5);
    assert.equal(parseSemester('9'), null);
    assert.equal(parseSemester(null), null);
    assert.equal(parseSemester('none'), null);
  });
  test('client maps every PESUAuth outcome', async () => {
    const mock = await mockServer((req, body, res) => {
      const { username } = JSON.parse(body || '{}');
      if (username === 'ok') return json(res, 200, { status: true, profile: { name: 'X', srn: 'PES1UG24AM999' } });
      if (username === 'bad') return json(res, 401, { status: false, message: 'nope' });
      if (username === 'invalid') return json(res, 400, { status: false, message: 'Username too long' });
      if (username === 'invalid-nomsg') return json(res, 400, { status: false });
      res.writeHead(500);
      res.end('not json');
    });
    const saved = process.env.PESU_AUTH_URL;
    process.env.PESU_AUTH_URL = `${mock.url}/`;
    try {
      assert.equal((await authenticateWithPesu('ok', 'p')).srn, 'PES1UG24AM999');
      await assert.rejects(authenticateWithPesu('bad', 'p'), (e: ApiError) => e.status === 401);
      await assert.rejects(authenticateWithPesu('invalid', 'p'), (e: ApiError) => e.status === 400 && /too long/.test(e.message));
      await assert.rejects(authenticateWithPesu('invalid-nomsg', 'p'), (e: ApiError) => e.status === 400);
      await assert.rejects(authenticateWithPesu('crash', 'p'), (e: ApiError) => e.status === 502);
      await mock.close();
      await assert.rejects(authenticateWithPesu('ok', 'p'), (e: ApiError) => e.status === 502 && /reached/.test(e.message));
    } finally {
      process.env.PESU_AUTH_URL = saved;
    }
  });
});

describe('campus events', () => {
  test('plainText strips HTML and decodes entities', () => {
    assert.equal(plainText('<p>A &amp; B &#8211; C &#x41; &nbsp;&unknown;</p>'), 'A & B – C A &unknown;');
    assert.equal(plainText(undefined), '');
    assert.equal(plainText('abcdef', 4), 'abc…');
  });
  test('refresh: upsert, skip incomplete items, HTTP and network failures are logged', async () => {
    let mode = 'ok';
    const start = new Date(Date.now() + 86_400_000).toISOString().slice(0, 19).replace('T', ' ');
    const mock = await mockServer((_req, _body, res) => {
      if (mode === 'http') return json(res, 503, {});
      json(res, 200, {
        events: mode === 'none' ? undefined : [
          { id: 1, title: 'Unit &amp; Test', url: 'https://pes.edu/e/1', utc_start_date: start, venue: { venue: 'Hall' }, description: '<b>d</b>' },
          { id: 2, title: '', url: 'https://pes.edu/e/2', start_date: start, all_day: true, venue: [] },
          { id: 3, title: 'no start', url: 'https://pes.edu/e/3' },
          { id: 4, title: 'no url', utc_start_date: start },
        ],
      });
    });
    const saved = process.env.CAMPUS_EVENTS_URL;
    process.env.CAMPUS_EVENTS_URL = mock.url;
    try {
      assert.deepEqual(await refreshCampusEvents(), { ok: true, fetched: 4 });
      const rows = await query("SELECT title, venue, all_day FROM campus_events WHERE source_id IN ('1','2') ORDER BY source_id");
      assert.deepEqual(rows.map((r) => [r.title, r.venue, r.all_day]), [['Unit & Test', 'Hall', false], ['Untitled event', null, true]]);
      const cached = await getCampusEvents();
      assert.equal(cached.lastSync?.ok, true);
      mode = 'none';
      assert.deepEqual(await refreshCampusEvents(), { ok: true, fetched: 0 });
      mode = 'http';
      const failed = await refreshCampusEvents();
      assert.equal(failed.ok, false);
      assert.match(failed.error ?? '', /503/);
      await mock.close();
      assert.equal((await getCampusEvents({ forceRefresh: true })).lastSync?.ok, false);
    } finally {
      process.env.CAMPUS_EVENTS_URL = saved;
      await query('TRUNCATE campus_events, campus_event_syncs');
    }
  });
});

describe('vector store (Qdrant)', () => {
  test('drop, recreate, sync, read, filter and clean up stale points', async () => {
    await dropCollections();
    await dropCollections(); // nothing left to drop
    assert.ok((await syncVectors('profiles')) > 0);
    await syncVectors('teams');
    await syncVectors('capstones');
    const stats = await collectionStats();
    assert.ok(stats.student_profiles.points > 0);

    const aarav = (await queryOne<{ user_id: number }>(`SELECT user_id FROM users WHERE srn = 'PES1UG23CS101'`))!.user_id;
    assert.equal((await getVector('profiles', aarav))?.length, 384);
    assert.equal(await getVector('profiles', 999999), null);
    assert.equal(await ensureVector('profiles', 999999), null); // not a student: nothing to embed
    const hits = await searchByText('teams', 'iot sensors', { limit: 3, filter: matchFilter('status', 'RECRUITING') });
    assert.ok(hits.length > 0);
    assert.deepEqual(excludeIds([]), {});
    assert.deepEqual(excludeIds([1]), { must_not: [{ has_id: [1] }] });

    // a deactivated student is removed from the index on the next sync
    await query('UPDATE users SET is_active = FALSE WHERE user_id = $1', [aarav]);
    try {
      await syncVectors('profiles', [aarav]);
      assert.equal(await getVector('profiles', aarav), null);
    } finally {
      await query('UPDATE users SET is_active = TRUE WHERE user_id = $1', [aarav]);
      assert.equal((await ensureVector('profiles', aarav))?.length, 384); // lazily re-created
    }
    const warn = console.warn;
    console.warn = () => {};
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await syncVectorsSafe('nope' as any, [1]); // errors are swallowed and logged
    } finally {
      console.warn = warn;
    }
  });
});
