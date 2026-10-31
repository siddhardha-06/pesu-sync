'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Button } from '@/components/ui';
import { api } from '@/lib/api-client';

type Method = 'pesu' | 'password';

export default function LoginPage() {
  const router = useRouter();
  const [method, setMethod] = useState<Method>('pesu');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function switchTo(next: Method) {
    setMethod(next);
    setError(null);
    setPassword('');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result =
        method === 'pesu'
          ? await api('/api/auth/pesu', { body: { username, password } })
          : await api('/api/auth/login', { body: { email: username, password } });
      const next = new URLSearchParams(window.location.search).get('next');
      router.push(result.created ? '/profile?welcome=1' : next && next.startsWith('/') ? next : '/dashboard');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-12 py-4 md:grid-cols-[1fr_1.1fr] md:items-start">
      <div>
        <h1 className="display text-5xl text-ink sm:text-6xl">Log in</h1>
        <p className="mt-4 max-w-sm text-slate-600">
          Students can sign in straight from PESU Academy. Your first sign-in creates your PESU-Sync account from your
          PESU Academy profile.
        </p>
        <p className="mt-6 text-sm text-slate-600">
          Prefer a separate password?{' '}
          <Link href="/register" className="font-semibold text-pine-700 underline decoration-pine-200 underline-offset-4 hover:decoration-pine-600">
            Create an account with your PESU email
          </Link>
        </p>
      </div>

      <form onSubmit={submit} className="space-y-5 rounded-lg border border-slate-200 bg-white p-6">
        <div role="tablist" aria-label="Sign-in method" className="relative grid grid-cols-2 rounded-md bg-slate-100 p-1 text-sm font-semibold">
          <span
            aria-hidden
            className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded bg-white shadow-sm transition-transform duration-300 ease-[cubic-bezier(.2,.7,.2,1)]"
            style={{ transform: method === 'pesu' ? 'translateX(0)' : 'translateX(100%)' }}
          />
          {(['pesu', 'password'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={method === m}
              onClick={() => switchTo(m)}
              className={`relative z-10 rounded py-2 transition-colors duration-200 ${method === m ? 'text-ink' : 'text-slate-500 hover:text-ink'}`}
            >
              {m === 'pesu' ? 'PESU Academy' : 'PESU-Sync password'}
            </button>
          ))}
        </div>

        {error && <Alert key={error}>{error}</Alert>}

        <div key={method} className="anim-pop space-y-5">
          <div>
            <label className="label" htmlFor="username">{method === 'pesu' ? 'SRN or PRN' : 'Email'}</label>
            <input
              id="username"
              className="input"
              type={method === 'pesu' ? 'text' : 'email'}
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={method === 'pesu' ? 'PES1UG24AM186' : 'pes1ug24am186@stu.pes.edu'}
            />
          </div>
          <div>
            <label className="label" htmlFor="password">{method === 'pesu' ? 'PESU Academy password' : 'Password'}</label>
            <input id="password" className="input" type="password" autoComplete="current-password" required value={password}
              onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" disabled={busy} className="w-full py-2.5">
            {busy ? (method === 'pesu' ? 'Checking with PESU Academy…' : 'Logging in…') : method === 'pesu' ? 'Log in with PESU Academy' : 'Log in'}
          </Button>
          {method === 'pesu' ? (
            <p className="text-xs leading-relaxed text-slate-500">
              Your password goes to PESU Academy through{' '}
              <a href="https://github.com/pesu-dev/auth" target="_blank" rel="noreferrer" className="underline underline-offset-2">PESUAuth</a>{' '}
              (open source, by pesu-dev) and is never stored by PESU-Sync. The first sign-in can take up to a minute.
            </p>
          ) : (
            <p className="text-xs text-slate-500">Faculty and admins sign in here with their @pes.edu account.</p>
          )}
        </div>
      </form>
    </div>
  );
}
