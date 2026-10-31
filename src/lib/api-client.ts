'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SessionUser } from './jwt';

/** Browser-side helper: every page talks to PostgreSQL/Qdrant only through /api routes. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function api<T = any>(url: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const hasBody = options.body !== undefined;
  const res = await fetch(url, {
    method: options.method ?? (hasBody ? 'POST' : 'GET'),
    headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
    body: hasBody ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

/** Loads JSON from an API route; `reload()` re-fetches after a mutation. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useApi<T = any>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(url));

  const reload = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    setError(null);
    try {
      setData(await api<T>(url));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload };
}

/** The logged-in user (role decides which controls a page shows; the API enforces it). */
export function useMe(): SessionUser | null {
  const { data } = useApi<{ user: SessionUser }>('/api/auth/me');
  return data?.user ?? null;
}
