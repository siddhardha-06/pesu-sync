import { requireUser } from '@/lib/auth';
import { query, withTransaction } from '@/lib/db';
import { ApiError, handler, ok, oneOf, optionalInt, optionalText, readJson, text } from '@/lib/http';
import { searchByText, syncVectorsSafe } from '@/lib/vector';

const MODES = ['keyword', 'semantic', 'hybrid'] as const;
const STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'] as const;

type Row = { capstone_id: number; [key: string]: unknown };

// Students see submitted/approved pitches + their own; faculty/admin see everything.
const VISIBLE = `($1::TEXT <> 'STUDENT' OR o.status IN ('SUBMITTED', 'APPROVED') OR o.proposer_id = $2)`;
const FILTERS = `($3::TEXT IS NULL OR o.domain = $3) AND ($4::TEXT IS NULL OR o.status = $4) AND ($5::INT IS NULL OR o.proposer_id = $5)`;

/**
 * GET /api/capstones?q=&mode=keyword|semantic|hybrid&domain=&status=&mine=1
 *  keyword  -> PostgreSQL full-text search (GIN index, ts_rank_cd, ts_headline)
 *  semantic -> Qdrant cosine kNN on MiniLM embeddings of title+abstract
 *  hybrid   -> Reciprocal Rank Fusion of both ranked lists
 */
export const GET = handler(async (req) => {
  const me = await requireUser();
  const p = new URL(req.url).searchParams;
  const q = p.get('q')?.trim() || null;
  const mode = oneOf(p.get('mode') ?? 'keyword', 'mode', MODES);
  const status = p.get('status') ? oneOf(p.get('status'), 'status', STATUSES) : null;
  const base = [me.role, me.id, p.get('domain') || null, status, p.get('mine') === '1' ? me.id : null];

  const domains = await query<{ domain: string }>('SELECT DISTINCT domain FROM capstone_projects ORDER BY domain');

  if (!q) {
    const results = await query(
      `SELECT o.* FROM v_capstone_overview o WHERE ${VISIBLE} AND ${FILTERS} ORDER BY o.submitted_at DESC`,
      base,
    );
    return ok({ mode: 'list', results, domains: domains.map((d) => d.domain) });
  }

  const keyword = async () =>
    query<Row>(
      `SELECT o.*, f.rank, f.snippet
         FROM fn_search_capstones($6, 50) f
         JOIN v_capstone_overview o ON o.capstone_id = f.capstone_id
        WHERE ${VISIBLE} AND ${FILTERS}
        ORDER BY f.rank DESC`,
      [...base, q],
    );

  const semantic = async () => {
    const hits = await searchByText('capstones', q, { limit: 20 });
    const scores = new Map(hits.map((h) => [h.id, h.score]));
    const rows = await query<Row>(
      `SELECT o.*
         FROM UNNEST($6::INT[]) WITH ORDINALITY AS hit(capstone_id, pos)
         JOIN v_capstone_overview o ON o.capstone_id = hit.capstone_id
        WHERE ${VISIBLE} AND ${FILTERS}
        ORDER BY hit.pos`,
      [...base, hits.map((h) => h.id)],
    );
    return rows.map((r) => ({ ...r, similarity: Number((scores.get(r.capstone_id) ?? 0).toFixed(4)) }));
  };

  if (mode === 'keyword') return ok({ mode, results: await keyword(), domains: domains.map((d) => d.domain) });
  if (mode === 'semantic') return ok({ mode, results: await semantic(), domains: domains.map((d) => d.domain) });

  // hybrid: RRF score = sum over lists of 1 / (60 + rank)
  const [kw, sem] = await Promise.all([keyword(), semantic()]);
  const fused = new Map<number, Row & { rrf: number }>();
  [kw, sem].forEach((list) =>
    list.forEach((row, i) => {
      const prev = fused.get(row.capstone_id);
      fused.set(row.capstone_id, { ...(prev ?? {}), ...row, rrf: (prev?.rrf ?? 0) + 1 / (60 + i + 1) });
    }),
  );
  const results = [...fused.values()].sort((a, b) => b.rrf - a.rrf);
  return ok({ mode, results, domains: domains.map((d) => d.domain) });
});

/** POST /api/capstones — a student pitches an idea (optionally for a team they belong to). */
export const POST = handler(async (req) => {
  const me = await requireUser('STUDENT');
  const body = await readJson(req);
  const title = text(body.title, 'Title', { min: 5, max: 150 });
  const abstract = text(body.abstract, 'Abstract', { max: 5000 });

  const created = await withTransaction(
    async (client) => {
      const { rows } = await client.query<{ capstone_id: number }>(
        `INSERT INTO capstone_projects (title, abstract, domain, tech_stack, proposer_id, team_id, mentor_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING capstone_id`,
        [
          title,
          abstract,
          text(body.domain, 'Domain', { max: 40 }),
          optionalText(body.techStack, 'Tech stack', 255),
          me.id,
          optionalInt(body.teamId, 'Team'),
          optionalInt(body.mentorId, 'Mentor'),
        ],
      );
      return rows[0];
    },
    { actorId: me.id },
  );
  if (!created) throw new ApiError(500, 'Could not create the pitch');

  await syncVectorsSafe('capstones', [created.capstone_id]);
  return ok({ capstone: created }, 201);
});
