import { NextResponse } from 'next/server';
import { hashPassword, sessionCookieOptions } from '@/lib/auth';
import { withTransaction } from '@/lib/db';
import { ApiError, handler, int, optionalText, readJson, text } from '@/lib/http';
import { SESSION_COOKIE, signSession } from '@/lib/jwt';

/**
 * Self-registration is for STUDENTS only. Faculty and admin accounts are
 * created by an admin (see /api/admin/users).
 * The user row and the user's skills are inserted in ONE transaction.
 */
export const POST = handler(async (req) => {
  const body = await readJson(req);
  const fullName = text(body.fullName, 'Full name', { min: 2, max: 100 });
  const srn = text(body.srn, 'SRN', { max: 13 }).toUpperCase();
  // Students are always <srn>@stu.pes.edu; chk_users_email_campus rejects anything else
  const email = (typeof body.email === 'string' && body.email.trim() ? body.email.trim() : `${srn}@stu.pes.edu`).toLowerCase();
  const password = text(body.password, 'Password', { min: 8, max: 200 });
  const semester = int(body.semester, 'Semester');
  const department = text(body.department ?? 'CSE', 'Department', { max: 60 });
  const bio = optionalText(body.bio, 'Bio', 2000);

  const skills = Array.isArray(body.skills) ? body.skills : [];
  const skillRows = skills.map((s: { skillId?: unknown; proficiency?: unknown }) => ({
    skill_id: int(s.skillId, 'skillId', { min: 1 }),
    proficiency: int(s.proficiency ?? 3, 'proficiency'),
  }));
  if (skillRows.length > 25) throw new ApiError(400, 'Pick at most 25 skills');

  const passwordHash = await hashPassword(password);

  const user = await withTransaction(async (client) => {
    const { rows } = await client.query<{ user_id: number; full_name: string; email: string }>(
      `INSERT INTO users (full_name, email, password_hash, role, srn, department, semester, bio)
       VALUES ($1, $2, $3, 'STUDENT', $4, $5, $6, $7)
       RETURNING user_id, full_name, email`,
      [fullName, email, passwordHash, srn, department, semester, bio],
    );
    const created = rows[0];
    if (skillRows.length > 0) {
      await client.query(
        `INSERT INTO user_skills (user_id, skill_id, proficiency)
         SELECT $1, s.skill_id, s.proficiency
           FROM jsonb_to_recordset($2::jsonb) AS s(skill_id INT, proficiency SMALLINT)`,
        [created.user_id, JSON.stringify(skillRows)],
      );
    }
    return created;
  });

  const session = { id: user.user_id, name: user.full_name, email: user.email, role: 'STUDENT' as const };
  const res = NextResponse.json({ user: session }, { status: 201 });
  res.cookies.set(SESSION_COOKIE, await signSession(session), sessionCookieOptions);
  return res;
});
