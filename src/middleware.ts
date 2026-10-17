import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession, type Role } from '@/lib/jwt';

// Page-level role rules. API routes re-check roles on the server with requireUser().
const ROLE_RULES: Array<{ prefix: string; roles: Role[] }> = [
  { prefix: '/admin/audit', roles: ['ADMIN', 'FACULTY'] },
  { prefix: '/admin', roles: ['ADMIN'] },
  { prefix: '/matches', roles: ['STUDENT'] },
  { prefix: '/profile', roles: ['STUDENT'] },
  { prefix: '/teams/new', roles: ['STUDENT'] },
  { prefix: '/capstones/new', roles: ['STUDENT'] },
];

const AUTH_PAGES = ['/login', '/register'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const user = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (AUTH_PAGES.includes(pathname)) {
    return user ? NextResponse.redirect(new URL('/dashboard', req.url)) : NextResponse.next();
  }
  if (pathname === '/') return NextResponse.next();

  if (!user) {
    const login = new URL('/login', req.url);
    login.searchParams.set('next', pathname);
    return NextResponse.redirect(login);
  }

  const rule = ROLE_RULES.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
  if (rule && !rule.roles.includes(user.role)) {
    return NextResponse.redirect(new URL('/dashboard?denied=1', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
