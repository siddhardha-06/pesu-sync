/**
 * End-to-end API tests against a running server (npm run dev / npm start).
 * They exercise authentication, role-based authorisation, DB-level validation
 * surfacing as HTTP errors, and the full team + capstone workflows.
 *
 *   BASE_URL=http://localhost:3000 npm run test:api
 *
 * The tests register fresh accounts each run; `npm run db:seed` resets the demo data.
 *
 * PESU Academy login and pes.edu events are tested against a local mock of PESUAuth and of
 * the pes.edu events API (real credentials can't be used in tests). To run them, start the app with
 *   PESU_AUTH_URL=http://localhost:5055  CAMPUS_EVENTS_URL=http://localhost:5055/wp-json/tribe/events/v1/events
 * and run the tests with PESU_MOCK_PORT=5055 (the tests start the mock themselves).
 */
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { after, before, describe, test } from 'node:test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const PASSWORD = 'Pesu@2026';
const run = Date.now().toString(36);

type Session = { cookie: string };

async function call(path: string, opts: { method?: string; body?: unknown; session?: Session } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: {
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.session ? { Cookie: opts.session.cookie } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    redirect: 'manual',
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, setCookie: res.headers.get('set-cookie') };
}

async function login(email: string, password = PASSWORD): Promise<Session> {
  const r = await call('/api/auth/login', { body: { email, password } });
  assert.equal(r.status, 200, `login failed for ${email}: ${JSON.stringify(r.data)}`);
  return { cookie: r.setCookie!.split(';')[0] };
}

function randomSrn(): string {
  const L = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
  return `PES1UG2${Math.floor(Math.random() * 10)}${L()}${L()}${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
}

async function register(name: string, skills: number[] = []): Promise<Session & { id: number }> {
  const srn = randomSrn();
  const r = await call('/api/auth/register', {
    body: {
      fullName: name,
      email: `${srn.toLowerCase()}@stu.pes.edu`,
      password: PASSWORD,
      srn,
      semester: 5,
      bio: `${name} enjoys backend development with PostgreSQL and APIs`,
      skills: skills.map((skillId) => ({ skillId, proficiency: 4 })),
    },
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return { cookie: r.setCookie!.split(';')[0], id: r.data.user.id };
}

let serverUp = false;
before(async () => {
  serverUp = await fetch(`${BASE}/api/skills`).then((r) => r.ok, () => false);
});

describe('authentication & authorisation', () => {
  test('protected API rejects anonymous requests (401)', async (t) => {
    if (!serverUp) return t.skip(`server not running at ${BASE}`);
    assert.equal((await call('/api/dashboard')).status, 401);
  });

  test('wrong password is rejected (401) and pages redirect to /login', async (t) => {
    if (!serverUp) return t.skip();
    assert.equal((await call('/api/auth/login', { body: { email: 'admin@pes.edu', password: 'nope' } })).status, 401);
    const page = await fetch(`${BASE}/dashboard`, { redirect: 'manual' });
    assert.equal(page.status, 307);
    assert.match(page.headers.get('location') ?? '', /\/login\?next=%2Fdashboard/);
  });

  test('a student cannot use admin or faculty-only endpoints (403)', async (t) => {
    if (!serverUp) return t.skip();
    const student = await login('pes1ug23cs101@stu.pes.edu');
    assert.equal((await call('/api/admin/users', { session: student })).status, 403);
    assert.equal((await call('/api/events', { session: student, body: { title: 'x' } })).status, 403);
    const me = await call('/api/auth/me', { session: student });
    assert.equal(me.data.user.role, 'STUDENT');
  });

  test('registration enforces the <srn>@stu.pes.edu CHECK constraint (400)', async (t) => {
    if (!serverUp) return t.skip();
    for (const email of [`outsider.${run}@gmail.com`, `someone.${run}@stu.pes.edu`]) {
      const r = await call('/api/auth/register', {
        body: { fullName: 'Outsider', email, password: PASSWORD, srn: randomSrn(), semester: 5 },
      });
      assert.equal(r.status, 400, email);
      assert.match(r.data.error, /stu\.pes\.edu/);
    }
    // without an email the API derives it from the SRN
    const srn = randomSrn();
    const ok = await call('/api/auth/register', { body: { fullName: `Derived ${run}`, password: PASSWORD, srn, semester: 5 } });
    assert.equal(ok.status, 201, JSON.stringify(ok.data));
    assert.equal(ok.data.user.email, `${srn.toLowerCase()}@stu.pes.edu`);
  });
});

describe('team workflow (transactions + procedures)', () => {
  test('create team -> request -> accept -> lock -> further requests refused', async (t) => {
    if (!serverUp) return t.skip();
    const skills = (await call('/api/skills')).data.skills as Array<{ skill_id: number; name: string }>;
    const pg = skills.find((s) => s.name === 'PostgreSQL')!.skill_id;

    const leader = await register(`Leader ${run}`, [pg]);
    const member = await register(`Member ${run}`, [pg]);
    const late = await register(`Late ${run}`);

    const events = (await call('/api/events?phase=OPEN', { session: leader })).data.events as Array<{ event_id: number; title: string }>;
    const hackathon = events.find((e) => e.title.startsWith('PESU Hackathon'))!;
    const created = await call('/api/teams', {
      session: leader,
      body: {
        eventId: hackathon.event_id,
        name: `API Test Team ${run}`,
        category: 'DATA',
        maxMembers: 3,
        description: 'Automated API test team building a PostgreSQL analytics dashboard',
        requiredSkillIds: [pg],
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const teamId = created.data.team.team_id;

    const req = await call(`/api/teams/${teamId}/join`, { session: member, body: { message: 'hi' } });
    assert.equal(req.status, 201, JSON.stringify(req.data));
    assert.ok(req.data.request.match_score !== null, 'semantic match score should be stored');

    const dup = await call(`/api/teams/${teamId}/join`, { session: member, body: {} });
    assert.equal(dup.status, 409, 'duplicate pending request must hit the partial unique index');

    const notLeader = await call(`/api/join-requests/${req.data.request.request_id}`, {
      method: 'PATCH', session: late, body: { action: 'accept' },
    });
    assert.equal(notLeader.status, 403);

    const accepted = await call(`/api/join-requests/${req.data.request.request_id}`, {
      method: 'PATCH', session: leader, body: { action: 'accept' },
    });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
    assert.equal(accepted.data.request.status, 'ACCEPTED');

    const locked = await call(`/api/teams/${teamId}/lock`, { method: 'POST', session: leader });
    assert.equal(locked.status, 200, JSON.stringify(locked.data));

    const refused = await call(`/api/teams/${teamId}/join`, { session: late, body: {} });
    assert.equal(refused.status, 409);
    assert.match(refused.data.error, /LOCKED/);

    const detail = await call(`/api/teams/${teamId}`, { session: leader });
    assert.equal(detail.data.team.status, 'LOCKED');
    assert.equal(detail.data.members.length, 2);
    assert.ok(detail.data.history.some((h: { new_value: string }) => h.new_value === 'LOCKED'), 'audit trail has the lock');
  });
});

describe('capstones, search and matching', () => {
  test('student pitches, student cannot review, faculty approves', async (t) => {
    if (!serverUp) return t.skip();
    const student = await register(`Pitcher ${run}`);
    const pitch = await call('/api/capstones', {
      session: student,
      body: {
        title: `Campus Water Leak Detection ${run}`,
        domain: 'Smart Campus',
        techStack: 'ESP32, MQTT, Next.js',
        abstract: 'Ultrasonic flow sensors on hostel pipelines detect leaks early and alert maintenance staff before water is wasted.',
      },
    });
    assert.equal(pitch.status, 201, JSON.stringify(pitch.data));
    const id = pitch.data.capstone.capstone_id;

    assert.equal((await call(`/api/capstones/${id}`, { method: 'PATCH', session: student, body: { action: 'approve' } })).status, 403);

    const faculty = await login('kavya.rao@pes.edu');
    const noFeedback = await call(`/api/capstones/${id}`, { method: 'PATCH', session: faculty, body: { action: 'reject' } });
    assert.equal(noFeedback.status, 400);
    const approved = await call(`/api/capstones/${id}`, { method: 'PATCH', session: faculty, body: { action: 'approve', feedback: 'Good scope' } });
    assert.equal(approved.status, 200, JSON.stringify(approved.data));
    assert.equal(approved.data.capstone.status, 'APPROVED');
  });

  test('keyword (full-text) search highlights matches; semantic search ranks by cosine', async (t) => {
    if (!serverUp) return t.skip();
    const faculty = await login('kavya.rao@pes.edu');
    const kw = await call('/api/capstones?mode=keyword&q=chest%20x-ray', { session: faculty });
    assert.equal(kw.status, 200);
    assert.ok(kw.data.results.length >= 1);
    assert.match(kw.data.results[0].snippet, /\[\[/);

    const sem = await call('/api/search/semantic?type=capstones&q=machine%20learning%20healthcare', { session: faculty });
    assert.equal(sem.status, 200);
    const scores = sem.data.results.map((r: { score: number }) => r.score);
    assert.deepEqual(scores, [...scores].sort((a: number, b: number) => b - a), 'results sorted by similarity');
    assert.equal(sem.data.results[0].domain, 'Healthcare');
  });

  test('match suggestions combine vector similarity and skill overlap', async (t) => {
    if (!serverUp) return t.skip();
    const student = await login('pes1ug23cs101@stu.pes.edu');
    const r = await call('/api/matches', { session: student });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.ok(r.data.suggestions.length > 0);
    for (const s of r.data.suggestions) {
      assert.ok(Math.abs(s.score - (0.75 * s.cosine + 0.25 * s.overlap)) < 1e-3);
    }
  });

  test('admin can list users and refresh the materialized view', async (t) => {
    if (!serverUp) return t.skip();
    const admin = await login('admin@pes.edu');
    const users = await call('/api/admin/users?role=FACULTY', { session: admin });
    assert.equal(users.status, 200);
    assert.ok(users.data.users.every((u: { role: string }) => u.role === 'FACULTY'));
    const refreshed = await call('/api/admin/analytics/refresh', { method: 'POST', session: admin });
    assert.equal(refreshed.status, 200);
    assert.ok(refreshed.data.skills > 0);
  });
});

// ---------------------------------------------------------------------------
// PESU Academy login + pes.edu events, against a local mock (opt-in)
// ---------------------------------------------------------------------------
const MOCK_PORT = Number(process.env.PESU_MOCK_PORT ?? 0);
const MOCK = { srn: randomSrn(), password: 'right-password' };
let mock: Server | null = null;

function tomorrowUtc(hours: number): string {
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  d.setUTCHours(hours, 30, 0, 0);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

describe('PESU Academy login and pes.edu events (mock services)', () => {
  before(async () => {
    if (!MOCK_PORT) return;
    mock = createServer(async (req, res) => {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const send = (status: number, body: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (req.method === 'POST' && req.url === '/authenticate') {
        const { username, password, profile } = JSON.parse(raw || '{}');
        if (username !== MOCK.srn || password !== MOCK.password) {
          return send(401, { status: false, message: 'Invalid username or password.', timestamp: new Date().toISOString() });
        }
        return send(200, {
          status: true,
          message: 'Login successful.',
          timestamp: new Date().toISOString(),
          profile: profile
            ? { name: 'TEST PESU STUDENT', srn: MOCK.srn, branch: 'Computer Science and Engineering', branchShortCode: 'CSE', semester: 'Sem-5', campus: 'RR' }
            : undefined,
        });
      }
      if (req.method === 'GET' && req.url?.startsWith('/wp-json/tribe/events/v1/events')) {
        return send(200, {
          events: [
            {
              id: 9001,
              title: 'Mock Campus Hackathon &#8211; Test',
              url: 'https://pes.edu/event/mock-campus-hackathon/',
              excerpt: '<p>Build &amp; ship in 24 hours</p>',
              all_day: false,
              utc_start_date: tomorrowUtc(4),
              utc_end_date: tomorrowUtc(12),
              venue: { venue: 'MRD Auditorium' },
            },
          ],
        });
      }
      send(404, { status: false });
    });
    await new Promise<void>((resolve) => mock!.listen(MOCK_PORT, resolve));
  });
  after(() => mock?.close());

  test('first PESU Academy login creates a verified student; the next one signs in', async (t) => {
    if (!serverUp || !MOCK_PORT) return t.skip('set PESU_MOCK_PORT and point PESU_AUTH_URL at the mock');
    const wrong = await call('/api/auth/pesu', { body: { username: MOCK.srn, password: 'nope' } });
    assert.equal(wrong.status, 401);
    assert.match(wrong.data.error, /PESU Academy did not accept/);

    const first = await call('/api/auth/pesu', { body: { username: MOCK.srn, password: MOCK.password } });
    assert.equal(first.status, 201, JSON.stringify(first.data));
    assert.equal(first.data.created, true);
    assert.equal(first.data.user.email, `${MOCK.srn.toLowerCase()}@stu.pes.edu`);
    assert.equal(first.data.user.name, 'Test Pesu Student');

    const second = await call('/api/auth/pesu', { body: { username: MOCK.srn, password: MOCK.password } });
    assert.equal(second.status, 200);
    assert.equal(second.data.created, false);

    const profile = await call('/api/profile', { session: { cookie: second.setCookie!.split(';')[0] } });
    assert.equal(profile.data.user.auth_provider, 'PESU');
    assert.ok(profile.data.user.pesu_verified_at, 'student is marked as verified by PESU Academy');
    assert.equal(profile.data.user.semester, 5);

    // the random password stored for PESU accounts cannot be used to log in
    assert.equal((await call('/api/auth/login', { body: { email: first.data.user.email, password: MOCK.password } })).status, 401);
  });

  test('pes.edu events are cached with an idempotent upsert and shown to everyone', async (t) => {
    if (!serverUp || !MOCK_PORT) return t.skip('set PESU_MOCK_PORT and point CAMPUS_EVENTS_URL at the mock');
    const faculty = await login('kavya.rao@pes.edu');
    const student = await login('pes1ug23cs101@stu.pes.edu');
    assert.equal((await call('/api/campus-events', { method: 'POST', session: student })).status, 403);

    const first = await call('/api/campus-events', { method: 'POST', session: faculty });
    assert.equal(first.status, 200, JSON.stringify(first.data));
    assert.equal(first.data.lastSync.ok, true);
    const ev = first.data.events.find((e: { title: string }) => e.title.startsWith('Mock Campus Hackathon'));
    assert.ok(ev, 'mock event cached');
    assert.equal(ev.title, 'Mock Campus Hackathon – Test', 'HTML entities decoded');
    assert.equal(ev.summary, 'Build & ship in 24 hours', 'HTML stripped');
    assert.equal(ev.venue, 'MRD Auditorium');

    const again = await call('/api/campus-events', { method: 'POST', session: faculty });
    assert.equal(again.data.events.length, first.data.events.length, 'refreshing twice does not duplicate rows');
    assert.equal((await call('/api/campus-events', { session: student })).status, 200);
  });
});
