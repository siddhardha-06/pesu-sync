import { hashPassword, requireUser } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { handler, ok, oneOf, optionalInt, optionalText, readJson, text } from '@/lib/http';

const ROLES = ['STUDENT', 'FACULTY', 'ADMIN'] as const;

/** GET /api/admin/users?role=&q=&active=true|false — users with activity counts (LEFT JOIN + GROUP BY). */
export const GET = handler(async (req) => {
  await requireUser('ADMIN');
  const p = new URL(req.url).searchParams;
  const role = p.get('role') ? oneOf(p.get('role'), 'role', ROLES) : null;
  const active = p.get('active') === 'true' ? true : p.get('active') === 'false' ? false : null;
  const users = await query(
    `SELECT u.user_id, u.full_name, u.email, u.role, u.srn, u.department, u.semester,
            u.is_active, u.failed_logins, u.last_login_at, u.created_at,
            COUNT(DISTINCT tm.team_id)::INT     AS teams,
            COUNT(DISTINCT c.capstone_id)::INT  AS capstones
       FROM users u
       LEFT JOIN team_members tm       ON tm.user_id = u.user_id
       LEFT JOIN capstone_projects c   ON c.proposer_id = u.user_id
      WHERE ($1::TEXT IS NULL OR u.role = $1)
        AND ($2::BOOLEAN IS NULL OR u.is_active = $2)
        AND ($3::TEXT IS NULL OR u.full_name ILIKE '%' || $3 || '%' OR u.email ILIKE '%' || $3 || '%' OR u.srn ILIKE '%' || $3 || '%')
      GROUP BY u.user_id
      ORDER BY u.role, u.full_name`,
    [role, active, p.get('q')?.trim() || null],
  );
  return ok({ users });
});

/** POST /api/admin/users — admins create faculty/admin (or student) accounts. */
export const POST = handler(async (req) => {
  await requireUser('ADMIN');
  const body = await readJson(req);
  const role = oneOf(body.role, 'role', ROLES);
  const user = await queryOne(
    `INSERT INTO users (full_name, email, password_hash, role, department, srn, semester)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING user_id, full_name, email, role`,
    [
      text(body.fullName, 'Full name', { min: 2, max: 100 }),
      text(body.email, 'Email', { max: 120 }).toLowerCase(),
      await hashPassword(text(body.password, 'Password', { min: 8, max: 200 })),
      role,
      text(body.department ?? 'CSE', 'Department', { max: 60 }),
      optionalText(body.srn, 'SRN', 13)?.toUpperCase() ?? null,
      optionalInt(body.semester, 'Semester'),
    ],
  );
  return ok({ user }, 201);
});
