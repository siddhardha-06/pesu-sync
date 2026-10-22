// Helpers for in-process route-handler tests (used by the coverage suite).
import '../../scripts/load-env';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { queryOne } from '../../src/lib/db';
import { signSession, type Role } from '../../src/lib/jwt';

declare global {
  // eslint-disable-next-line no-var
  var __testCookies: Record<string, string> | undefined;
}

export interface TestUser {
  user_id: number;
  full_name: string;
  email: string;
  role: Role;
}

/** Act as the user with this email for the following route calls. */
export async function as(email: string): Promise<TestUser> {
  const u = await queryOne<TestUser>('SELECT user_id, full_name, email, role FROM users WHERE email = $1', [email]);
  if (!u) throw new Error(`no such user ${email}`);
  globalThis.__testCookies = {
    pesu_session: await signSession({ id: u.user_id, name: u.full_name, email: u.email, role: u.role }),
  };
  return u;
}

export function anon() {
  globalThis.__testCookies = {};
}

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

export async function call(
  fn: unknown,
  opts: { url?: string; method?: string; body?: unknown; params?: Record<string, string> } = {},
) {
  const hasBody = opts.body !== undefined;
  const req = new Request(opts.url ?? 'http://test.local/api', {
    method: opts.method ?? (hasBody ? 'POST' : 'GET'),
    headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
    body: hasBody ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)) : undefined,
  });
  const res = await (fn as Handler)(req, { params: Promise.resolve(opts.params ?? {}) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json().catch(() => ({}));
  return { status: res.status, data, res };
}

export const STUDENT = 'pes1ug23cs101@stu.pes.edu'; // Aarav
export const LEADER = 'pes1ug23cs104@stu.pes.edu'; // Ananya, leads CampusEats AI
export const FACULTY = 'kavya.rao@pes.edu';
export const FACULTY2 = 'arjun.mehta@pes.edu';
export const ADMIN = 'admin@pes.edu';

/** Tiny local HTTP server standing in for PESUAuth / pes.edu in tests. */
export async function mockServer(
  handle: (req: IncomingMessage, body: string, res: ServerResponse) => void,
): Promise<{ url: string; close: () => Promise<void>; server: Server }> {
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    handle(req, body, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    server,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}
