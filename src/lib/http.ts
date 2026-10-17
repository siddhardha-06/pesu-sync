import { NextResponse } from 'next/server';

/** An error with an HTTP status, thrown by route handlers and helpers. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Code words raised by our PL/pgSQL triggers/procedures -> HTTP status
const DB_RAISE_STATUS: Record<string, number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  NOT_STUDENT: 403,
  IMMUTABLE: 403,
  TEAM_FULL: 409,
  TEAM_CLOSED: 409,
  ALREADY_IN_TEAM: 409,
  ALREADY_MEMBER: 409,
  INVALID_STATE: 409,
  DEADLINE_PASSED: 409,
  TEAM_TOO_SMALL: 409,
  TEAM_TOO_LARGE: 400,
  INVALID_SIZE: 400,
  INVALID_LEADER: 400,
  INVALID_MENTOR: 400,
};

// Friendly messages for named constraints (database-level validation)
const CONSTRAINT_MESSAGES: Record<string, string> = {
  uq_users_email: 'An account with this email already exists',
  uq_users_srn: 'An account with this SRN already exists',
  chk_users_email_campus: 'Students must use <srn>@stu.pes.edu (e.g. pes1ug24am186@stu.pes.edu); faculty/admins use @pes.edu',
  chk_users_email_lower: 'Email must be lower-case',
  chk_users_srn_format: 'SRN must look like PES1UG24CS123',
  chk_users_student_info: 'Students must provide an SRN and semester',
  chk_users_semester: 'Semester must be between 1 and 8',
  chk_users_name: 'Name must have at least 2 characters',
  chk_user_skills_proficiency: 'Skill proficiency must be between 1 and 5',
  chk_past_projects_url: 'Project URL must start with http:// or https://',
  uq_events_title_start: 'An event with this title and start date already exists',
  chk_events_dates: 'End date must be on/after start date, and registration must close by the end date',
  chk_events_sizes: 'Team sizes must be between 1 and 10 with min <= max',
  uq_teams_event_name: 'A team with this name already exists in this event',
  chk_teams_desc: 'Team description must be at least 20 characters',
  chk_teams_size: 'A team must allow between 2 and 10 members',
  chk_teams_category: 'Unknown team category',
  uq_jr_one_pending: 'You already have a pending request for this team',
  uq_capstone_title: 'A capstone pitch with this title already exists',
  uq_capstone_team: 'This team already has a capstone pitch',
  chk_capstone_abstract: 'The abstract must be at least 50 characters',
  chk_capstone_feedback: 'Feedback is required when rejecting a pitch',
  chk_team_messages_body: 'Message cannot be empty',
};

interface PgLikeError {
  code?: string;
  constraint?: string;
  message: string;
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status });
}

export function toErrorResponse(error: unknown): Response {
  if (error instanceof ApiError) return json({ error: error.message }, error.status);

  const pg = error as PgLikeError;
  if (pg && typeof pg.code === 'string') {
    const constraintMsg = pg.constraint ? CONSTRAINT_MESSAGES[pg.constraint] : undefined;
    switch (pg.code) {
      case 'P0001': {
        // RAISE EXCEPTION 'CODE_WORD: human message'
        const idx = pg.message.indexOf(':');
        const word = idx > 0 ? pg.message.slice(0, idx).trim() : '';
        const message = idx > 0 ? pg.message.slice(idx + 1).trim() : pg.message;
        return json({ error: message, code: word || undefined }, DB_RAISE_STATUS[word] ?? 400);
      }
      case '23505': // unique_violation
        return json({ error: constraintMsg ?? 'Duplicate value', constraint: pg.constraint }, 409);
      case '23514': // check_violation
      case '23502': // not_null_violation
        return json({ error: constraintMsg ?? pg.message, constraint: pg.constraint }, 400);
      case '23503': // foreign_key_violation
        return json({ error: constraintMsg ?? 'Referenced record does not exist', constraint: pg.constraint }, 400);
      case '22001': // string too long
      case '22003': // numeric out of range
      case '22007': // invalid datetime
      case '22008':
      case '22P02': // invalid text representation
        return json({ error: `Invalid input: ${pg.message}` }, 400);
    }
  }
  console.error(error);
  return json({ error: 'Internal server error' }, 500);
}

/** Wraps a route handler so thrown ApiErrors / PostgreSQL errors become JSON responses. */
export function handler<C>(fn: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      return await fn(req, ctx);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

// ---------------------------------------------------------------------
// Light request parsing. Business rules live in the database
// (constraints + triggers); these only reject malformed input early.
// ---------------------------------------------------------------------
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  throw new ApiError(400, 'Request body must be a JSON object');
}

export function text(value: unknown, field: string, opts: { min?: number; max?: number } = {}): string {
  if (typeof value !== 'string') throw new ApiError(400, `${field} is required`);
  const v = value.trim();
  if (v.length < (opts.min ?? 1)) throw new ApiError(400, `${field} must be at least ${opts.min ?? 1} characters`);
  if (opts.max && v.length > opts.max) throw new ApiError(400, `${field} must be at most ${opts.max} characters`);
  return v;
}

export function optionalText(value: unknown, field: string, max = 5000): string | null {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) return null;
  return text(value, field, { max });
}

export function int(value: unknown, field: string, opts: { min?: number; max?: number } = {}): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n)) throw new ApiError(400, `${field} must be an integer`);
  if (opts.min !== undefined && n < opts.min) throw new ApiError(400, `${field} must be >= ${opts.min}`);
  if (opts.max !== undefined && n > opts.max) throw new ApiError(400, `${field} must be <= ${opts.max}`);
  return n;
}

export function optionalInt(value: unknown, field: string, opts: { min?: number; max?: number } = {}): number | null {
  if (value === undefined || value === null || value === '') return null;
  return int(value, field, opts);
}

export function intList(value: unknown, field: string): number[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ApiError(400, `${field} must be an array`);
  return value.map((v) => int(v, field, { min: 1 }));
}

export function oneOf<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new ApiError(400, `${field} must be one of ${allowed.join(', ')}`);
  }
  return value as T;
}

export function dateStr(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(400, `${field} must be a date (YYYY-MM-DD)`);
  }
  return value;
}

/** Parses a positive integer id from a dynamic route segment. */
export function idParam(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, 'Invalid id');
  return n;
}
