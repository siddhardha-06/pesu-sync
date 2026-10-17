// JWT helpers. Uses only `jose`, so it also runs in the Edge middleware.
import { SignJWT, jwtVerify } from 'jose';

export type Role = 'STUDENT' | 'FACULTY' | 'ADMIN';

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export const SESSION_COOKIE = 'pesu_session';
export const SESSION_TTL_SECONDS = 8 * 60 * 60;
const ISSUER = 'pesu-sync';

function secretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set in .env (at least 32 characters)');
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ name: user.name, email: user.email, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user.id))
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { issuer: ISSUER, algorithms: ['HS256'] });
    return {
      id: Number(payload.sub),
      name: String(payload.name),
      email: String(payload.email),
      role: payload.role as Role,
    };
  } catch {
    return null;
  }
}
