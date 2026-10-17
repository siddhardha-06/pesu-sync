import { compare, hash } from 'bcryptjs';
import { cookies } from 'next/headers';
import { queryOne } from './db';
import { ApiError } from './http';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, verifySession, type Role, type SessionUser } from './jwt';

export type { Role, SessionUser };

export const MAX_FAILED_LOGINS = 5;

export function hashPassword(password: string): Promise<string> {
  return hash(password, 10);
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return compare(password, passwordHash);
}

/** Decodes the session cookie (no DB hit). Used by layouts for the navbar. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

/**
 * Backend authorization for every protected API route.
 * The JWT proves identity; the user row is re-read from PostgreSQL so that
 * deactivation or a role change by an admin takes effect immediately.
 */
export async function requireUser(...roles: Role[]): Promise<SessionUser> {
  const session = await getSessionUser();
  if (!session) throw new ApiError(401, 'Please log in first');

  const row = await queryOne<{ full_name: string; email: string; role: Role; is_active: boolean }>(
    'SELECT full_name, email, role, is_active FROM users WHERE user_id = $1',
    [session.id],
  );
  if (!row || !row.is_active) throw new ApiError(401, 'Your account is inactive');

  const user: SessionUser = { id: session.id, name: row.full_name, email: row.email, role: row.role };
  if (roles.length > 0 && !roles.includes(user.role)) {
    throw new ApiError(403, `Only ${roles.join(' / ')} users can do this`);
  }
  return user;
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: SESSION_TTL_SECONDS,
};
