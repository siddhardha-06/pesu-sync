import { ApiError } from './http';

/**
 * Client for PESUAuth (https://github.com/pesu-dev/auth), the open-source API that checks
 * an SRN/PRN and password against PESU Academy. PESU-Sync never stores the password: it is
 * forwarded once over HTTPS and discarded. Set PESU_AUTH_URL to a self-hosted instance
 * (docker compose --profile pesu-auth up -d) so the password only ever reaches PESU Academy.
 */
const DEFAULT_URL = 'https://pesuauth.onrender.com';

// Only what PESU-Sync needs (no email, phone or date of birth)
const FIELDS = ['name', 'srn', 'branch', 'branchShortCode', 'semester', 'campus'] as const;

export interface PesuProfile {
  name: string | null;
  srn: string | null;
  branch: string | null;
  branchShortCode: string | null;
  semester: string | null;
  campus: string | null;
}

export async function authenticateWithPesu(username: string, password: string): Promise<PesuProfile> {
  const base = (process.env.PESU_AUTH_URL || DEFAULT_URL).replace(/\/+$/, '');
  // the hosted instance sleeps when idle; the first request can take close to a minute
  const timeout = Number(process.env.PESU_AUTH_TIMEOUT_MS ?? 70_000);

  let res: Response;
  try {
    res = await fetch(`${base}/authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username, password, profile: true, fields: FIELDS }),
      signal: AbortSignal.timeout(timeout),
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(502, 'PESU Academy could not be reached. Try again, or log in with your PESU-Sync password.');
  }

  const body = (await res.json().catch(() => null)) as { status?: boolean; message?: string; profile?: PesuProfile } | null;
  if (res.ok && body?.status && body.profile) return body.profile;
  if (res.status === 401) throw new ApiError(401, 'PESU Academy did not accept that SRN and password.');
  if (res.status === 400) throw new ApiError(400, body?.message ?? 'Enter your SRN or PRN and your PESU Academy password.');
  throw new ApiError(502, 'PESU Academy is not responding right now. Try again, or log in with your PESU-Sync password.');
}

/** "P MANAS SIDDHARDHA" -> "P Manas Siddhardha" */
export function titleCaseName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** "Sem-5" / "5" -> 5 (clamped to 1..8) */
export function parseSemester(value: string | null): number | null {
  const n = Number(value?.match(/\d+/)?.[0]);
  return Number.isInteger(n) && n >= 1 && n <= 8 ? n : null;
}
