import { NextResponse } from 'next/server';
import { MAX_FAILED_LOGINS, sessionCookieOptions, verifyPassword } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { ApiError, handler, readJson, text } from '@/lib/http';
import { SESSION_COOKIE, signSession, type Role } from '@/lib/jwt';

interface LoginRow {
  user_id: number;
  full_name: string;
  email: string;
  role: Role;
  password_hash: string;
  is_active: boolean;
  failed_logins: number;
}

export const POST = handler(async (req) => {
  const body = await readJson(req);
  const email = text(body.email, 'Email', { max: 120 }).toLowerCase();
  const password = text(body.password, 'Password', { max: 200 });

  const user = await queryOne<LoginRow>(
    `SELECT user_id, full_name, email, role, password_hash, is_active, failed_logins
       FROM users WHERE email = $1`,
    [email],
  );
  if (!user) throw new ApiError(401, 'Invalid email or password');
  if (!user.is_active) throw new ApiError(403, 'This account has been deactivated by an admin');
  if (user.failed_logins >= MAX_FAILED_LOGINS) {
    throw new ApiError(423, 'Account locked after too many failed attempts. Ask an admin to unlock it.');
  }

  if (!(await verifyPassword(password, user.password_hash))) {
    await query('UPDATE users SET failed_logins = failed_logins + 1 WHERE user_id = $1', [user.user_id]);
    throw new ApiError(401, 'Invalid email or password');
  }

  await query('UPDATE users SET last_login_at = NOW(), failed_logins = 0 WHERE user_id = $1', [user.user_id]);

  const session = { id: user.user_id, name: user.full_name, email: user.email, role: user.role };
  const res = NextResponse.json({ user: session });
  res.cookies.set(SESSION_COOKIE, await signSession(session), sessionCookieOptions);
  return res;
});
