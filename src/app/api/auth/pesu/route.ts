import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { hashPassword, sessionCookieOptions } from '@/lib/auth';
import { queryOne, withTransaction } from '@/lib/db';
import { ApiError, handler, readJson, text } from '@/lib/http';
import { SESSION_COOKIE, signSession, type Role } from '@/lib/jwt';
import { authenticateWithPesu, parseSemester, titleCaseName } from '@/lib/pesu-auth';

interface UserRow {
  user_id: number;
  full_name: string;
  email: string;
  role: Role;
  is_active: boolean;
}

/**
 * POST /api/auth/pesu { username, password }
 * Log in with PESU Academy. The SRN returned by PESU Academy is the identity:
 *   - an existing PESU-Sync student with that SRN is signed in (and marked PESU-verified)
 *   - otherwise a student account is created from the PESU Academy profile, in one transaction
 */
export const POST = handler(async (req) => {
  const body = await readJson(req);
  const username = text(body.username, 'SRN or PRN', { max: 96 });
  const password = text(body.password, 'Password', { max: 128 });

  const profile = await authenticateWithPesu(username, password);
  const srn = profile.srn?.trim().toUpperCase();
  if (!srn) {
    throw new ApiError(403, 'PESU Academy sign-in is for students. Faculty and admins log in with their PESU-Sync password.');
  }

  let created = false;
  let user = await queryOne<UserRow>(
    `UPDATE users
        SET pesu_verified_at = NOW(), last_login_at = NOW(), failed_logins = 0
      WHERE srn = $1 AND role = 'STUDENT'
      RETURNING user_id, full_name, email, role, is_active`,
    [srn],
  );

  if (user && !user.is_active) throw new ApiError(403, 'This account has been deactivated by an admin');

  if (!user) {
    // Random password: this account signs in through PESU Academy only
    const unusableHash = await hashPassword(randomBytes(32).toString('hex'));
    user = await withTransaction(async (client) => {
      const { rows } = await client.query<UserRow>(
        `INSERT INTO users (full_name, email, password_hash, role, srn, department, semester,
                            auth_provider, pesu_verified_at, last_login_at)
         VALUES ($1, $2, $3, 'STUDENT', $6, $4, $5, 'PESU', NOW(), NOW())
         RETURNING user_id, full_name, email, role, is_active`,
        [
          titleCaseName(profile.name ?? srn),
          `${srn.toLowerCase()}@stu.pes.edu`,
          unusableHash,
          (profile.branchShortCode || profile.branch || 'CSE').slice(0, 60),
          parseSemester(profile.semester) ?? 1,
          srn,
        ],
      );
      return rows[0];
    });
    created = true;
  }

  const session = { id: user.user_id, name: user.full_name, email: user.email, role: user.role };
  const res = NextResponse.json({ user: session, created }, { status: created ? 201 : 200 });
  res.cookies.set(SESSION_COOKIE, await signSession(session), sessionCookieOptions);
  return res;
});
