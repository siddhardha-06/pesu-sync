/**
 * Database-level tests: constraints, triggers, stored procedures, transactions
 * and concurrency. Each test runs inside a transaction that is rolled back, so
 * the dev database is left untouched (the concurrency test cleans up after itself).
 *
 *   npm run test:db      (needs `npm run db:up` + `npm run db:setup`)
 */
import '../scripts/load-env';
import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import type { PoolClient } from 'pg';
import { closePool, getPool } from '../src/lib/db';

const FAKE_HASH = '$2b$10$' + 'x'.repeat(53); // bcrypt-shaped, satisfies chk_users_password_bcrypt
let seq = 0;

async function inRollback(fn: (c: PoolClient) => Promise<void>) {
  const c = await getPool().connect();
  try {
    await c.query('BEGIN');
    await fn(c);
  } finally {
    await c.query('ROLLBACK');
    c.release();
  }
}

/** Runs a statement that must fail; the savepoint keeps the outer transaction usable. */
async function expectDbError(c: PoolClient, sql: string, params: unknown[], expected: { code?: string; constraint?: string; message?: RegExp }) {
  await c.query('SAVEPOINT expect_error');
  try {
    await c.query(sql, params);
  } catch (error) {
    await c.query('ROLLBACK TO SAVEPOINT expect_error');
    const e = error as { code: string; constraint?: string; message: string };
    if (expected.code) assert.equal(e.code, expected.code, e.message);
    if (expected.constraint) assert.equal(e.constraint, expected.constraint);
    if (expected.message) assert.match(e.message, expected.message);
    return;
  }
  assert.fail(`expected failure for: ${sql}`);
}

async function makeUser(c: PoolClient, role: 'STUDENT' | 'FACULTY' = 'STUDENT'): Promise<number> {
  const n = String(++seq).padStart(3, '0');
  const tag = `${Date.now()}${seq}`;
  const { rows } = await c.query<{ user_id: number }>(
    `INSERT INTO users (full_name, email, password_hash, role, srn, semester)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING user_id`,
    role === 'STUDENT'
      ? [`Test Student ${tag}`, `pes2ug99zz${n}@stu.pes.edu`, FAKE_HASH, role, `PES2UG99ZZ${n}`, 5]
      : [`Test Faculty ${tag}`, `f${tag}@pes.edu`, FAKE_HASH, role, null, null],
  );
  return rows[0].user_id;
}

async function makeEvent(c: PoolClient, opts: { min?: number; max?: number; regOffset?: number } = {}): Promise<number> {
  const organizer = await makeUser(c, 'FACULTY');
  const { rows } = await c.query<{ event_id: number }>(
    `INSERT INTO events (title, event_type, organizer_id, start_date, end_date, registration_deadline, min_team_size, max_team_size)
     VALUES ($1, 'HACKATHON', $2, CURRENT_DATE + 10, CURRENT_DATE + 11, CURRENT_DATE + $3::INT, $4, $5)
     RETURNING event_id`,
    [`Test Event ${Date.now()}-${++seq}`, organizer, opts.regOffset ?? 5, opts.min ?? 1, opts.max ?? 4],
  );
  return rows[0].event_id;
}

async function makeTeam(c: PoolClient, eventId: number, leaderId: number, max = 3): Promise<number> {
  const { rows } = await c.query<{ team_id: number }>(
    `INSERT INTO teams (event_id, leader_id, name, description, category, max_members)
     VALUES ($1, $2, $3, 'A team created by the automated test-suite', 'WEB', $4) RETURNING team_id`,
    [eventId, leaderId, `Test Team ${++seq}`, max],
  );
  await c.query(`INSERT INTO team_members (team_id, user_id, member_role) VALUES ($1, $2, 'LEADER')`, [rows[0].team_id, leaderId]);
  return rows[0].team_id;
}

async function teamStatus(c: PoolClient, teamId: number): Promise<string> {
  return (await c.query('SELECT status FROM teams WHERE team_id = $1', [teamId])).rows[0].status;
}

after(() => closePool());

describe('constraints (database-level validation)', () => {
  test('rejects a non-campus email (CHECK)', () =>
    inRollback(async (c) => {
      await expectDbError(
        c,
        `INSERT INTO users (full_name, email, password_hash, role, department) VALUES ('Mallory', 'mallory@gmail.com', $1, 'FACULTY', 'CSE')`,
        [FAKE_HASH],
        { code: '23514', constraint: 'chk_users_email_campus' },
      );
    }));

  test('a student email must be <srn>@stu.pes.edu (CHECK across columns)', () =>
    inRollback(async (c) => {
      await c.query(
        `INSERT INTO users (full_name, email, password_hash, role, srn, semester)
         VALUES ('Good Student', 'pes1ug24am901@stu.pes.edu', $1, 'STUDENT', 'PES1UG24AM901', 5)`,
        [FAKE_HASH],
      );
      await expectDbError(
        c,
        `INSERT INTO users (full_name, email, password_hash, role, srn, semester)
         VALUES ('Wrong Mail', 'someone.else@stu.pes.edu', $1, 'STUDENT', 'PES1UG24AM902', 5)`,
        [FAKE_HASH],
        { code: '23514', constraint: 'chk_users_email_campus' },
      );
      await expectDbError(
        c,
        `INSERT INTO users (full_name, email, password_hash, role, department)
         VALUES ('Staff On Student Domain', 'staff@stu.pes.edu', $1, 'FACULTY', 'CSE')`,
        [FAKE_HASH],
        { code: '23514', constraint: 'chk_users_email_campus' },
      );
    }));

  test('rejects a malformed SRN (CHECK with regex)', () =>
    inRollback(async (c) => {
      await expectDbError(
        c,
        `INSERT INTO users (full_name, email, password_hash, role, srn, semester) VALUES ('Bad SRN', 'pes-123@stu.pes.edu', $1, 'STUDENT', 'PES-123', 5)`,
        [FAKE_HASH],
        { code: '23514', constraint: 'chk_users_srn_format' },
      );
    }));

  test('rejects a student without semester (multi-column CHECK)', () =>
    inRollback(async (c) => {
      await expectDbError(
        c,
        `INSERT INTO users (full_name, email, password_hash, role, srn) VALUES ('No Sem', 'pes1ug24cs999@stu.pes.edu', $1, 'STUDENT', 'PES1UG24CS999')`,
        [FAKE_HASH],
        { code: '23514', constraint: 'chk_users_student_info' },
      );
    }));

  test('rejects a plain-text password', () =>
    inRollback(async (c) => {
      await expectDbError(
        c,
        `INSERT INTO users (full_name, email, password_hash, role, department) VALUES ('Plain', 'plain@pes.edu', $1, 'FACULTY', 'CSE')`,
        ['p'.repeat(60)],
        { code: '23514', constraint: 'chk_users_password_bcrypt' },
      );
    }));

  test('rejects a duplicate email (UNIQUE)', () =>
    inRollback(async (c) => {
      const id = await makeUser(c, 'FACULTY');
      const { rows } = await c.query('SELECT email FROM users WHERE user_id = $1', [id]);
      await expectDbError(
        c,
        `INSERT INTO users (full_name, email, password_hash, role, department) VALUES ('Dup', $1, $2, 'FACULTY', 'CSE')`,
        [rows[0].email, FAKE_HASH],
        { code: '23505', constraint: 'uq_users_email' },
      );
    }));

  test('rejects a team for a non-existent event (FOREIGN KEY)', () =>
    inRollback(async (c) => {
      const leader = await makeUser(c);
      await expectDbError(
        c,
        `INSERT INTO teams (event_id, leader_id, name, description, category, max_members)
         VALUES (999999, $1, 'Ghost', 'This event does not exist at all', 'WEB', 3)`,
        [leader],
        { code: '23503' },
      );
    }));

  test('event dates must be consistent (CHECK across columns)', () =>
    inRollback(async (c) => {
      const organizer = await makeUser(c, 'FACULTY');
      await expectDbError(
        c,
        `INSERT INTO events (title, event_type, organizer_id, start_date, end_date, registration_deadline)
         VALUES ('Backwards', 'HACKATHON', $1, CURRENT_DATE + 5, CURRENT_DATE + 1, CURRENT_DATE)`,
        [organizer],
        { code: '23514', constraint: 'chk_events_dates' },
      );
    }));
});

describe('triggers', () => {
  test('team flips RECRUITING -> FULL at capacity and back when a member leaves', () =>
    inRollback(async (c) => {
      const event = await makeEvent(c);
      const leader = await makeUser(c);
      const team = await makeTeam(c, event, leader, 2);
      assert.equal(await teamStatus(c, team), 'RECRUITING');
      const member = await makeUser(c);
      await c.query('INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)', [team, member]);
      assert.equal(await teamStatus(c, team), 'FULL');
      await c.query('DELETE FROM team_members WHERE team_id = $1 AND user_id = $2', [team, member]);
      assert.equal(await teamStatus(c, team), 'RECRUITING');
    }));

  test('cannot add a member beyond capacity (TEAM_FULL)', () =>
    inRollback(async (c) => {
      const event = await makeEvent(c);
      const team = await makeTeam(c, event, await makeUser(c), 2);
      await c.query('INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)', [team, await makeUser(c)]);
      await expectDbError(c, 'INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)', [team, await makeUser(c)], {
        code: 'P0001',
        message: /^TEAM_FULL/,
      });
    }));

  test('a student can be in only one team per event (ALREADY_IN_TEAM)', () =>
    inRollback(async (c) => {
      const event = await makeEvent(c);
      const student = await makeUser(c);
      await makeTeam(c, event, student, 3);
      const otherTeam = await makeTeam(c, event, await makeUser(c), 3);
      await expectDbError(c, 'INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)', [otherTeam, student], {
        message: /^ALREADY_IN_TEAM/,
      });
    }));

  test('team max_members cannot exceed the event limit (TEAM_TOO_LARGE)', () =>
    inRollback(async (c) => {
      const event = await makeEvent(c, { max: 3 });
      await expectDbError(
        c,
        `INSERT INTO teams (event_id, leader_id, name, description, category, max_members)
         VALUES ($1, $2, 'Too big', 'This team wants more members than allowed', 'WEB', 5)`,
        [event, await makeUser(c)],
        { message: /^TEAM_TOO_LARGE/ },
      );
    }));

  test('join requests to a locked team are refused (TEAM_CLOSED)', () =>
    inRollback(async (c) => {
      const event = await makeEvent(c);
      const leader = await makeUser(c);
      const team = await makeTeam(c, event, leader, 3);
      await c.query('CALL sp_lock_team($1, $2)', [team, leader]);
      await expectDbError(c, 'INSERT INTO join_requests (team_id, user_id) VALUES ($1, $2)', [team, await makeUser(c)], {
        message: /^TEAM_CLOSED/,
      });
    }));

  test('join requests after the registration deadline are refused (DEADLINE_PASSED)', () =>
    inRollback(async (c) => {
      const event = await makeEvent(c, { regOffset: -1 });
      const team = await makeTeam(c, event, await makeUser(c), 3);
      await expectDbError(c, 'INSERT INTO join_requests (team_id, user_id) VALUES ($1, $2)', [team, await makeUser(c)], {
        message: /^DEADLINE_PASSED/,
      });
    }));

  test('only team members can post team messages', () =>
    inRollback(async (c) => {
      const event = await makeEvent(c);
      const leader = await makeUser(c);
      const team = await makeTeam(c, event, leader, 3);
      await c.query(`INSERT INTO team_messages (team_id, sender_id, body) VALUES ($1, $2, 'hello team')`, [team, leader]);
      await expectDbError(c, `INSERT INTO team_messages (team_id, sender_id, body) VALUES ($1, $2, 'spam')`, [team, await makeUser(c)], {
        message: /^FORBIDDEN/,
      });
    }));

  test('status changes are written to the audit log with the actor, and the log is append-only', () =>
    inRollback(async (c) => {
      const event = await makeEvent(c);
      const leader = await makeUser(c);
      const team = await makeTeam(c, event, leader, 3);
      await c.query(`SELECT set_config('app.user_id', $1, true)`, [String(leader)]);
      await c.query(`UPDATE teams SET status = 'DISBANDED' WHERE team_id = $1`, [team]);
      const { rows } = await c.query(
        `SELECT action, old_value, new_value, actor_id FROM audit_logs
          WHERE entity = 'teams' AND entity_id = $1 ORDER BY log_id`,
        [team],
      );
      assert.deepEqual(
        rows.map((r) => [r.action, r.old_value, r.new_value]),
        [
          ['CREATED', null, 'RECRUITING'],
          ['STATUS_CHANGE', 'RECRUITING', 'DISBANDED'],
        ],
      );
      assert.equal(rows[1].actor_id, leader);
      await expectDbError(c, `UPDATE audit_logs SET new_value = 'HACKED' WHERE entity_id = $1`, [team], { message: /^IMMUTABLE/ });
      await expectDbError(c, 'DELETE FROM audit_logs WHERE entity_id = $1', [team], { message: /^IMMUTABLE/ });
    }));
});

describe('stored procedures', () => {
  test('sp_accept_join_request adds the member and withdraws their other requests in the same event', () =>
    inRollback(async (c) => {
      const event = await makeEvent(c);
      const leaderA = await makeUser(c);
      const leaderB = await makeUser(c);
      const teamA = await makeTeam(c, event, leaderA, 3);
      const teamB = await makeTeam(c, event, leaderB, 3);
      const student = await makeUser(c);
      const reqA = (await c.query('INSERT INTO join_requests (team_id, user_id) VALUES ($1, $2) RETURNING request_id', [teamA, student])).rows[0].request_id;
      const reqB = (await c.query('INSERT INTO join_requests (team_id, user_id) VALUES ($1, $2) RETURNING request_id', [teamB, student])).rows[0].request_id;

      await c.query('CALL sp_accept_join_request($1, $2)', [reqA, leaderA]);

      const { rows } = await c.query('SELECT request_id, status FROM join_requests WHERE request_id = ANY($1) ORDER BY request_id', [[reqA, reqB]]);
      assert.deepEqual(rows.map((r) => r.status), ['ACCEPTED', 'WITHDRAWN']);
      const member = await c.query('SELECT member_role FROM team_members WHERE team_id = $1 AND user_id = $2', [teamA, student]);
      assert.equal(member.rows[0].member_role, 'MEMBER');
    }));

  test('sp_accept_join_request refuses a student who is not the leader (FORBIDDEN)', () =>
    inRollback(async (c) => {
      const event = await makeEvent(c);
      const team = await makeTeam(c, event, await makeUser(c), 3);
      const req = (await c.query('INSERT INTO join_requests (team_id, user_id) VALUES ($1, $2) RETURNING request_id', [team, await makeUser(c)])).rows[0].request_id;
      await expectDbError(c, 'CALL sp_accept_join_request($1, $2)', [req, await makeUser(c)], { message: /^FORBIDDEN/ });
    }));

  test('accepting the last free slot makes the team FULL and auto-rejects the queue', () =>
    inRollback(async (c) => {
      const event = await makeEvent(c);
      const leader = await makeUser(c);
      const team = await makeTeam(c, event, leader, 2);
      const r1 = (await c.query('INSERT INTO join_requests (team_id, user_id) VALUES ($1, $2) RETURNING request_id', [team, await makeUser(c)])).rows[0].request_id;
      const r2 = (await c.query('INSERT INTO join_requests (team_id, user_id) VALUES ($1, $2) RETURNING request_id', [team, await makeUser(c)])).rows[0].request_id;
      await c.query('CALL sp_accept_join_request($1, $2)', [r1, leader]);
      assert.equal(await teamStatus(c, team), 'FULL');
      const { rows } = await c.query('SELECT status FROM join_requests WHERE request_id = $1', [r2]);
      assert.equal(rows[0].status, 'REJECTED');
    }));

  test('sp_lock_team enforces the event minimum team size (TEAM_TOO_SMALL)', () =>
    inRollback(async (c) => {
      const event = await makeEvent(c, { min: 2 });
      const leader = await makeUser(c);
      const team = await makeTeam(c, event, leader, 3);
      await expectDbError(c, 'CALL sp_lock_team($1, $2)', [team, leader], { message: /^TEAM_TOO_SMALL/ });
      await c.query('INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)', [team, await makeUser(c)]);
      await c.query('CALL sp_lock_team($1, $2)', [team, leader]);
      assert.equal(await teamStatus(c, team), 'LOCKED');
      await expectDbError(c, 'DELETE FROM team_members WHERE team_id = $1 AND member_role = $2', [team, 'MEMBER'], {
        message: /^TEAM_CLOSED/,
      });
    }));

  test('fn_skill_overlap returns the share of required skills a student has', () =>
    inRollback(async (c) => {
      const event = await makeEvent(c);
      const team = await makeTeam(c, event, await makeUser(c), 3);
      const student = await makeUser(c);
      const skills = (await c.query(`SELECT skill_id FROM skills ORDER BY skill_id LIMIT 4`)).rows.map((r) => r.skill_id);
      if (skills.length < 4) return; // needs seeded skills
      await c.query('INSERT INTO team_required_skills (team_id, skill_id) SELECT $1, UNNEST($2::INT[])', [team, skills]);
      await c.query('INSERT INTO user_skills (user_id, skill_id) SELECT $1, UNNEST($2::INT[])', [student, skills.slice(0, 3)]);
      const { rows } = await c.query('SELECT fn_skill_overlap($1, $2) AS overlap', [student, team]);
      assert.equal(Number(rows[0].overlap), 0.75);
    }));
});

describe('transactions', () => {
  test('a failure inside the transaction rolls back every statement (atomicity)', () =>
    inRollback(async (c) => {
      const event = await makeEvent(c);
      const leader = await makeUser(c);
      await makeTeam(c, event, leader, 3); // leader already has a team in this event
      const before = (await c.query('SELECT COUNT(*)::INT AS n FROM teams WHERE event_id = $1', [event])).rows[0].n;

      await c.query('SAVEPOINT create_team');
      await c.query(
        `INSERT INTO teams (event_id, leader_id, name, description, category, max_members)
         VALUES ($1, $2, 'Second team', 'Second team by the same leader in one event', 'WEB', 3)`,
        [event, leader],
      );
      await assert.rejects(
        c.query(`INSERT INTO team_members (team_id, user_id, member_role)
                 VALUES (currval('teams_team_id_seq'), $1, 'LEADER')`, [leader]),
        /ALREADY_IN_TEAM/,
      );
      await c.query('ROLLBACK TO SAVEPOINT create_team');

      const afterCount = (await c.query('SELECT COUNT(*)::INT AS n FROM teams WHERE event_id = $1', [event])).rows[0].n;
      assert.equal(afterCount, before, 'the half-created team must not survive');
    }));

  test('two concurrent accepts for the last slot: exactly one succeeds (row locking)', async () => {
    const pool = getPool();
    const setup = await pool.connect();
    const ids: { users: number[]; event?: number; team?: number; requests: number[] } = { users: [], requests: [] };
    try {
      await setup.query('BEGIN');
      const leader = await makeUser(setup);
      const s1 = await makeUser(setup);
      const s2 = await makeUser(setup);
      ids.event = await makeEvent(setup);
      ids.users.push(leader, s1, s2, (await setup.query('SELECT organizer_id FROM events WHERE event_id = $1', [ids.event])).rows[0].organizer_id);
      ids.team = await makeTeam(setup, ids.event, leader, 2);
      for (const s of [s1, s2]) {
        ids.requests.push((await setup.query('INSERT INTO join_requests (team_id, user_id) VALUES ($1, $2) RETURNING request_id', [ids.team, s])).rows[0].request_id);
      }
      await setup.query('COMMIT');

      const a = await pool.connect();
      const b = await pool.connect();
      try {
        await a.query('BEGIN');
        await b.query('BEGIN');
        await a.query('CALL sp_accept_join_request($1, $2)', [ids.requests[0], leader]);
        const bResult = b.query('CALL sp_accept_join_request($1, $2)', [ids.requests[1], leader]).then(
          () => 'ok',
          (e: Error) => e.message,
        ); // blocks on A's row locks
        await new Promise((r) => setTimeout(r, 200));
        await a.query('COMMIT');
        const outcome = await bResult;
        await b.query('ROLLBACK');
        assert.match(outcome, /^(INVALID_STATE|TEAM_FULL)/, `second accept should fail, got: ${outcome}`);
      } finally {
        a.release();
        b.release();
      }
      const members = (await setup.query('SELECT COUNT(*)::INT AS n FROM team_members WHERE team_id = $1', [ids.team])).rows[0].n;
      assert.equal(members, 2);
    } finally {
      // cleanup committed fixtures (audit rows are immutable, so the guard is lifted inside this transaction only)
      await setup.query('ROLLBACK').catch(() => {});
      await setup.query('BEGIN');
      await setup.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_immutable');
      if (ids.event) await setup.query('DELETE FROM events WHERE event_id = $1', [ids.event]);
      await setup.query(
        `DELETE FROM audit_logs
          WHERE actor_id = ANY($1)
             OR (entity IN ('teams', 'team_members') AND entity_id = $2)
             OR (entity = 'join_requests' AND entity_id = ANY($3))`,
        [ids.users, ids.team ?? 0, ids.requests],
      );
      await setup.query('DELETE FROM users WHERE user_id = ANY($1)', [ids.users]);
      await setup.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_immutable');
      await setup.query('COMMIT');
      setup.release();
    }
  });
});
