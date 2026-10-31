'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { Role, SessionUser } from '@/lib/jwt';

const LINKS: Array<{ href: string; label: string; roles?: Role[] }> = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/events', label: 'Events' },
  { href: '/teams', label: 'Teams' },
  { href: '/matches', label: 'Matches', roles: ['STUDENT'] },
  { href: '/capstones', label: 'Capstones' },
  { href: '/profile', label: 'Profile', roles: ['STUDENT'] },
  { href: '/admin/users', label: 'Users', roles: ['ADMIN'] },
  { href: '/admin/teams', label: 'Moderation', roles: ['ADMIN'] },
  { href: '/admin/audit', label: 'Audit log', roles: ['ADMIN', 'FACULTY'] },
];

function initials(name: string): string {
  return name
    .replace(/^(Dr|Prof)\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}

export default function Navbar({ user }: { user: SessionUser | null }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-paper/90 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 sm:px-6">
        <Link href={user ? '/dashboard' : '/'} className="display shrink-0 text-2xl text-ink" aria-label="PESU-Sync home">
          PESU<span className="text-pine-600">-</span>Sync
        </Link>

        {user && (
          <div className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto text-[15px] [scrollbar-width:none]">
            {LINKS.filter((l) => !l.roles || l.roles.includes(user.role)).map((l) => {
              const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? 'page' : undefined}
                  className={`shrink-0 rounded-md px-2.5 py-1.5 font-medium transition-colors duration-150 ${
                    active ? 'nav-active text-ink' : 'text-slate-600 hover:bg-slate-100 hover:text-ink'
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </div>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-3 text-sm">
          {user ? (
            <>
              <span className="hidden items-center gap-2 sm:flex" title={`${user.name} (${user.role.toLowerCase()})`}>
                <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-xs font-bold text-paper">
                  {initials(user.name)}
                </span>
                <span className="leading-tight">
                  <span className="block font-semibold text-ink">{user.name}</span>
                  <span className="block text-xs text-slate-500">{user.role.charAt(0) + user.role.slice(1).toLowerCase()}</span>
                </span>
              </span>
              <button
                onClick={logout}
                className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 transition hover:border-ink hover:text-ink active:scale-[0.97]"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="font-medium text-slate-700 transition-colors hover:text-ink">
                Log in
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-pine-600 px-3.5 py-2 font-semibold text-white transition hover:bg-pine-700 active:scale-[0.97]"
              >
                Create student account
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
