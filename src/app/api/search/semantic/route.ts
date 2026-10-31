import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { ApiError, handler, ok, oneOf } from '@/lib/http';
import { matchFilter, searchByText, type CollectionKey } from '@/lib/vector';

const TYPES = ['teams', 'capstones', 'students'] as const;
const COLLECTION_FOR: Record<(typeof TYPES)[number], CollectionKey> = {
  teams: 'teams',
  capstones: 'capstones',
  students: 'profiles',
};

// SQL that resolves Qdrant hit ids back to full rows, keeping Qdrant's ranking order
const RESOLVE_SQL: Record<(typeof TYPES)[number], string> = {
  teams: `SELECT o.team_id AS id, o.name AS title, o.category, o.status, o.event_title, o.description,
                 o.member_count, o.max_members, o.required_skills, hit.pos
            FROM UNNEST($1::INT[]) WITH ORDINALITY AS hit(id, pos)
            JOIN v_team_overview o ON o.team_id = hit.id
           ORDER BY hit.pos`,
  capstones: `SELECT c.capstone_id AS id, c.title, c.domain, c.status, c.abstract, c.tech_stack,
                     c.proposer_name, c.proposer_id, hit.pos
                FROM UNNEST($1::INT[]) WITH ORDINALITY AS hit(id, pos)
                JOIN v_capstone_overview c ON c.capstone_id = hit.id
               ORDER BY hit.pos`,
  students: `SELECT p.user_id AS id, p.full_name AS title, p.email, p.department, p.semester, p.bio, p.skills, hit.pos
               FROM UNNEST($1::INT[]) WITH ORDINALITY AS hit(id, pos)
               JOIN v_student_profiles p ON p.user_id = hit.id
              ORDER BY hit.pos`,
};

/**
 * GET /api/search/semantic?q=...&type=teams|capstones|students[&onlyRecruiting=1][&limit=10]
 * 1. embed the query text (MiniLM, 384-d)  2. cosine kNN in Qdrant  3. resolve ids in PostgreSQL
 */
export const GET = handler(async (req) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length < 3) throw new ApiError(400, 'Type at least 3 characters to search');
  if (q.length > 2000) throw new ApiError(400, 'Query is too long');
  const type = oneOf(url.searchParams.get('type') ?? 'teams', 'type', TYPES);
  const limit = Math.min(Number(url.searchParams.get('limit')) || 10, 25);

  const filter =
    type === 'teams' && url.searchParams.get('onlyRecruiting') === '1' ? matchFilter('status', 'RECRUITING') : undefined;
  const hits = await searchByText(COLLECTION_FOR[type], q, { limit, filter });
  const scores = new Map(hits.map((h) => [h.id, h.score]));

  let rows = await query<{ id: number; status?: string; proposer_id?: number }>(RESOLVE_SQL[type], [hits.map((h) => h.id)]);
  if (type === 'capstones' && user.role === 'STUDENT') {
    // rejected / draft pitches stay private to their proposer
    rows = rows.filter((r) => r.status === 'APPROVED' || r.status === 'SUBMITTED' || r.proposer_id === user.id);
  }

  return ok({
    query: q,
    type,
    metric: 'cosine',
    results: rows.map((r) => ({ ...r, score: Number((scores.get(r.id) ?? 0).toFixed(4)) })),
  });
});
